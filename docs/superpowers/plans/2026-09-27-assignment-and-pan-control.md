# Automatic Assignment and Explicit Pan Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not create a new worktree. Work in the current checkout and preserve unrelated user changes.

**Goal:** Add reliable VPS-side participant assignment and sequence selection to the existing receiver pipeline, while verifying the new explicit hold-to-pan control and removing right-button viewport panning.

**Architecture:** Extend the existing Python `receiver` container with an atomic `/assign` route and an `assignments` SQLite table. Keep Caddy as a separate reverse-proxy container and reuse the existing `/submit`, `/api/data/`, and `/archive` paths. The frontend requests an idempotent assignment before formal trials, then uses the returned participant/sequence metadata throughout the session. The renderer uses only the bottom-right `Pan` button for viewport panning.

**Tech Stack:** TypeScript, Vite, Vitest, Python 3.12, `http.server`, SQLite, Docker Compose, Caddy.

**Spec:** `docs/superpowers/specs/2026-09-27-assignment-and-pan-control-design.md`

## Global Constraints

- Do not create a new worktree or new assignment container.
- Do not change the 46-sequence schedule generation algorithm.
- Do not fall back to sequence 1 when formal assignment fails.
- The receiver is the authority for globally unique participant numbers.
- Repeated requests with the same `(experiment_id, idempotency_token)` return the same assignment.
- The configured schedule length, not a hard-coded `46`, controls cycling.
- Right-button dragging and renderer-level `contextmenu` suppression must remain removed.
- Assignment metadata must reach session metadata, every trial record, final CSV/JSON, local backup, and archive payload.

## Review Focus

- Concurrent `/assign` calls: no duplicate participant numbers.
- Refresh/retry: same idempotency token does not consume another number.
- Schedule boundary: participant `N + 1` starts the next cycle only when the configured sequence count is `N`.
- Receiver restart: assignment state survives through the existing mounted data volume.
- Assignment outage: formal mode blocks instead of silently using a default sequence.
- Pan interaction: only holding `Pan` moves the camera; right-click and object manipulation remain separate.
- Pointer cancellation/pause: the pan button cannot remain visually active or retain pointer capture.

---

### Task 1: Add Persistent Assignment Storage

**Files:**
- Modify: `receiver/app/storage.py`
- Modify: `receiver/app/config.py` if schedule configuration needs a typed setting
- Test: `receiver/tests/test_storage.py`

**Interfaces:**
- Produces `allocate_assignment(experiment_id: str, idempotency_token: str, schedule_version: str, sequence_ids: list[str]) -> AssignmentRecord` for the HTTP handler.
- `AssignmentRecord` contains `assignment_id`, `experiment_id`, `idempotency_token`, `participant_number`, `sequence_id`, `schedule_version`, and `assigned_at`.
- The allocation operation returns the existing record for a repeated idempotency key or atomically creates the next record.

- [ ] **Step 1: Write failing storage tests**

  Add tests for first allocation, repeated idempotent allocation, concurrent allocation uniqueness, and cycling through a configured sequence list. Assert that participant `sequence_count + 1` maps to the first sequence.

- [ ] **Step 2: Run the focused tests and confirm failure**

  Run: `python -m unittest receiver.tests.test_storage -v`

  Expected: FAIL because assignment schema and methods do not exist.

- [ ] **Step 3: Implement the smallest SQLite-backed assignment API**

  Add an `assignments` table with a unique `(experiment_id, idempotency_token)` constraint and a unique `(experiment_id, participant_number)` constraint. Use a short SQLite transaction with an immediate write lock to read the next number, select `(number - 1) % len(sequence_ids)`, and insert the record.

- [ ] **Step 4: Run the focused tests**

  Run: `python -m unittest receiver.tests.test_storage -v`

  Expected: PASS, including the concurrency and cycle-boundary cases.

- [ ] **Step 5: Commit the storage unit**

  Commit message: `feat: persist atomic participant assignments`

**Grill Me checkpoint:** Verify no assignment number can be created outside the SQLite transaction and no idempotency key can map to two rows.

### Task 2: Expose the `/assign` Receiver Route

**Files:**
- Modify: `receiver/app/server.py`
- Modify: `receiver/app/models.py` if request/response validation belongs there
- Modify: `receiver/tests/test_server.py`
- Modify: `receiver/README.md`

**Interfaces:**
- `POST /assign` consumes the assignment request from the spec and calls `allocate_assignment(...)`.
- Success returns `assignment_id`, `participant_number`, `sequence_id`, and `schedule_version`.
- Invalid JSON, missing token, unsupported experiment/schedule, and storage errors return explicit non-2xx responses.

