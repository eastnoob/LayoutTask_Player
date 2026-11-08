# VPS Finalization and Archive Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the receiver report a session complete only after durable local validation, then let the background worker publish that complete session to Nutstore and Sciebo.

**Architecture:** Keep the existing v2 submission routes, SQLite/JSONL/spool persistence, per-submission archive layout, and IndexedDB recovery. Add a durable receiver-side finalization row and validator. Reuse /archive as a fast local finalization-and-queue endpoint, make the worker select only finalized sessions, and make the browser change only its invisible final timeout and response check.

**Tech Stack:** Python standard library, SQLite, Python unittest, TypeScript, Vitest, Vite, existing receiver container and archive backends.

**Spec:** docs/superpowers/specs/2026-11-08-vps-finalization-and-archive-gating-design.md

## Global Constraints

- Do not change tutorial, formal task, stimulus, scoring, timing, pause, magnifier, layout, visible copy, or page URLs.
- Preserve existing trial, tutorial, final CSV/JSON bytes, filenames, archive keys, and cloud directory structure.
- Keep immediate per-trial IndexedDB and VPS submission.
- Keep the existing per-trial request timeout and the 30-second worker scan interval.
- Use a 90-second timeout only for the final receiver batch and /archive request.
- Return data_complete=true only after VPS-local completeness validation succeeds.
- Nutstore and Sciebo failures must not change data_complete=true to false.
- Never clear local recovery data after a timeout or a response without data_complete=true.
- Missing schedule expectations fail closed; they cannot produce data_complete=true.
- Do not delete or rewrite historical submission rows during migration.

---

## Scope map

The implementation must reach these files and their callers:

- Modify: receiver/app/config.py for schedule-bound expected-count configuration.
- Modify: receiver/app/storage.py for the finalization table, validator, idempotent finalization, migration, and worker query.
- Modify: receiver/app/server.py for the existing /archive response contract.
- Modify: receiver/app/archive_worker.py only if the storage API needs an explicit finalized-session method.
- Modify: src/experiment-runner.ts for the invisible 90-second final transport timeout and data_complete response check.
- Preserve src/core/data-save-service.ts trial replay behavior; change it only if a separate final-versus-trial timeout must be represented there.
- Extend receiver/tests/test_storage.py, receiver/tests/test_data_pipe.py, and receiver/tests/test_server.py.
- Extend src/experiment-runner.test.ts for final response parsing and backup retention.
- Add configuration and rollout notes to receiver/README.md only after the implementation is validated.

The implementation must not touch tutorial/stimulus files or the visual UI components.

## Task 1: Add receiver schedule expectations and durable finalization schema

**Files:**

- Modify: receiver/app/config.py
- Modify: receiver/app/storage.py
- Test: receiver/tests/test_storage.py
- Test: receiver/tests/test_server.py

**Interfaces:**

- ReceiverConfig gains expected_formal_trial_count: int | None and require_tutorial: bool.
- ReceiverStorage stores one finalization row per experiment, participant, and session.
- New sessions begin in finalization_status=collecting and data_complete=0.

- [ ] Step 1: Write the failing configuration tests.

Add tests that load:

    ASSIGNMENT_SCHEDULE_VERSION=run41-williams-v1
    ASSIGNMENT_EXPECTED_FORMAL_TRIAL_COUNT=24
    ASSIGNMENT_REQUIRE_TUTORIAL=true

and assert the resulting ReceiverConfig contains 24 and True. Add tests for a missing or non-positive expected count.

- [ ] Step 2: Run the focused tests and verify failure.

Run:

    python -m unittest receiver.tests.test_storage receiver.tests.test_server -v

Expected result: the new configuration fields and finalization table assertions fail because they do not exist.

- [ ] Step 3: Add the minimal config parsing.

Use the existing environment parsing style. Reject a non-positive count during configuration loading with a clear ValueError. Keep the active schedule version as the binding identity; do not add a second assignment service.

- [ ] Step 4: Add the SQLite table and migration.

Create session_finalizations with the fields in the spec. Use a composite primary key on experiment_id, participant_id, and session_id. Add an index for worker selection on data_complete and archive_status.

