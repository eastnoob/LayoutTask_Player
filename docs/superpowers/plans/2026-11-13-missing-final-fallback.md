# Missing-final archive fallback implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Automatically back up an otherwise complete session whose client final is still absent 300 seconds after its last formal trial was durably accepted.

**Architecture:** Extend the existing storage state, finalization checks and retry scanner. Persist an immutable validated manifest and execute only its IDs; use short publication locking for local decisions and existing per-session locking for cloud transfer.

**Tech Stack:** Python standard library, SQLite, unittest, existing Local/Multi/RcloneArchiveBackend, existing Pixi Python and production Linux image.

**Spec:** `docs/superpowers/specs/2026-11-13-missing-final-fallback-design.md`

## Global constraints

- Receiver only; frontend, static packages, URLs, stimuli, scoring, Pause, experiment timing and sequence allocation remain unchanged.
- Fixed 300 seconds from successful last-formal acceptance; no start-time/scan-time fallback and no guessed historical t0.
- Preserve original submission bytes, filenames, paths, identities, per-target successes and incoming data on rollback.
- No new dependency, public endpoint, upload pool or fabricated final; HTTP incomplete remains 409 and data_complete=false.
- Work in `codex/vps-missing-final-fallback`; preserve the source checkout's unrelated changes.

## Task 1: Persist the correct wait origin and compatible schema

Files: `receiver/app/storage.py`, new `receiver/tests/test_missing_final.py`.

Interfaces: existing `save_submission`, `_insert_submission`, `_init_schema`; add only internal state columns, not public API parameters. Use existing `test_storage.v2_payload` and `submit_v2` for fixtures.

- [x] Add real workload helpers and tests for no last trial, first last-trial acceptance, repeat/restart, disk/transaction failure and historical rows. Patch `app.storage._utc_now` to a controllable aware UTC value.

```python
with patch('app.storage._utc_now', return_value='2026-11-13T12:00:00+00:00'):
    last = submit_v2(storage, formal_payload(assignment, 24))
with patch('app.storage._utc_now', return_value='2026-11-13T12:10:00+00:00'):
    duplicate = submit_v2(storage, formal_payload(assignment, 24))
assert duplicate.id == last.id
assert session_state(storage)['final_wait_started_at'] == '2026-11-13T12:00:00+00:00'
```

- [x] Run the new persistence tests and observe the missing-state behavior fail before changing production code.
- [x] Add columns with PRAGMA/table-info migration checks. In the existing accepted-submission transaction, set t0 once after durable writes only for a version-bound formal index N. Retain NULL for historical rows and idempotent retries. Recompute/invalidate per-session state only for genuine new records.
- [x] Run persistence tests plus existing storage migration/deduplication tests, then commit this independently verifiable change.

## Task 2: Validate and archive persistent whitelists without blocking local finalization

Files: `receiver/app/storage.py`, `receiver/tests/test_missing_final.py`; adjust `receiver/app/archive_worker.py` only if per-session handling cannot remain in storage.

Interfaces: retain `finalize_session(...) -> SessionFinalizationResult` and `retry_pending() -> int`. Extract shared base-completeness checking, a lock-free-under-publication finalization helper, and validated-ID selection consumed by `_retry_session_locked`. Reuse existing manifest fields and per-target transfer code.

- [x] Add failing boundary, complete/no-final, missing-data and late-final tests. Assertions must check actual archived directory contents and SQLite states, not only method calls.

```python
clock.value = start + timedelta(seconds=299)
assert storage.retry_pending() == 0
clock.value = start + timedelta(seconds=300)
assert storage.retry_pending() == 26
assert session_state(storage)['data_complete'] == 0
assert session_state(storage)['final_submission_id'] is None
```