- [ ] **Step 1: Write failing route tests**

  Test success, auth/CORS behavior, repeated idempotent request, invalid schedule version, and a missing assignment configuration. Assert that the route never returns a default sequence on failure.

- [ ] **Step 2: Run the focused server tests and confirm failure**

  Run: `python -m unittest receiver.tests.test_server -v`

  Expected: FAIL because `/assign` is not an accepted route.

- [ ] **Step 3: Implement `/assign` by reusing receiver auth/config/storage**

  Add only the route and its configuration plumbing. Keep `/submit`, `/api/data/`, `/archive`, and `/health` behavior unchanged. Use the receiver's existing token, origin, body-size, and rate-limit guards.

- [ ] **Step 4: Run all receiver tests**

  Run: `python -m unittest discover -s receiver/tests -v`

  Expected: PASS.

- [ ] **Step 5: Document deployment configuration**

  Document the assignment schedule/version source and the persistent `data` volume in `receiver/README.md`. Do not introduce a second service.

- [ ] **Step 6: Commit the route unit**

  Commit message: `feat: expose idempotent assignment endpoint`

**Grill Me checkpoint:** Verify route failures are explicit non-2xx responses and never return a fabricated participant or sequence.

### Task 3: Select the Assigned Sequence in the Formal Frontend

**Files:**
- Modify: `src/experiment-runner.ts`
- Modify: `src/main.ts` or the existing session/bootstrap boundary where participant identity is available
- Modify: `src/core/schedule-generator.ts` only if an existing helper needs a typed assignment input
- Test: `src/experiment-runner.test.ts`, `src/core/schedule-generator.test.ts`

**Interfaces:**
- Add `requestAssignment(input: AssignmentRequest) -> Promise<AssignmentRecord>` at the existing data/transport boundary; do not create a second transport stack.
- The formal runner receives an assignment before constructing the formal timeline.
- The timeline uses `selectSequence(config.schedule, assignment.participant_number)` or the validated server `sequence_id`, never `sequences[0]`.

- [ ] **Step 1: Write failing frontend tests**

  Assert that participant assignment selects the expected sequence, participant 47 cycles to sequence 1 when the schedule has 46 sequences, and a failed assignment prevents formal timeline start.

- [ ] **Step 2: Run the focused tests and confirm failure**

  Run: `npm test -- --run src/experiment-runner.test.ts src/core/schedule-generator.test.ts`

  Expected: FAIL because the runner currently reads `config.schedule?.sequences[0]?.presentations`.

- [ ] **Step 3: Implement assignment-before-timeline flow**

  Generate and persist a stable browser idempotency token before requesting `/assign`. Store the returned assignment in the session state and pass it into the existing runner/data-save path. Formal mode must show a blocking error if assignment cannot be obtained.

- [ ] **Step 4: Replace the fixed sequence selection**

  Use the existing `selectSequence()` helper or the server-validated sequence ID. Keep tutorial/developer paths explicit and unchanged unless their current mode already has a separate assignment policy.

- [ ] **Step 5: Run focused frontend tests**

  Run: `npm test -- --run src/experiment-runner.test.ts src/core/schedule-generator.test.ts`

  Expected: PASS.

- [ ] **Step 6: Commit the formal selection unit**

  Commit message: `fix: use assigned sequence for formal trials`

**Grill Me checkpoint:** Search for every formal `sequences[0]` use and prove none remains in the timeline path; tutorial and developer behavior must be intentionally accounted for.

### Task 4: Propagate Assignment Metadata Through Outputs

**Files:**
- Modify: `src/types/runtime.ts` and/or the existing session/result types
- Modify: `src/core/experiment-session.ts`
- Modify: `src/core/experiment-data.ts`
- Modify: `src/experiment-runner.ts`
- Modify: existing data-save/transport code only at its metadata boundary
- Test: `src/core/experiment-data.test.ts`, `src/core/experiment-session.test.ts`

**Interfaces:**
- Required metadata fields: `assignment_id`, `participant_number`, `sequence_id`, and `schedule_version`.
- The same values must appear in session, trial, event/debug outputs and receiver/archive payload metadata.

- [ ] **Step 1: Write failing serialization tests**

  Assert that generated CSV/JSON and DataPipe payloads carry identical assignment metadata and that local backup uses the same values.

- [ ] **Step 2: Run focused tests and confirm failure**

  Run: `npm test -- --run src/core/experiment-data.test.ts src/core/experiment-session.test.ts`

  Expected: FAIL because assignment fields are not part of the current output contract.

- [ ] **Step 3: Add the fields at the existing metadata boundary**

  Reuse current CSV/JSON and transport builders. Do not add a parallel output format or duplicate save pipeline.