When opening an existing database, create rows for pre-existing pending, partial, or failed submission groups with legacy_archive_eligible=1. New rows use legacy_archive_eligible=0. Do not mark a new session complete merely because it has old rows. Do not rewrite historical submission bytes or JSONL rows.

- [ ] Step 5: Create or refresh collecting state on accepted v2 submissions.

Inside the existing publication lock, insert a collecting row when the first v2 submission for a session is accepted. Later trial, metadata, and final submissions update updated_at but do not overwrite a completed finalization result.

- [ ] Step 6: Run the focused tests.

Run:

    python -m unittest receiver.tests.test_storage -v

Expected result: configuration parsing, table creation, restart reopening, and legacy migration tests pass.

- [ ] Step 7: Grill-me checkpoint and correction.

Check:

1. Can a new trial be selected by the worker before /archive? It must not; the row is collecting.
2. Can migration erase or renumber a historical submission? It must not; migration only adds control rows.
3. Can the expected count be silently defaulted? It must not; missing configuration remains unresolved.

If any answer is wrong, fix the schema or migration before starting Task 2.

- [ ] Step 8: Commit the isolated task.

Use:

    git add receiver/app/config.py receiver/app/storage.py receiver/tests/test_storage.py receiver/tests/test_server.py
    git commit -m "feat(receiver): persist session finalization state"

## Task 2: Implement local completeness validation and idempotent finalization

**Files:**

- Modify: receiver/app/storage.py
- Test: receiver/tests/test_storage.py
- Test: receiver/tests/test_data_pipe.py

**Interfaces:**

- Add a SessionCompleteness dataclass containing data_complete, finalization_status, error, expected_formal_trial_count, trial_indices, presentation_ids, and submission_ids.
- Add ReceiverStorage.validate_session_completeness(experiment_id, participant_id, session_id) -> SessionCompleteness.
- Add ReceiverStorage.finalize_session(experiment_id, participant_id, session_id) -> a result carrying data_complete and archive_status.
- Developer-mode sessions use the same configured formal count and tutorial rule; only their isolated identity validation differs.

- [ ] Step 1: Write failing validator tests.

Cover these exact cases:

1. Metadata plus all expected formal trials plus final returns complete.
2. One missing formal trial returns incomplete.
3. A repeated trial_index or presentation_id returns incomplete.
4. A missing tutorial when required returns incomplete.
5. A conflicting assignment or session identity returns incomplete.
6. A malformed final CSV returns incomplete.
7. Missing expected-count configuration returns needs_recovery/incomplete.
8. A repeated finalization call returns the same stored result.

- [ ] Step 2: Run the focused tests and verify failure.

Run:

    python -m unittest receiver.tests.test_storage receiver.tests.test_data_pipe -v

Expected result: the validator and finalization methods are absent or return the old archive-only behavior.

- [ ] Step 3: Implement validation from durable receiver state.

Query v2 submissions by session. Require exactly one metadata and one final submission. For formal trials, require trial_index values equal to set(range(1, expected_count + 1)), unique trial_session_id values, and unique non-empty presentation_id values. Parse the final session and raw-results CSV content and compare the identity and formal trial indices to the accepted trial rows.

Use existing content hashes and local_path/spool checks. If a required byte source is missing, return a recovery result; never infer completeness from row metadata alone.

- [ ] Step 4: Implement the idempotent finalization transaction.

Under the publication lock:

    if stored finalization is complete:
        return the stored data_complete=true result
    result = validate_session_completeness(...)
    persist result and compact manifest_json
    if result is complete:
        set data_complete=1 and archive_status=pending
    else:
        set data_complete=0 and retain the reason
    return the persisted result

Do not call a cloud backend from this method.

- [ ] Step 5: Run the validator tests.

Run:

    python -m unittest receiver.tests.test_storage receiver.tests.test_data_pipe -v

Expected result: all completeness, idempotency, restart, and byte-preservation cases pass.

- [ ] Step 6: Grill-me checkpoint and correction.

Check:

1. Does the validator use configured expected count rather than final CSV row count? If not, fix it.
2. Can a duplicate final request create a second final row? If not proven by the existing unique index and test, add the assertion.
3. Can a missing spool file pass because SQLite has a row? It must fail unless an already-recorded archive source is explicitly valid.
4. Can cloud code run while the publication lock is held? It must not.

