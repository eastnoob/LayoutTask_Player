# Experiment Data Linkage Repair Implementation Plan

> **For agentic workers:** Use Superpowers systematic-debugging and test-driven-development. Execute the two disjoint repair packages with the previously authorized self-directed-delegated-workflow; perform one independent final review. Steps use checkbox syntax for tracking.

**Goal:** Correct the four reproduced receiver/audit defects without altering experiment materials or historical data.

**Architecture:** Keep the existing receiver publication/session locks and v1/v2 contracts. Compare full assignment metadata when deduplicating; establish archive outcome from current session rows under the publication lock after I/O. Audit the receiver's current JSONL index as status evidence and enforce existing manifest SHA-256 before using file contents as verified evidence.

**Tech Stack:** Python standard library/SQLite/unittest; existing TypeScript, Vitest, csv-parse and Node crypto. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-08-experiment-data-linkage-design.md`; reproduced findings in `docs/superpowers/verification/2026-10-08-experiment-data-linkage.md`.

**Final status (2026-10-09):** Local receiver/audit repair accepted after red/green tests and Newton's independent scoped re-review. All checkmarks below record executed repair/validation work, not repository-wide green or deployment approval. Focused 127/127, WSL receiver 58/58; type/build/release validator pass. Original and canonical temporary-copy full npm remain 626/7 due to untouched tutorial asset/lock inconsistencies, including HEAD discrepancies beyond CRLF. Native socket resets remain documented. Final evidence: `docs/superpowers/verification/2026-10-09-experiment-data-linkage-repair.md`.

## Global Constraints

- `participant_number` and `sequence_id` are independent; never infer either.
- Preserve v1 compatibility and all original files/rows. Uniquely unproven legacy linkage remains `session_unknown`.
- Work in the existing isolated worktree; preserve existing uncommitted implementation.
- No VPS, production configuration, remote archives, asset/lock edits, commits or pushes.
- The user explicitly requested complete implementation, so continue through planning, fixes and verification without another authorization gate.
- Blender scene/MCP constraints do not apply to this receiver/data-audit repair; do not operate Blender.

## Review Focus

- Another valid assignment for the same trial identity must yield `submission_conflict`, not a successful duplicate; unchanged retry timestamps remain permissible.
- Same-session publication during archive I/O must affect the reported result; unrelated sessions must remain able to publish.
- A later archive call must include pending late arrivals, and successfully archived targets must not be repeated.
- Current index evidence must match submission/file identity, must have visible provenance, and must not grant successful archive status to unrelated files or contradictory records.
- Changing bytes omitted by transport encoding must still fail manifest SHA-256; rejected final files must not supply verified counts or legacy associations.

## Task 1: Receiver deduplication and accurate archive outcome

**Files:** `receiver/app/storage.py`, `receiver/tests/test_storage.py`, `receiver/tests/test_server.py` if needed for HTTP behavior.

**Interfaces:** Preserve `ReceiverStorage.save_submission(...) -> StoredSubmission` and `archive_session(experiment_id, participant_id, session_id) -> SessionArchiveResult`. Existing HTTP mapping turns `ValidationError('submission_conflict', ...)` into 409. Preserve `_process_lock` session/publication lock order; no publication lock across archive I/O.

- [x] Add `test_v2_duplicate_rejects_different_valid_assignment`: two allocated valid assignments, same experiment/participant/session/trial/encoded data, internally consistent backups; second raises `submission_conflict`, one submission remains, original assignment binding/data unchanged, exact retry is duplicate.
- [x] Add a regression for differing persisted assignment fields and final metadata if content hash alone could mask a conflict; do not reject harmless `saved_at` changes.
- [x] Add `test_archive_session_reports_late_same_session_submission`: event-coordinated backend pauses I/O, another process accepts same-session submission, release backend; outcome is `ok=False`, `archive_status='partial'`, late submission stays recoverable. Second archive succeeds and skips already archived submission. Retain existing unrelated-session regression.
- [x] Run receiver targeted tests before repair and record expected assertion failures.
- [x] `_existing_v2` compares all `ASSIGNMENT_FIELDS`, plus trial fields for trials, alongside existing content digest. Keep current duplicate response shape.
- [x] Before reporting archive outcome, take publication lock and query current session IDs/statuses; include late arrivals in outcome. Return partial/pending as applicable with retry explanation instead of false success. Never drain in an unbounded loop or lock publication during external I/O.
- [x] Run `python -m unittest discover -s tests -p 'test_storage.py' -q`, then full WSL receiver suite. Run affected native Windows checks and report any unresolved fixture issue separately.
- [x] Write red/green evidence and changed paths in `docs/superpowers/verification/2026-10-09-receiver-repair.md`.

## Task 2: Audit status evidence and manifest integrity

**Files:** `tools/decoder/audit-legacy-submissions.ts`, `.test.ts`, `tools/decoder/data-linkage-integration.test.ts`.

**Interfaces:** Preserve `auditLegacySubmissions(options: AuditOptions)` and CLI. Read optional `receiverData/submissions.jsonl` without mutating inputs; attach source path/line provenance to state evidence. Resolve index by exact submission ID and corresponding file metadata, not directory naming or participant-number inference. Current matched receiver status takes precedence over archive-time manifest status. Manifest-only archives retain recorded fallback status with its provenance.

- [x] Add stale-manifest regression using latest receiver index and extend real receiver integration to assert `archive_state='archived'` after archive success (both automatic and replacement assignments).
- [x] Add regressions for unmatched/malformed/conflicting index evidence: emit issues and do not silently manufacture archived status.
- [x] Add checksum regression: valid 25-row final CSV plus manifest digest, change an event excluded from default encoder view; issue includes source/checksum mismatch, file supplies zero verified final positions and no legacy match. Test intact digest success.
- [x] Test changed backup bytes against manifest digest and handle declared missing/invalid digests visibly. Keep standalone legacy files without manifest usable under existing row/transport validation; do not claim full-file integrity where no reference exists.
- [x] Run targeted Vitest tests before implementation and record expected failures.
- [x] Hash original bytes with Node crypto; enforce declared manifest SHA-256 before parsing final rows or accepting backups. Preserve original files and source SHA records for rejected input. Apply status precedence only to matching index evidence.
- [x] Run `npx vitest run tools/decoder/audit-legacy-submissions.test.ts tools/decoder/data-linkage-integration.test.ts` and `npx tsc --noEmit`.
- [x] Write red/green evidence and changed paths in `docs/superpowers/verification/2026-10-09-audit-repair.md`.

## Task 3: Combined acceptance and honest closure

- [x] Review both worker diffs and evidence against all four findings and original six acceptance criteria.
- [x] Run final focused client/audit/integration tests and full frontend suite, type check, build then `validate:web-release`, plus receiver full WSL suite if final receiver state changed after worker evidence.
- [x] Preserve original tutorial assets/lock. If checkout CRLF alone blocks full suite, establish evidence and use an LF-clean temporary validation copy of the exact final sources; do not weaken lock verification or rewrite original assets.
- [x] Obtain fresh independent review of receiver/audit/integration final state; fix concrete in-scope findings with covering regressions and scoped re-review.
- [x] Update original plan/progress and verification conclusions only after evidence supports them. Distinguish local repair acceptance from receiver-first deployment and controlled live verification, which remain outside this authorization.
- [x] Stop after required checks/review support the result; no extra hardening, new infrastructure or repeated green checks.
