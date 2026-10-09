# Experiment Data Linkage Verification

**Latest status — 2026-10-09 after authorized repairs:** The four findings below and three follow-up audit gaps are now fixed and independently accepted locally. Final client/audit/integration 127/127, WSL receiver 58/58, native storage 33/33 and native handler 2/2; type/build/release validator pass. Full frontend remains 626 passed/7 failed. The earlier CRLF-only baseline explanation is superseded: a canonical temporary copy exposed existing generation-report/manifest and preview PNG lock mismatches even at HEAD. Original assets/locks and historical data remain untouched. No repository-wide green status or deployment is claimed. Authoritative final evidence: `docs/superpowers/verification/2026-10-09-experiment-data-linkage-repair.md`. All older failures/verdicts below are preserved as historical evidence.

Date: 2026-10-08. Worktree: `C:/Users/tianf/.codex/worktrees/experiment-data-linkage/LayoutTask_Player`.

## Scope and implementation paths

This verification covers the implementation paths from Tasks 1–4:

- Client identity producers: `src/types/runtime.ts`, `src/experiment-runner.ts`, `src/core/data-save-service.ts`, and their focused tests.
- Receiver v2 validation/storage/archive: `receiver/app/models.py`, `receiver/app/storage.py`, `receiver/app/server.py`, and `receiver/tests`.
- Read-only audit: `tools/decoder/audit-legacy-submissions.ts` and `tools/decoder/audit-legacy-submissions.test.ts`.
- Cross-layer integration: `tools/decoder/data-linkage-integration.test.ts`.

The detailed recheck edits only this report, the implementation plan, and the progress ledger. No implementation source, asset lock, production configuration, commit, deployment, VPS, or live archive remote was changed. Existing worktree changes were preserved. An independent read-only reviewer was requested for the recheck; its verdict is recorded separately below.

## Detailed recheck (2026-10-09)

The following are fresh command results from the existing local implementation. They supersede the historical failed runs below, without deleting those runs.

| Check | Command | Result |
| --- | --- | --- |
| Frontend full suite | `npm test -- --reporter=dot` | Exit 1; 585 passed / 7 failed, 64 passing files / 2 failing files. All affected client (15 + 45), audit (25), and cross-layer integration (1) tests passed. |
| Receiver full suite, WSL Ubuntu | `python3 -m unittest discover -s tests -p "test_*.py" -q` in the WSL worktree receiver directory | Exit 0; 55 tests in 14.592s, OK. Includes HTTP fixtures, storage, cross-process archive/retry locking, and recovery. |
| Receiver full suite, Windows bundled Python | `C:\Users\tianf\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m unittest discover -s tests -p 'test_*.py' -q` from `receiver` | Exit 1; 55 tests in 14.894s, 5 errors, all HTTP `ConnectionResetError: [WinError 10054]`. The earlier recheck run had 8 such errors; the count varies. |
| Type check | `npx tsc --noEmit` | Exit 0. |
| Build | `npm run build` | Exit 0; 99 modules transformed, new `dist` produced. |
| Web release validation | `npm run validate:web-release` after the successful build | Exit 0; `{"ok":true,"failures":[]}`. |

### Seven frontend failures: baseline byte evidence

All seven failures name `assets/backgrounds/room_scene_0001_bg.svg`: two in `src/core/tutorial-package.test.ts`, five in `tools/generator/compile-batch.test.ts`.

- Lock SHA-256 and `git show HEAD:public/layout-task-tutorial/assets/backgrounds/room_scene_0001_bg.svg`: `009c7e8ba86eeb2b701398cab275123787ee5ef0862f24f434bd29b6136c442f`.
- Windows worktree byte SHA-256: `9d4340185db4972a31d17da3c8dadd233eecd2d9a3cd6c4030da9089ddbc3661`.
- In-memory CRLF-to-LF normalization gives the locked SHA and is byte-identical to the HEAD blob; `core.autocrlf=true`, and the asset has empty `git status --porcelain` output.
- No asset or lock was rewritten. The suite is not entirely green; the evidence establishes an unrelated checkout newline mismatch rather than a linkage regression.

### Requirement coverage

| Contract | Inspected code / passing evidence |
| --- | --- |
| Participant number and sequence stay separate | Runner assignment projection, client backup/final request, receiver assignment query; cross-layer test checks automatic `(1, 6)` and replacement `(2, 7)`, focused client tests also cover replacement `(47, 6)`. |
| One experiment session, distinct trial sessions | Client v2 envelope/request and final CSV; integration asserts both IDs survive and are unequal. |
| Assigned position is checked | Client rejects missing session and mismatched expected presentation; audit compares presentation ID, index and task to the assigned schedule. |
| File identity agrees with receiver request | Receiver checks assignment fields against SQLite, participant binding, trial JSON and final CSV identity columns; mismatch tests pass. |
| Retry and duplicate safety | Storage tests cover same/different trial content, duplicate final, cross-process publication and archive locks, JSONL repair, and partial-target retries. |
| Final archive after trial spool deletion | Integration actually calls `retry_pending`, observes empty/deleted spool, then submits and archives the final batch; receiver regression tests pass. |
| Completion counts positions, not uploads | Audit and integration exercise tutorial-only, partial, 25 distinct positions without final, and a single complete 25-position final; duplicate tasks/positions and pooled partial finals do not manufacture completion. |
| Legacy uncertainty and read-only behavior | Audit tests retain `session_unknown` for 25 unlinked v1 backups, ambiguous matches remain ambiguous, and the real CLI leaves all input bytes unchanged. |