- [ ] Step 7: Commit the isolated task.

Use:

    git add receiver/app/storage.py receiver/tests/test_storage.py receiver/tests/test_data_pipe.py
    git commit -m "feat(receiver): validate complete sessions before archive"

## Task 3: Change /archive to local finalization and restrict the worker

**Files:**

- Modify: receiver/app/server.py
- Modify: receiver/app/storage.py
- Modify: receiver/app/archive_worker.py only if needed
- Test: receiver/tests/test_server.py
- Test: receiver/tests/test_data_pipe.py

**Interfaces:**

- Keep POST /archive and schema layouttask.receiver.archive.v1.
- Successful response includes ok=true, data_complete=true, finalization_status=complete, and archive_status=pending or archived.
- Incomplete response includes ok=false, data_complete=false, finalization_status=incomplete or needs_recovery, and a stable error code.

- [ ] Step 1: Write failing HTTP and worker tests.

Add tests that:

1. POST /submit for a partial session, run retry_pending(), and assert no cloud backend call.
2. POST /archive for a complete session and assert it returns data_complete=true without entering a blocked archive backend.
3. Run the worker afterward and assert the configured targets receive the unchanged archive files.
4. POST /archive for an incomplete session and assert HTTP 409 with data_complete=false.
5. Repeat POST /archive and assert the same finalization result and no duplicate cloud upload.
6. Fail Nutstore while Sciebo succeeds and assert data_complete remains true and Sciebo is not retried.
7. Restart the storage object after finalization and assert the worker resumes pending targets.

- [ ] Step 2: Run the focused tests and verify failure.

Run:

    python -m unittest receiver.tests.test_server receiver.tests.test_data_pipe -v

Expected result: current /archive behavior returns queued based on accepted rows and the worker archives incomplete sessions.

- [ ] Step 3: Route /archive through finalize_session.

Validate the existing archive request identity and assignment fields as currently required. Call finalize_session, return its data_complete and finalization status, and never invoke archive_session synchronously. Keep CORS, token, origin, rate-limit, and error handling unchanged.

- [ ] Step 4: Restrict retry_pending to finalized sessions.

Select new sessions from session_finalizations where data_complete=1, legacy_archive_eligible=0, and archive_status is not archived. Select migrated legacy rows through their legacy_archive_eligible=1 path so old pending data remains recoverable. After each target attempt, recompute and persist the session archive_status from all submission target states without changing data_complete. Keep the existing per-target archive_targets bookkeeping, spool deletion rule, and session locks.

- [ ] Step 5: Run the worker and server tests.

Run:

    python -m unittest receiver.tests.test_server receiver.tests.test_data_pipe receiver.tests.test_storage -v

Expected result: partial sessions remain local, complete sessions queue quickly, cloud publication is asynchronous, and per-target retry behavior remains idempotent.

- [ ] Step 6: Grill-me checkpoint and correction.

Check:

1. Does /archive wait on a cloud process or session network lock? It must return after local validation.
2. Does a worker upload an unfinalized new session? It must not.
3. Does a cloud failure change data_complete? It must not.
4. Does a legacy migration path preserve historical pending work? It must.

- [ ] Step 7: Commit the isolated task.

Use:

    git add receiver/app/server.py receiver/app/storage.py receiver/app/archive_worker.py receiver/tests/test_server.py receiver/tests/test_data_pipe.py receiver/tests/test_storage.py
    git commit -m "feat(receiver): queue cloud archive after local completion"

## Task 4: Update only the invisible client final transport

**Files:**

- Modify: src/experiment-runner.ts
- Test: src/experiment-runner.test.ts
- Modify: src/core/data-save-service.ts only if the implementation needs separate timeout names
- Test: src/core/data-save-service.test.ts only if that file changes

**Interfaces:**

- Final receiver batch timeout: 90_000 ms.
- Final /archive timeout: 90_000 ms.
- Existing per-trial upload and replay timeout: unchanged.
- saveExperimentFiles returns success only when the archive response JSON has data_complete === true.