- [ ] **Step 4: Run focused tests and then the full TypeScript suite**

  Run: `npm test -- --run src/core/experiment-data.test.ts src/core/experiment-session.test.ts`

  Expected: PASS.

- [ ] **Step 5: Commit metadata propagation**

  Commit message: `feat: preserve assignment metadata in experiment outputs`

**Grill Me checkpoint:** Compare one assignment object with session, trial, CSV, JSON, backup, and archive metadata and verify the four required values are identical.

### Task 5: Verify Explicit Hold-to-Pan Interaction

**Files:**
- Modify only if needed: `src/core/renderer.ts`
- Modify only if needed: `src/styles/layout-task.css`
- Test: `src/core/renderer.test.ts`

**Interfaces:**
- The only viewport-pan activation is `pointerdown` on `.layout-task-viewport-pan-button`.
- `pointermove`, `pointerup`, and `pointercancel` operate on the captured pointer.
- No SVG `contextmenu` suppression and no `event.button === 2` pan path.

- [ ] **Step 1: Review the current implementation and preserve the explicit Pan path**

  Confirm the current working-tree implementation is the intended one. Do not reintroduce right-button listeners while touching assignment code.

- [ ] **Step 2: Add or tighten failing regression assertions**

  Assert the Pan button exists, uses pointer capture, clears active state on both `pointerup` and `pointercancel`, and that the SVG has no right-button pan or renderer context-menu handler.

- [ ] **Step 3: Run the renderer tests**

  Run: `npm test -- --run src/core/renderer.test.ts`

  Expected: PASS.

- [ ] **Step 4: Verify manually in the browser**

  Confirm zoom/reset still work; right-click does not pan; holding `Pan` and dragging pans; releasing or canceling stops panning; object arrows still manipulate objects rather than the camera.

- [ ] **Step 5: Commit only if this task changed files**

  Commit message: `test: cover explicit viewport pan interaction`

**Grill Me checkpoint:** Verify the camera moves only during a captured `Pan` pointer gesture and that `pointerup`, `pointercancel`, pause, and lock cannot leave a stuck active button.

### Task 6: Deployment and End-to-End Verification

**Files:**
- Modify: `receiver/docker-compose.yml` only for required assignment configuration
- Modify: `receiver/Caddyfile.example` only if an explicit route restriction is introduced
- Modify: `receiver/README.md`
- Test: receiver tests, frontend tests, production build

- [ ] **Step 1: Add deployment configuration for the schedule source/version**

  Keep `receiver` and `caddy` as the only services. Ensure assignment state remains under `./data` and survives restart.

- [ ] **Step 2: Run the complete automated verification**

  Run:

  ```powershell
  python -m unittest discover -s receiver/tests -v
  npm test -- --run
  npm run build
  ```

  Expected: all receiver tests pass, all Vitest tests pass, and Vite build completes.

- [ ] **Step 3: Run a local HTTP smoke test**

  Start the receiver stack or test server, request two assignments, repeat the first idempotency token, and verify the three responses contain two unique participant numbers with the first repeated unchanged.

- [ ] **Step 4: Verify the formal browser flow**

  Use a formal task URL, not the tutorial URL. Confirm assignment happens before the first formal trial and the participant/sequence metadata appears in saved output.

- [ ] **Step 5: Verify persistence**

  Restart the receiver container and repeat the idempotent request. The original assignment must be returned from the mounted SQLite database.

- [ ] **Step 6: Commit deployment documentation and final verification**

  Commit message: `docs: document assignment deployment and verification`

**Grill Me checkpoint:** Start from a clean production-like URL and verify the receiver, assignment, sequence selection, output metadata, and Pan behavior as one end-to-end flow.

## Final Grill Me Review

- [ ] The plan does not invent a second container or a second database.
- [ ] The plan covers current `/submit`, `/api/data/`, `/archive`, and `/health` compatibility.
- [ ] The plan covers server-side uniqueness, refresh idempotency, sequence cycling, and restart persistence.
- [ ] The plan explicitly blocks formal start on assignment failure.
- [ ] The plan propagates assignment metadata through all existing output paths.
- [ ] The plan includes the recent Pan-button implementation and its pointer-capture regression checks.
- [ ] The plan does not change object movement, rotation, collision, tutorial content, or scoring.
- [ ] Every task has a test or verification command and a concrete expected result.
- [ ] No placeholder, unspecified fallback, or hidden hard-coded sequence count remains.

## Handoff

The implementation agent should use `superpowers:executing-plans`, work in the current checkout, preserve unrelated dirty changes, execute tasks in order, and stop for review if the current working tree conflicts with a listed file.