Windows HTTP resets remain an unresolved platform-specific verification limitation: WSL success does not establish the precise Windows reset cause. The WSL Node attempt recorded earlier was blocked by missing `@rollup/rollup-linux-x64-gnu` in shared Windows `node_modules`; dependencies were not reinstalled. Windows provided the complete frontend/type/build evidence above.

### Independent review verdict: not ready for closure

Reviewer `Mill` (`01a11d93-aeae-7383-8acc-9b64c79f7239`) returned four concrete reproductions. The owner checked the relevant code paths and accepts the following findings. No fixes were made in this documentation-only recheck. Passing existing suites do not cover these cases.

1. **P1 — Wrong-assignment deduplication acknowledgment.** `receiver/app/storage.py:267` selects existing submissions by experiment/participant/session/kind/trial session and compares encoded-content SHA plus trial fields, but never compares `ASSIGNMENT_FIELDS`. Each request can validate against a different valid assignment and still reuse the original submission ID. The reviewer submitted identical content for `P47/S1/T1` under two valid assignments and observed `duplicate=true`, the same submission ID, requested participant number `2`, stored participant number `1`. Acceptance of the second request is misleading; there is no evidence the original record was overwritten. Required regression: conflicting assignment IDs/fields for an existing trial must be rejected, while an exact repeat stays idempotent.
2. **P2 — Session archive success only covers the initial snapshot.** `receiver/app/storage.py:335` snapshots submission IDs under the publication lock, releases that lock for archive I/O, and at line 373 computes success from those IDs. Same-session submission publication does not take the session archive lock. The blocking-backend reproduction accepted `T2` while `T1` was archiving, then returned `archive_ok=true`, `archive_status=archived` while `T2` remained `pending`; backend calls included only `T1`. The previous ledger explicitly accepted a late submission being picked up by a later retry. That preserves recoverability but does not justify reporting the entire current session as archived. No data loss was demonstrated. Required regression: exercise this exact interleaving and define/report archive coverage accurately without blocking unrelated sessions.
3. **P2 — Audit trusts stale archive-time status.** `tools/decoder/audit-legacy-submissions.ts:71` uses manifest/file status; receiver manifests are created with file status `pending`, and later archive success updates receiver indexes rather than the copied manifest. The real receiver fixture had JSONL statuses `[archived, archived]` while audit returned `archive_state=pending`, `status=complete`, `issues=[]`. Completion and archive state remain distinct, but the latter is wrong. Required regression: audit an actual successfully archived receiver fixture and reconcile status against available authoritative receiver evidence.
4. **P1 — Manifest full-file checksum is recorded but not enforced.** The audit hashes source bytes for its report at line 134, but never compares them with `manifest.files[].sha256`. Final-row validation at line 119 checks an encoder-view `hash8`, which can omit events. The reviewer changed a formal row's event timestamp from `100` to `200` in an archived final CSV while leaving its manifest checksum unchanged. Although the full-file checksum no longer matched, audit returned `complete`, 25 formal/final positions, and no issue. This is a missing use of an existing full-file integrity reference, separate from the documented limitation of transport hashes. Required regression: a manifest SHA mismatch must produce an integrity issue and withhold the affected file from verified linkage/completion counts, preserving its original evidence.

No client identity propagation or receiver v1-preservation defect was found in this bounded review. Real network retry timing and external archive backends were not exercised. The local implementation remains uncommitted and undeployed; receiver/audit acceptance and integrated closure are reopened until these findings are addressed and tested.

## Final verification update (2026-10-09)

The overlapping Task 3 edits were reconciled. The duplicate full-result comparison was removed; the audit now verifies final CSV hashes against the four supported encoder views and preserves a valid v2 backup identity when a tampered final row is rejected.

- `npx vitest run tools/decoder/audit-legacy-submissions.test.ts tools/decoder/data-linkage-integration.test.ts`: exit 0, **26/26 passed**.
- `npx tsc --noEmit`: exit 0.
- `npm run build`: exit 0; Vite produced `dist` successfully.
- `npm run validate:web-release`: exit 0, `{"ok":true,"failures":[]}`.
- `npm test`: exit 1, **585 passed / 7 failed**. All seven failures are the pre-existing Windows tutorial asset-lock mismatch for `assets/backgrounds/room_scene_0001_bg.svg`; no audit, client, receiver, or integration test failed.
- WSL receiver suite remains **55/55 passed** from the fresh run recorded below; receiver source was unchanged afterward.
- `git diff --check`: exit 0 apart from normal LF-to-CRLF warnings.