- [ ] Step 1: Write failing client tests.

Add tests that:

1. Return HTTP success with data_complete=true and assert the local backup is cleared under the existing metadata condition.
2. Return HTTP success with data_complete=false and assert saveExperimentFiles returns failure and keeps the recovery files.
3. Return malformed JSON or a timeout and assert recovery ZIP creation remains active.
4. Assert the final batch and /archive calls receive a 90-second timeout without changing the trial replay timeout.
5. Assert the existing final filenames, request bodies, completion-code field, and developer-mode v2 identity format are unchanged.

- [ ] Step 2: Run the focused tests and verify failure.

Run:

    npm test -- --run src/experiment-runner.test.ts src/core/data-save-service.test.ts

Expected result: the current code treats any successful HTTP archive response as success and uses the old 30-second final timeout.

- [ ] Step 3: Implement the smallest transport change.

Keep the current final request order: retry locally backed-up receiver submissions with 15_000 ms, submit the final batch with a dedicated 90_000 ms final timeout, call /archive with the same 90_000 ms timeout, and then clear the local backup only after data_complete=true. Do not pass the 90-second final timeout into DataSaveService.

Do not edit CompletionCodeGate, tutorial markup, trial controls, or end-page text. The existing visible success page remains behind saveExperimentFiles() success.

- [ ] Step 4: Run the focused client tests.

Run:

    npm test -- --run src/experiment-runner.test.ts src/core/data-save-service.test.ts

Expected result: response gating, 90-second final timeout, unchanged trial behavior, unchanged bytes, and recovery behavior pass.

- [ ] Step 5: Grill-me checkpoint and correction.

Check:

1. Can an HTTP 200 response without data_complete=true clear IndexedDB? It must not.
2. Can the final timeout change trial replay behavior? It must not.
3. Can a response timeout after VPS commit create duplicate final data? The receiver idempotency test from Task 2 must prove no.
4. Did any visible UI, copy, task, or URL change? If yes, revert that part.

- [ ] Step 6: Commit the isolated task.

Use:

    git add src/experiment-runner.ts src/experiment-runner.test.ts src/core/data-save-service.ts src/core/data-save-service.test.ts
    git commit -m "fix(client): gate final success on receiver completeness"

## Task 5: Full regression, build, and package inspection

**Files:**

- Modify: receiver/README.md after implementation and validation only
- Test: existing receiver and frontend suites

- [ ] Step 1: Run all receiver tests.

Run:

    python -m unittest discover -s receiver/tests -p "test_*.py" -v

Expected result: PASS, including Windows JSONL replacement tests and archive retry tests.

- [ ] Step 2: Run all frontend tests and type checks.

Run:

    npm test
    npm run build

Expected result: PASS with no changes to visible experiment assets or page routes.

- [ ] Step 3: Validate the built package.

Run:

    npm run validate:web-release

Inspect the built JavaScript for the final timeout and confirm all existing assets are still present. Do not add or remove stimulus assets as part of this backend change.

- [ ] Step 4: Run a local end-to-end receiver test.

Use a temporary receiver with:

    expected formal count = 24
    tutorial required = true
    two local archive targets

Submit metadata, one tutorial, 24 formal trials, and final files. Confirm:

1. Each trial is accepted immediately.
2. retry_pending does not archive before finalization.
3. /archive returns data_complete=true quickly.
4. A blocked cloud target does not block /archive.
5. The worker later archives both targets and preserves every original file byte.

- [ ] Step 5: Grill-me final review and correction.

Review the spec and implementation against this exact list:

1. Missing trial cannot become complete.
2. Duplicate finalization is idempotent.
3. Cloud timeout cannot produce participant failure after local completion.
4. VPS restart preserves finalization and target progress.
5. Expected count is configured, schedule-bound, and fail-closed.
6. Existing bytes and archive paths are unchanged.
7. No visible frontend behavior changed.
8. No 10-second timeout or 30-second final timeout remains on the final path.

Fix any failed item before deployment.

- [ ] Step 6: Update operational documentation.

Document the exact Run 41 environment variables, expected count, tutorial requirement, response fields, local recovery behavior, and rollback command. Do not claim cloud archive success until the worker reports each target archived.

