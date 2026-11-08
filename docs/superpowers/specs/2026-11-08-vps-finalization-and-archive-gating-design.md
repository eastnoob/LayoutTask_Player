# VPS Finalization and Archive Gating Design

**Status:** Implemented locally; VPS rollout and static publication remain separate authorized steps.

**Goal:** Make the VPS the authority for local data completeness before the participant is reported as successfully finished, while moving Nutstore and Sciebo upload out of the participant request path.

## Problem

The browser already saves each completed trial locally and sends it to the receiver. The receiver durably writes submissions, but the current final /archive flow can still be confused with cloud publication. When Nutstore or Sciebo is slow, a participant can receive a save failure even though the VPS already has the complete experiment. Conversely, treating any accepted final file as success would risk reporting success when a trial or metadata file is missing.

The required guarantee is therefore local and explicit:

    data_complete=true
      only after the VPS has durably stored and validated the complete session.

    archive_status
      describes the later Nutstore/Sciebo publication state.

Cloud publication is important for backup, but it must not decide whether the participant's VPS submission is complete.

## Observed current structure

- receiver/app/storage.py already persists accepted submissions in SQLite, JSONL, and per-submission spool directories.
- receiver/app/server.py accepts final files at /submit and currently uses /archive to queue archive work.
- receiver/app/archive_worker.py scans every 30 seconds.
- receiver/app/storage.py::retry_pending() currently discovers pending sessions from submission rows, so an unfinished session can enter cloud publication before the final completeness check.
- src/core/data-save-service.ts saves each trial to IndexedDB before sending it to the receiver and retries unacknowledged receiver submissions.
- src/experiment-runner.ts sends the final batch and then calls /archive. The final receiver and archive timeout currently default to 30 seconds.
- The existing archive key and file layout must stay:

    <experiment_id>/<participant_id>/<session_id>/<submission_id>/
    manifest.json
    f001__<filename>
    f002__<filename>

## Scope and non-goals

This change is limited to data transport, receiver persistence, finalization, and background archive scheduling.

- Do not change tutorial content, formal tasks, stimuli, scoring, timing, pause behavior, magnifier behavior, layout, visible copy, or page URLs.
- Do not change trial, tutorial, final CSV/JSON bytes, filenames, or archive directory keys.
- Do not add a second final file format.
- Do not make the browser wait for Nutstore or Sciebo.
- Do not delete local recovery data when the VPS has not positively returned data_complete=true.
- Do not change the 30-second archive worker scan interval.
- Do not change the existing per-trial request timeout unless a separate requirement is approved.

The static client may receive a transport-only build because it must understand the new response field and use the 90-second final request timeout. This is an invisible protocol change; it must not change the participant-facing UI or experiment behavior.

## Authoritative configuration

The receiver must know the expected workload from its active schedule configuration. It must never infer the expected count from the final CSV itself.

The active receiver configuration adds:

    ASSIGNMENT_EXPECTED_FORMAL_TRIAL_COUNT=<positive integer>
    ASSIGNMENT_REQUIRE_TUTORIAL=true|false

These values are valid only for ASSIGNMENT_SCHEDULE_VERSION. If the receiver cannot resolve the submitted assignment's schedule version to an expected count, finalization returns data_complete=false with a configuration error. It must never return data_complete=true in that state.

For the current Run 41 deployment, the configured formal count must match the compiled schedule's formal presentation count. The tutorial requirement must match the published experiment configuration.

## Durable finalization state

Add an internal SQLite table. It is receiver control data and is not added to the participant's final files or cloud archive payload.

    CREATE TABLE IF NOT EXISTS session_finalizations(
      experiment_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      schedule_version TEXT,
      finalization_status TEXT NOT NULL,
      data_complete INTEGER NOT NULL,
      archive_status TEXT NOT NULL,
      expected_formal_trial_count INTEGER,
      tutorial_required INTEGER NOT NULL,
      legacy_archive_eligible INTEGER NOT NULL DEFAULT 0,
      final_submission_id TEXT,
      manifest_json TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(experiment_id, participant_id, session_id)
    );

finalization_status is one of collecting, complete, incomplete, or needs_recovery. archive_status is one of pending, partial, archived, or failed.

The finalization row is created or refreshed when a v2 submission is accepted. A transaction and the existing publication lock protect the transition to complete, so a repeated final request cannot create a second result. An incomplete or needs_recovery row may be revalidated after late trial replay or configuration repair; a complete row is immutable except for archive_status.

## Local completeness validation

finalize_session(experiment_id, participant_id, session_id) validates the accepted local state, not the cloud state.

It must verify all of the following:

1. Every v2 submission has the same assignment identity and session identity.
2. Exactly one metadata submission and exactly one final submission exist.
3. The metadata submission satisfies the existing consent, participant profile, and Prolific ID checks.
4. At least one tutorial trial exists when ASSIGNMENT_REQUIRE_TUTORIAL=true.
5. The number of formal trials equals ASSIGNMENT_EXPECTED_FORMAL_TRIAL_COUNT.
6. Formal trial_index values are exactly 1..N, with no missing or repeated index.
7. Formal trial_session_id and presentation_id values are present and unique. Developer-mode sessions use the same schedule-bound count and validation; the isolated developer identity is not a completeness bypass.
8. The final session and raw-results CSVs are readable and have the existing identity columns.
9. The final raw-results data contains the same formal trial count and indices as the accepted trial submissions.
10. Every required submission's stored bytes are still available through its durable spool or already recorded archive metadata; a missing byte source is a recovery condition.