- [x] Add failing blocked-upload/local-finalization, late-invalid-final/second-cloud-failure, candidate/acceptance interleaving, corrupted whitelist, cached-complete/new-record and per-session exception isolation tests.
- [x] Move local finalization off the network session lock. Keep all local snapshot validation, proof persistence and aggregate read/update in short publication boundaries; do not acquire network locks inside them.
- [x] Preserve prior valid manifest on failed normal checks; bind cached success to its ID/hash set. Create missing-final proof only after time/config/base-data revalidation with final absent. Clear fallback flag only on valid normal takeover.
- [x] Discover new candidates, isolate per-session errors, pass the proof's exact IDs to transfer execution and recheck stored hash/identity bindings. Preserve legacy behavior and target/spool retry rules.
- [x] Run focused tests and full backend regression; commit the implementation and tests only after green results.

## Task 3: API, multi-process recovery and operator documentation

Files: new `receiver/tests/test_missing_final.py`, existing `receiver/tests/test_server.py` if useful, `receiver/README.md`, new `docs/superpowers/verification/2026-11-13-missing-final-fallback.md`.

Interfaces: existing `create_server`, `test_server.ServerTests.post_in_process`, `ArchiveWorker`, `retry_archive.main`; no new public interface.

- [x] Add HTTP 409 checks before/after fallback qualification, HTTP 202 local normal completion during blocked same-session upload, accepted-final/no-archive recovery, full identity isolation, process/restart and fixed-path retry checks. Use events/barriers for race tests, not uncontrolled sleeps.
- [x] Run 24-formal-trial dual-backend byte comparison, original receiver suites, and full Linux HTTP tests with a real existing static artifact for the unrelated built-package fixture. Record exact counts and environmental exclusions.
- [x] Update README with origin/deadline semantics, missing-final versus data_complete, whitelist/late-final behavior, history and rollback boundaries. Record all 35 acceptance scenarios against actual tests/evidence, combining only genuinely equivalent variants.
- [x] Obtain an independent read-only code review against spec plus branch diff. Fix material findings, add red/green regression cases, re-review fixes. Commit final local source/docs and verification evidence.

## Task 4: Receiver deployment and preservation checks

Files: verification report; existing verified VPS `/srv/agent/layouttask-receiver` deployment, no static repository changes.

- [x] Access the established VPS using existing SSH configuration or Proton Pass CLI. Read live image/config/module hashes and session/assignment counts before any mutation. Compare deployed receiver modules with the branch's base and preserve any production-only fix.
- [x] Stage reviewed receiver code/tests on VPS; use the existing dependency image for isolated Linux regression and migration on a consistent copy of production SQLite/spool. Compare old columns/rows, assignment allocation and file/content hashes. Historical NULL-t0 sessions stay unqualified.
- [x] Save source/config/image and a consistent stopped-data backup, then switch only receiver source/image with the same environment and volume. If switch fails, restore code/image while preserving newer incoming data.
- [x] Check health, source hashes, environment/config hashes, sequence counters and preserved identities/digests. Run a dedicated isolated test-store dual-cloud fixture, never allocate a real study slot or mix synthetic participant records into research data. Record cloud readback SHA-256 and cleanup only the fixture path.
- [ ] Record final commit/deployment evidence and remaining limits. Push the feature branch as the existing source-delivery authorization permits; keep the dirty original checkout intact.

## Progress and execution decisions

Spec coverage: Task 1 covers timing/migration; Task 2 covers proof/state/locking/retry; Task 3 covers API/isolation/restart and the source note's 35 acceptance scenarios; Task 4 covers production preservation and release. Shared storage interfaces are sequential, so implementation uses inline execution with an independent reviewer rather than parallel edits to storage.py.

Baseline: Windows full receiver discover ran 88 tests in 39.973 seconds; the built-package fixture failed without dist and with WinError 10054. All other tests completed without reported failure. New code has not yet been written at this checkpoint.

Completed implementation evidence: commits `61b72a7` and `5d4c95b`; Windows focused
74/74, WSL and VPS full suites 122 run/121 pass/1 platform skip. Independent review
findings were reproduced and fixed, then re-reviewed. Production-only receiver
deployment and two-cloud original-byte readback passed. See
`docs/superpowers/verification/2026-11-13-missing-final-fallback.md` for all 35
acceptance mappings, data-preservation checks, hashes and rollback boundaries.
