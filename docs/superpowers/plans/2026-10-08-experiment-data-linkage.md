# Experiment Data Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve authoritative assignment and experiment-session identity in every formal trial backup, archive trial and final submissions together, and audit legacy records without guessing participant numbers.

**Architecture:** The runner passes one experiment identity into each trial save. The receiver accepts a v2 submission with an explicit trial/final kind, verifies it against its assignment table, and groups it by the experiment session while retaining each trial's own session ID. A separate read-only audit reports historical matches and completion states.

**Tech Stack:** TypeScript, Vitest, Python standard library `unittest`, SQLite, existing `lz-string` package.

**Spec:** `docs/superpowers/specs/2026-10-08-experiment-data-linkage-design.md`

**Current acceptance (2026-10-09 repair): local receiver/audit acceptance complete.** All four reproduced defects and three follow-up audit gaps are fixed; final independent review has no Important/Critical findings. Final focused suite is 127/127, WSL receiver 58/58; type/build/release validator pass. Repository-wide tests remain 626 passed/7 failed from untouched tutorial asset/lock discrepancies, including failures beyond CRLF proved in a temporary canonical-byte copy. No deployment or repository-wide green claim. See `docs/superpowers/verification/2026-10-09-experiment-data-linkage-repair.md`.

## Global Constraints

- Formal assignment comes only from `/assign`; `participant_number` and `sequence_id` must never be inferred from one another.
- V2 trial and final submissions use the same experiment-level `session_id`; the per-trial result keeps `trial_session_id`.
- Preserve v1 receiver submissions and backup decoding; no rewrite or deletion of historical files.
- Final CSV column order and Williams schedule contents remain unchanged.
- `archive_status` and experiment completion are separate states; count 25 distinct valid formal presentation positions, not uploaded files.
- Preserve unrelated untracked files; do not modify the live VPS as part of local code work.
- Workers edit only their assigned files and report test commands/results; no commits unless the user requests a checkpoint.

## Review Focus

- A replacement participant has `participant_number != sequence_id`; tests must assert the exact returned pair survives trial and final outputs.
- A repeated v2 trial with the same encoded result is idempotent; the same `trial_session_id` with different encoded data is a conflict.
- A v2 request whose top-level identity disagrees with its backup JSON or final CSV identity columns is rejected before indexing or archiving.
- `retry_pending()` may archive and delete a trial's spool before `/archive`; a later final archive must still succeed.
- A tutorial-only final archive is not a completed 25-trial experiment.
- A v1 record without a unique final-row match must remain unlinked and session-unknown even when its presentation reveals a sequence or the participant has 25 trial backups.

---

### Task 1: Client trial and final identity

**Files:**
- Modify: `src/types/runtime.ts`
- Modify: `src/experiment-runner.ts`
- Modify: `src/core/data-save-service.ts`
- Test: `src/experiment-runner.test.ts`
- Test: `src/core/data-save-service.test.ts`

**Interfaces:**
- `RuntimeReceiverSaveConfig` gains experiment-level `session_id` and an optional `assignment` using existing `ExperimentAssignmentMetadata` for formal mode.
- `buildExperimentTimeline` receives the already bootstrapped experiment session ID; `createRunnableExperiment` passes it into the timeline.
- Formal single-trial `DataSaveService.save` writes `layouttask.backup.v2`, then posts `layouttask.receiver.submission.v2` with `submission_kind: "trial"`, `session_id` equal to the experiment session, `trial_session_id` equal to `payload.result.session`, and all assignment fields. Tutorial trials have no `presentation_id` or formal index.
- Formal `saveExperimentFiles` posts `layouttask.receiver.submission.v2` with `submission_kind: "final"` and the same assignment/session identity; debug and standalone paths stay v1.

- [x] **Step 1: Add focused failing tests.** Assert exact metadata and the two session IDs in the stored envelope and receiver request, including participant 47 assigned sequence 6, tutorial absence of presentation, and final v2 batch.
- [x] **Step 2: Run `npx vitest run src/core/data-save-service.test.ts src/experiment-runner.test.ts` and record the failures.**
- [x] **Step 3: Thread the existing assignment projection and experiment session through the runner's save config.** Derive trial position from `payload.result.presentation`; keep the existing per-trial filename identity.
- [x] **Step 4: Re-run the focused tests and `npx tsc --noEmit`.** Verify standalone/debug v1 behavior and final CSV field order still pass.

### Task 2: Receiver v2 identity, idempotency, and mixed-state archive

**Files:**
- Modify: `receiver/app/models.py`
- Modify: `receiver/app/storage.py`
- Modify: `receiver/app/server.py`
- Modify: `receiver/README.md`
- Test: `receiver/tests/test_models.py`
- Test: `receiver/tests/test_storage.py`
- Test: `receiver/tests/test_server.py`