- [ ] Step 7: Commit the validated implementation.

Use:

    git add receiver/README.md docs/notes/2026-11-08-vps-first-finalization-and-archive-design.md docs/superpowers/specs/2026-11-08-vps-finalization-and-archive-gating-design.md docs/superpowers/plans/2026-11-08-vps-finalization-and-archive-gating.md
    git commit -m "docs: specify VPS finalization and asynchronous archive gating"

## Task 6: VPS rollout and static transport package release

This task is performed only after the implementation has passed Task 5 and the user authorizes deployment.

**Files and systems:**

- VPS receiver container and persistent data volume
- Static package repository for the current Chinese and English branches
- No history deletion or archive cleanup

- [ ] Step 1: Back up receiver configuration and database metadata.

Record the active container image, environment, SQLite file checksum, JSONL checksum, spool count, archive target configuration, and current health response. Store the backup outside the live data directory.

- [ ] Step 2: Validate configuration before restart.

Confirm schedule version, expected formal count, tutorial requirement, Nutstore target, and Sciebo target. Refuse rollout if expected count is missing or does not equal the published schedule.

- [ ] Step 3: Deploy the receiver with a rollback point.

Restart the receiver with the new image/code and persistent volume. Do not clear data. Confirm health, assignment, trial submit, and incomplete /archive responses before using a real participant URL.

- [ ] Step 4: Build and publish the transport-only static package.

Build both Chinese and English package branches from the same source revision. This package update is required for the 90-second final timeout and data_complete parsing, even though it has no visible UI changes.

- [ ] Step 5: Run one developer-mode and one controlled test session.

Verify identical trial and final formats, immediate VPS trial rows, no pre-final cloud archive for the new session, data_complete=true before success, and later two-target archive.

- [ ] Step 6: Roll back if any local completeness or persistence check fails.

Restore the previous receiver image/code and keep the database and spool untouched. Do not delete or rewrite participant data during rollback.

- [ ] Step 7: Grill-me deployment gate.

Deployment is blocked if any of these are unresolved: missing expected count, failed restart recovery, a new unfinalized session reaching cloud archive, an HTTP 200 without data_complete=true being treated as success, or a changed participant-facing UI.

## Local implementation status (2026-11-08)

- Tasks 1–5 are implemented and verified locally.
- Pixi receiver suite: 85 tests passed.
- Frontend source suite excluding temporary copies and the separately-run subprocess test: 804 tests passed, 12 skipped.
- TS→Python receiver integration: passed with the Pixi Python executable.
- Run 41 static package build and closure validation: passed with `ok: true`.
- VPS rollout and static repository publication remain Task 6 and were not performed.

## Plan self-review

### Spec coverage

- Durable state and restart recovery: Tasks 1 and 2.
- Expected formal count and tutorial requirement: Tasks 1 and 2.
- Local validator and manifest: Task 2.
- Idempotent /archive contract: Tasks 2 and 3.
- Worker restriction and cloud retry isolation: Task 3.
- 90-second final timeout and backup safety: Task 4.
- No visible frontend change and unchanged bytes: Tasks 4 and 5.
- Windows JSONL reliability: Task 5.
- VPS and static release checks: Task 6.

### Placeholder scan

No TODO, TBD, “handle appropriately”, or unspecified validation step is left in the plan. Every implementation task names its files, interface, tests, expected result, and commit boundary.

### Type and status consistency

The same names are used throughout: collecting, complete, incomplete, needs_recovery, pending, partial, archived, failed, data_complete, finalization_status, archive_status, and ASSIGNMENT_EXPECTED_FORMAL_TRIAL_COUNT.

### Scope correction

The first design wording could have been read as requiring the visible completion-code page to move. That would conflict with the no-visible-frontend requirement and the existing final CSV completion_code field. The corrected plan keeps that page and file field unchanged; only the final transport result gates the existing successful end page.

### Execution handoff

Plan complete and saved to docs/superpowers/plans/2026-11-08-vps-finalization-and-archive-gating.md. Two execution options:

1. Subagent-driven development (recommended): dispatch a fresh worker per task and review after each task.
2. Inline execution: execute the tasks in this session with checkpoints.
