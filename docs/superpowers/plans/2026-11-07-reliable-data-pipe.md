# Reliable data pipe and early session metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Preserve the current LayoutTask data contract while durably saving session metadata early and moving cloud archive work out of the participant request path.

**Architecture:** Add an idempotent v2 metadata submission that reuses the current receiver spool and SQLite state. Make `/archive` enqueue-only and run the existing retry machinery from one persistent worker; configure both rclone targets without changing the frontend UI or experiment behavior. Add a minimal invisible client call after assignment/profile collection, then build and validate fresh Chinese and English static packages.

**Tech Stack:** TypeScript, Vitest, Python 3 receiver, SQLite, rclone, Vite, GitHub static release branches.

**Spec:** `docs/superpowers/specs/2026-11-07-reliable-data-pipe-design.md`

## Global Constraints

- Keep current trial/tutorial/final bytes, filenames, hashes, identity fields, sequence associations and archive paths unchanged.
- Return receiver success only after durable VPS acceptance; `queued` must never be reported as `archived`.
- Keep local spool until both configured archive targets succeed.
- No visible UI, tutorial, timing, scoring, assignment or stimulus changes.
- Do not add Redis, Celery, a message broker or an external database.
- Do not modify historical submissions or active assignment counters.
- Build fresh self-contained Chinese and English packages before publishing.

---

### Task 1: Establish the receiver metadata contract with failing tests

**Files:**
- Modify: `receiver/app/models.py`
- Modify: `receiver/app/storage.py`
- Test: `receiver/tests/test_models.py`
- Test: `receiver/tests/test_storage.py`

- [x] Add failing validation tests for `submission_kind: metadata`, required assignment/session identity, metadata JSON file, and rejection of trial-only fields.
- [x] Add failing storage tests for one metadata row, duplicate same-content submission, conflict on changed profile, and shared session/assignment linkage.
- [x] Run only the focused Python tests and confirm they fail for the missing behavior.
- [x] Implement the smallest metadata model/validation path and unique identity index.
- [x] Re-run the focused tests and confirm they pass.

### Task 2: Add the invisible client metadata submission

**Files:**
- Modify: `src/core/data-save-service.ts`
- Modify: `src/experiment-runner.ts`
- Modify: `src/main.ts` only if the existing assignment/profile boundary requires it
- Test: `src/core/data-save-service.test.ts`
- Test: `src/experiment-runner.test.ts`

- [x] Add failing tests showing metadata is sent once after assignment/profile collection, uses the current session and assignment, and does not change trial payloads or UI callbacks.
- [x] Add failing tests showing a failed metadata request remains retryable through the existing local backup path.
- [x] Implement a non-blocking receiver metadata call; do not add visible page content or wait gates.
- [x] Keep final CSV/JSON generation and trial payload construction byte-compatible.
- [x] Run the focused TypeScript tests and confirm they pass.

### Task 3: Make archive requests enqueue-only and add recovery worker

**Files:**
- Modify: `receiver/app/storage.py`
- Modify: `receiver/app/server.py`
- Modify: `receiver/app/config.py`
- Modify: `receiver/docker-compose.yml`
- Test: `receiver/tests/test_server.py`
- Test: `receiver/tests/test_storage.py`

- [x] Add failing server tests proving `/archive` returns quickly with `queued` while a blocking archive backend is still blocked.
- [x] Add failing tests proving the worker retries pending sessions after restart and never deletes spool before all targets succeed.
- [x] Add failing tests for late same-session submissions and idempotent repeated `/archive` requests.
- [x] Implement enqueue-only session status response and one bounded background worker that calls existing `retry_pending()`.
- [x] Keep synchronous `archive_session()` available for existing maintenance/tests where needed.
- [x] Add an explicit retry interval configuration with a conservative default and no unbounded thread creation.
- [x] Run the focused receiver suite under the available Python runtime.

### Task 4: Enable and document dual archive targets

**Files:**
- Modify: `receiver/docker-compose.yml`
- Modify: `receiver/README.md`
- Test: `receiver/tests/test_archive.py`
- Test: `receiver/tests/test_storage.py`

- [x] Add failing coverage for independent Jianguoyun/Sciebo target success and retry behavior.
- [x] Preserve existing target names and archive hierarchy.
- [x] Set production configuration examples for both submission and metadata archive remotes.
- [x] Do not write credentials into source, logs or test output.
- [x] Run local fake-target tests and a separate authenticated VPS connectivity/write-read-hash check before production rollout.

### Task 5: Full contract verification and fresh bilingual packages

**Files:**
- Modify: `docs/notes/2026-11-07-session-metadata-early-save.md`
- Create: `docs/superpowers/verification/2026-11-07-reliable-data-pipe.md`
- Generated: `dist/` and temporary bilingual release roots

- [x] Run receiver metadata/idempotency/restart/dual-target tests.
- [x] Run the full frontend suite, TypeScript check, fresh build and recursive web-release validation.
- [x] Verify unchanged final file names/content using existing experiment-data tests.
- [x] Generate separate self-contained Chinese and English packages from the fresh build; verify all referenced assets exist.
- [x] Run the bilingual browser smoke flow without adding visible metadata UI or new waiting steps.
- [x] Record exact commands, counts, hashes, remaining risks and deployment status in the verification note.

### Task 6: Commit and publish in controlled order

**Files:**
- Modify only the files proven necessary by Tasks 1–5.

- [x] Review the diff for unrelated dirty-worktree changes and stage only this task.
- [x] Commit the source/receiver change on the current feature branch, preserving the existing working baseline.
- [x] Push the source branch after verification.
- [x] Deploy and verify the backwards-compatible receiver before publishing clients that submit metadata; preserve the mounted data and assignment counters.
- [x] Publish the fresh Chinese package to `web-release` `main` and the English package to `web-release` `en-US`, preserving the self-contained package root.
- [x] Verify remote refs and representative live assets/configs.
- [x] Record receiver and both static deployment refs, evidence and any remaining limitations.