**Interfaces:**
- `validate_submission` accepts v1 unchanged and v2 with `submission_kind`, assignment fields, experiment `session_id`, and `trial_session_id` for trials; final submissions reject trial-only fields.
- `ReceiverStorage.save_submission` validates v2 assignment values against SQLite and binds the first valid `participant_id` to `assignment_id`; repeated identities must match. Before storage, trial backup JSON and final `session.csv`/`raw_results.csv` identity columns must agree with the request. Nullable v2 columns are added to `submissions` and manifest/JSONL output.
- One trial identity `(experiment_id, participant_id, session_id, trial_session_id)` maps to one encoded-result SHA-256. Same result returns the stored submission; different result returns a typed conflict. Final batch repeats are similarly idempotent by content.
- `archive_session` skips already archived submissions per target, reads spool only for outstanding submissions, and preserves the existing archive path layout.

- [x] **Step 1: Add failing model/storage/server tests.** Cover v1 compatibility, valid automatic and replacement v2, mismatched assignment fields and participant binding, trial JSON/final CSV identity mismatches, duplicate same/different trial, duplicate final, and missing trial-only/final-only metadata.
- [x] **Step 2: Add a regression test that archives a trial via `retry_pending()` (deleting spool), then posts and archives the final batch for that session.** Assert both files are archived and `/archive` succeeds on repeat.
- [x] **Step 3: Run `python -m unittest discover -s tests -p 'test_*.py'` from `receiver/`; record baseline platform failures separately from new failures.** WSL: 55 tests, OK.
- [x] **Step 4: Implement the schema migration, v2 validation/binding/dedup, and per-target mixed-state archive behavior; update receiver docs.** Full assignment comparison and post-I/O current-session status query repaired; v1 rows preserved. UTF-8 byte writer matches stored SHA on Windows too.
- [x] **Step 5: Re-run focused `test_models.py`, `test_storage.py`, `test_server.py` with `unittest`, then all receiver tests where the platform permits.** Frozen-source native storage 33/33, native handler 2/2, full WSL 58/58. Native network resets remain an explicit environment limitation.

### Task 3: Legacy linkage and completion audit

**Files:**
- Create: `tools/decoder/audit-legacy-submissions.ts`
- Test: `tools/decoder/audit-legacy-submissions.test.ts`
- Modify: `receiver/README.md` only after Task 2 has finished editing it, if command usage belongs there.

**Interfaces:**
- A read-only CLI accepts a receiver data directory, one or more local exported-archive directories, and the published schedule JSON. It reads v1/v2 spool manifests/envelopes and final `raw_results.csv`, writes its JSON report to stdout, and never edits inputs.
- Output is session-level `tutorial_only | partial | formal_25_final_missing | complete` only where the experiment session is proven, plus archive status; unmatched v1 trials are `session_unknown` and per-trial linkage is `unique | ambiguous | unmatched` with evidence. Match only on participant ID, trial session ID, hash, task and presentation; resolve participant number only through a unique final row with assignment fields.

- [x] **Step 1: Add synthetic fixtures/tests for tutorial-only, v2 partial, v2 25 distinct trials without final, complete final, repeated task, ambiguous matches, and 25 v1 trials with unknown experiment session/participant number.**
- [x] **Step 2: Run `npx vitest run tools/decoder/audit-legacy-submissions.test.ts` and confirm intended failures.**
- [x] **Step 3: Implement the CLI with existing CSV/decoder utilities and `lz-string`; preserve unknown values instead of guessing.** Current exact-matched JSONL provenance, full-file SHA enforcement and malformed/conflicting evidence regressions are implemented.
- [x] **Step 4: Re-run its tests and `npx tsc --noEmit`; document the read-only invocation.** Frozen-source audit 66/66 plus native integration 1/1, type check passed; README updated.

### Task 4: Integrated verification and handoff

**Files:**
- Modify only tests or docs necessary to resolve a concrete integration mismatch between Tasks 1–3.

**Interfaces:**
- One end-to-end fixture passes a v2 automatic and a replacement assignment through the client payload shape, receiver validation, archive grouping, and completion classification.

- [x] **Step 1: Review the combined diff against the spec and reconcile field names/types across TypeScript and Python.** All four findings and follow-up gaps repaired; independent scoped re-review accepts final frozen receiver/audit source. Repository-wide material acceptance and production rollout remain separate.
- [x] **Step 2: Run focused frontend and receiver suites, then `npm test` and `npm run build`.** Focused audit/integration: 26 passed; WSL receiver: 55 passed; full npm: 585 passed/7 baseline asset-lock failures; build and release validation passed.
- [x] **Step 3: Run `git diff --check`, inspect changed paths, and report exact verified behavior, baseline failures, and any live-deployment steps still pending.** Evidence is recorded in `docs/superpowers/verification/2026-10-08-experiment-data-linkage.md`.