The earlier 85/1 failure and TypeScript errors below are preserved as chronology from before reconciliation, not current status.

## Historical commands and exact results (before reconciliation)

### Focused frontend, audit, integration, and type check

Command:

`npx vitest run src/core/data-save-service.test.ts src/experiment-runner.test.ts tools/decoder/audit-legacy-submissions.test.ts tools/decoder/data-linkage-integration.test.ts --reporter verbose`

Result: exit 1, **85 passed / 1 failed** across 4 files. The client tests and integration passed; the one failure is the audit regression `withholds a changed final result when its hash8 matches a v2 backup`. Expected `linkage: unmatched`, `participant_number: null`; received `linkage: unique`, `participant_number: 47`.

The integration test itself passed: **1/1**, including actual automatic `(participant 1, sequence 6)` and replacement `(participant 2, sequence 7)` assignments, Python stdin/stdout receiver storage/archive, final submit followed by explicit archive, duplicate final idempotency, and read-only audit.

Command:

`npx tsc --noEmit`

Result: exit 1. Errors:

- `tools/decoder/audit-legacy-submissions.ts(309,59): error TS18047: 'backup.result' is possibly 'null'.`
- `tools/decoder/audit-legacy-submissions.ts(309,85): error TS18047: 'final.result' is possibly 'null'.`

These were real audit-source errors in that historical run. The later reconciliation and fresh recheck above supersede them; the current type check passes.

### Full npm test

Command: `npm test`

Result: exit 1, **584 passed / 8 failed** across 66 files. Seven failures are the known Windows baseline tutorial asset-lock failures, all reporting `Locked file sha256 changed: assets/backgrounds/room_scene_0001_bg.svg`: 2 in `src/core/tutorial-package.test.ts` and 5 in `tools/generator/compile-batch.test.ts`. No asset or lock change was made.

The eighth failure is the audit regression described above. The full run also confirms `tools/decoder/data-linkage-integration.test.ts` passed.

### Build and web-release validation

Command: `npm run build`

Result: exit 1 at the initial TypeScript step, with the same two nullable-result errors at `tools/decoder/audit-legacy-submissions.ts:309`. Vite build and asset copy did not run.

`npm run validate:web-release` was not run because the required build dependency failed and no valid new `dist` result was produced. This is a concrete blocker, not a skipped assertion.

### Receiver WSL full suite

Command:

`wsl -d Ubuntu -- bash -lc 'cd /mnt/c/Users/tianf/.codex/worktrees/experiment-data-linkage/LayoutTask_Player/receiver && python3 -m unittest discover -s tests -p "test_*.py" -q'`

Result: exit 0, **Ran 55 tests in 14.903s; OK**. This historical WSL result includes the local socket fixture tests and is corroborated by the fresh 14.592s recheck above. It exercises the local receiver test fixture, not production deployment.

### Diff and scope checks

The requested scoped whitespace check passed for the Task 4 files. The integration file is untracked and visible (`git check-ignore` exits 1); no ignore rule was added. No commit was created. The verification document itself and plan/progress documentation are documentation-only updates for this evidence task.

## Limitations and rollout notes

- The known Windows baseline has 7 tutorial package asset-lock SHA failures. The locked asset and lock were not modified.
- The historical audit regression and nullable-result errors have been reconciled; affected tests and the current type check pass. This detailed recheck changed no implementation source.
- Four newly reproduced review findings above remain unresolved. Existing test success and successful builds do not establish acceptance of those edge cases; this is not a release-ready conclusion.
- The transport hash checks the producer's encoded transport view. `final-only` omits events and `relative` omits absolute poses/counts, so changes to those omitted values cannot be detected by that transport hash alone. It is an integrity comparison, not proof of authenticity. Backup encoded payload hashes remain directly verified.
- Legacy records without a unique final-row identity match remain `session_unknown`/unknown rather than being guessed from sequence, filename, count, or timing.
- Receiver-first rollout and a controlled live verification remain pending. Local affected tests, type check, build and release validation pass; the full frontend suite still has seven proven newline-related failures, and native Windows HTTP tests still encounter resets.
- Live deployment, remote archive targets, and commit/push were not performed.

## Plan/progress status

- Task 1: existing client checks pass; no additional producer defect found in this review.
- Task 2: reopened for wrong-assignment deduplication and archive snapshot/status handling; WSL existing suite remains 55/55 passing.
- Task 3: reopened for stale archive-state reporting and unenforced manifest checksums; existing audit tests and type check pass.
- Task 4: detailed review/test execution is recorded, but combined acceptance is not complete. Build and release validation pass; known Windows failures and missing regressions remain explicit.
- Reviewer verdict: four unresolved findings, two P1 and two P2. Prior reconciliation fixed the earlier hash/type-check failure, not these newly reproduced gaps.