On success, the receiver stores a compact internal manifest containing the identity, expected count, received trial indices, presentation IDs, submission IDs, content hashes, and validation timestamp. The manifest is for restart-safe control and audit; it does not alter the existing archive files.

On failure, the receiver stores the reason and returns data_complete=false. A missing trial, duplicate index, conflicting identity, malformed final file, missing local bytes, or missing expected-count configuration can never produce data_complete=true.

## Final request and response contract

Keep the existing /submit and /archive routes so the deployment does not require a new public URL.

1. /submit continues to durably accept individual trials and the final batch. It returns only after the existing local persistence path succeeds.
2. /archive becomes the finalization-and-queue operation. It performs local validation, persists the finalization state, and schedules background archive work.
3. /archive must not call Nutstore or Sciebo synchronously.

Successful complete response:

    {
      "ok": true,
      "data_complete": true,
      "finalization_status": "complete",
      "archive_status": "pending"
    }

An already finalized request returns the same completion result and does not create another final record.

Incomplete response:

    {
      "ok": false,
      "data_complete": false,
      "finalization_status": "incomplete",
      "error": "incomplete_data",
      "message": "..."
    }

The HTTP status for incomplete or unrecoverable local validation is a client error such as 409; the exact status must remain distinguishable from a server crash. A transient server/storage failure is a 5xx and must not be converted into success.

## Background archive behavior

The worker selects new sessions only when legacy_archive_eligible=0, data_complete=1, and archive status is not archived. Migrated legacy rows are selected only through their explicit legacy_archive_eligible=1 compatibility path. After each target attempt, the worker recomputes the session archive_status from all submission target states and persists it in session_finalizations; this never changes data_complete.

- A successful Nutstore upload is never repeated merely because Sciebo failed.
- A successful Sciebo upload is never repeated merely because Nutstore failed.
- A target failure changes archive_status to partial or failed and remains retryable.
- Spool deletion remains allowed only after all configured targets are archived successfully.
- The 30-second worker interval remains a scan interval, not an HTTP timeout.

For existing pre-migration pending rows, the schema migration must set legacy_archive_eligible=1 so historical data is not silently abandoned. New sessions created after the migration start with legacy_archive_eligible=0 and are not eligible for cloud archive until finalization succeeds.

## Client transport behavior

Only the invisible final transport path changes:

- Keep the existing immediate trial save and local IndexedDB backup.
- Keep normal trial upload at the existing 15-second timeout and do not pass the final timeout into DataSaveService replay calls.
- Set the final receiver batch and /archive request timeout to 90_000 ms.
- Parse the /archive JSON body and treat data_complete !== true as a failed finalization, even if the HTTP response is otherwise successful.
- Clear IndexedDB only after data_complete=true and the existing metadata-pending condition is satisfied.
- Preserve the existing recovery ZIP path for any timeout, rejection, malformed response, or incomplete result.
- Keep the completion-code field, completion page, and participant-facing copy unchanged. The existing end page is rendered as successful only after saveExperimentFiles() receives data_complete=true.

If a request times out after the VPS committed finalization, the retry must return the same stored result. The participant must not be marked successful from a timeout alone, and the receiver must not create a duplicate final submission.

## Acceptance criteria

1. A trial is still saved locally and submitted to the VPS immediately after Confirm.
2. A new session with only metadata or partial trials is never uploaded to Nutstore or Sciebo by the worker.
3. A complete session returns data_complete=true without waiting for either cloud target.
4. A 60-second or 90-second artificial cloud delay does not block /archive completion.
5. A missing formal trial, duplicate formal index, conflicting identity, malformed final CSV, or missing spool bytes returns data_complete=false.
6. Repeating the final /submit or /archive request is idempotent and returns the same finalization state.
7. A receiver restart preserves submissions and finalization state; the worker resumes cloud upload afterward.
8. One failed cloud target does not repeat a successful target and does not change data_complete=true to false.
9. Existing trial/final bytes, filenames, archive keys, and archive directory structure remain unchanged.
10. The built client uses a 90-second final timeout and rejects an archive response without data_complete=true.
11. No visible experiment UI or task behavior changes.

## Grill-me self-review and corrections

### Could a missing trial become complete?

No. The receiver uses the configured expected count and exact trial_index set. The final CSV row count is only a cross-check, never the source of the expected count.

### Could a duplicate final request create duplicate data?

No. The existing v2 final identity index remains, and the finalization primary key is the session identity. Repeated requests return the stored result.

### Could cloud timeout affect participant success?

No. /archive never waits for cloud I/O. It returns after local finalization; cloud failures remain in archive_status.

### Could a VPS restart lose the decision?

No. Submissions, finalization status, manifest, and per-target progress are in SQLite and durable spool files. Worker startup re-reads them.

### Is the expected count authoritative?

Yes. It comes from receiver configuration bound to the active schedule version. Missing configuration fails closed.

### Does this change the experiment file format?

No. The internal finalization row and manifest are control data. Existing participant files and archive keys remain byte-compatible.

### Does no frontend change conflict with 90 seconds and data_complete?

There is a transport-only client change because the browser must use the longer final timeout and inspect the new response field. It does not change visible UI, task flow, copy, or URL. Moving or redesigning the completion-code page is explicitly out of scope.

### What was deliberately skipped?

No new archive provider abstraction, no new public endpoint, no background browser upload, no extra participant-facing status page, and no change to the 30-second worker cadence.
