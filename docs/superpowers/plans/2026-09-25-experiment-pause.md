# Experiment Pause and Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one persistent, auditable 15-minute formal pause opportunity, a non-consuming tutorial pause lesson, and pause-aware timing/export across the experiment.

**Architecture:** Add an experiment-level `ExperimentPauseController` that owns the state machine, fixed UI, countdown, persistence, and pause events. Expose a narrow pause interface to the experiment runner and LayoutTask player so all active pages share one quota and all timers use one active-time calculation. Keep raw wall-clock timestamps and add pause summaries/active durations to existing outputs.

**Tech Stack:** TypeScript, jsPsych 8, Vitest, DOM/SVG UI, `sessionStorage`, IndexedDB local backups, existing CSV/JSON/DataPipe/recovery ZIP pipeline.

**Spec:** `docs/superpowers/specs/2026-09-25-experiment-pause-design.md`

## Global Constraints

- Formal pause quota is exactly one per session and is consumed when the participant confirms the pause.
- Formal pause duration is capped at 15 minutes; reaching the cap automatically resumes the experiment.
- Tutorial pause practice is separate, lasts 10 seconds, and never consumes the formal quota.
- The pause control is visible on every active tutorial/formal page, including reference-image presentation pages, and hidden on saving and completion pages.
- While paused, task interaction, reference-image zoom, floor-plan zoom/pan, drag, movement, rotation, confidence selection, and submit actions are blocked.
- Raw wall-clock timestamps remain available; active durations subtract formal pause intervals and tutorial active durations subtract tutorial practice intervals.
- Same-tab refresh recovery uses `sessionStorage`; do not use long-lived `localStorage` for pause quota state.
- No new runtime dependency is permitted.
- Standalone LayoutTask player usage must remain functional when no experiment-level pause interface is supplied.

## Review Focus

- Refresh during an active formal pause must preserve the consumed quota and never restore a second opportunity; restore the countdown only when the current page is reattached; test in Task 2.
- Automatic resume at exactly 15 minutes must close the pause once, emit one terminal event, and disable Pause; test in Task 1.
- A pause crossing a reference/trial boundary must subtract its interval exactly once from session and trial active durations; test in Tasks 2 and 6.
- Tutorial practice must advance only after Pause then Resume and must not change the formal quota; test in Task 5.
- Upload/backup failure must retain the complete pause metadata and resumable local files with matching participant/session identifiers; test in Task 6.

---

### Task 1: Build the pause state machine and active clock

**Files:**
- Create: `src/core/experiment-pause.ts`
- Create: `src/core/experiment-pause.test.ts`
- Modify: `src/types/result.ts` (add shared pause event/summary types near timing types)
- Modify: `src/schemas/result.schema.ts` (validate pause metadata)

**Interfaces:**
- Consumes: clock functions (`Date.now` by default), a persistence adapter supplied by Task 2, and callbacks for UI/state changes.
- Produces: `ExperimentPauseController`, `ExperimentPauseSnapshot`, `PauseEvent`, `PauseSummary`, and `ActiveClock` interfaces used by Tasks 2, 3, 4, and 6.

- [ ] **Step 1: Write failing state-machine tests**

Add tests covering:

```ts
expect(controller.snapshot().status).toBe("available");
controller.requestPause();
expect(controller.snapshot().status).toBe("confirming");
controller.confirmPause();
expect(controller.snapshot()).toMatchObject({ status: "paused", pauseUsed: true });
controller.resume("manual_resume");
expect(controller.snapshot()).toMatchObject({ status: "consumed", pauseEndReason: "manual_resume" });
```

Also test cancelled confirmation, automatic resume at 900_000 ms, duplicate confirmation rejection, and the tutorial-only `practice` mode.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- --run src/core/experiment-pause.test.ts`

Expected: FAIL because the controller and pause types do not exist.

- [ ] **Step 3: Implement the minimal controller**

Define these stable shapes:

```ts
type PauseMode = "formal" | "tutorial_practice";
type PauseStatus = "available" | "confirming" | "paused" | "consumed" | "practice_available" | "practice_paused" | "practice_consumed";
type PauseEndReason = "manual_resume" | "auto_resume_15m";

interface PauseEvent {
  type: "pause_confirmed" | "pause_resumed";
  mode: PauseMode;
  at: number;
  reason?: PauseEndReason;
}

interface ExperimentPauseSnapshot {
  mode: PauseMode;
  status: PauseStatus;
  pauseUsed: boolean;
  pauseStartedAt?: number;
  pauseEndedAt?: number;
  pauseDurationMs: number;
  pauseEndReason?: PauseEndReason;
  events: PauseEvent[];
}
```

`confirmPause()` must synchronously mark formal `pauseUsed` before starting the timer. `resume()` must be idempotent. A 900_000 ms timeout must call `resume("auto_resume_15m")` exactly once. Expose `getActiveElapsedMs(startAt, endAt)` and an `activeClock` that subtracts closed and currently active pause intervals without changing raw timestamps.

- [ ] **Step 4: Run focused tests and schema tests**

Run: `npm test -- --run src/core/experiment-pause.test.ts src/schemas/result.schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the isolated core**

```bash
git add src/core/experiment-pause.ts src/core/experiment-pause.test.ts src/types/result.ts src/schemas/result.schema.ts
git commit -m "feat: add experiment pause state machine"
```

### Task 2: Persist the same-tab session and pause state

**Files:**
- Create: `src/core/experiment-session.ts`
- Create: `src/core/experiment-session.test.ts`
- Modify: `src/experiment-runner.ts` (replace per-load session ID creation with session bootstrap)

**Interfaces:**
- Consumes: `ExperimentPauseSnapshot` and `PauseEvent` from Task 1.
- Produces: `ExperimentSession`, `SessionPersistence`, and `restorePauseSnapshot()` used by Tasks 3 and 6.

- [ ] **Step 1: Write failing persistence tests**

Test that a new tab/session creates one session ID, a same-tab reload returns the same ID, a different storage namespace creates a different ID, a completed session creates a fresh ID, and a persisted pause record preserves the consumed quota and either restores an active countdown when the current page is reattached or auto-resumes at 15 minutes.

Use an in-memory `Storage` test double; do not depend on a real browser in unit tests.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- --run src/core/experiment-session.test.ts`

Expected: FAIL because session bootstrap and persistence do not exist.

- [ ] **Step 3: Implement session bootstrap and persistence**

Use keys scoped by experiment and participant, for example:

```text
layouttask:session:<experiment_id>:<participant_id>
layouttask:pause:<experiment_id>:<participant_id>:<session_id>
```

Store a versioned JSON record containing `schema_version`, `experiment_id`, `participant_id`, `session_id`, `session_status`, `pause_used`, `pause_started_at`, `pause_ended_at`, `pause_duration_ms`, `pause_end_reason`, and `updated_at`. Persist immediately on formal confirmation, every terminal resume, and every practice completion. If a stored formal pause is older than 900_000 ms, restore it as consumed with `auto_resume_15m`. Mark the record `completed` after the final save path succeeds; a later launch must create a fresh session instead of reusing a completed record.

- [ ] **Step 4: Integrate stable session ID into the runner**

In `createRunnableExperiment`, obtain participant ID first, call the session bootstrap, and use the returned session ID for local backup namespace, jsPsych metadata, CSV creation, and DataPipe submission. Do not generate a new session ID on every refresh.

- [ ] **Step 5: Run tests**

Run: `npm test -- --run src/core/experiment-session.test.ts src/experiment-runner.test.ts`

Expected: PASS, including existing fresh-session behavior.

- [ ] **Step 6: Commit persistence**

```bash
git add src/core/experiment-session.ts src/core/experiment-session.test.ts src/experiment-runner.ts
git commit -m "feat: persist experiment session pause state"
```

### Task 3: Add the global Pause/Resume UI and page lifecycle integration

**Files:**
- Create: `src/core/experiment-pause-ui.ts`
- Create: `src/core/experiment-pause-ui.test.ts`
- Modify: `src/experiment-runner.ts` (mount UI around jsPsych timeline and remove it before saving/end pages)
- Modify: `src/styles/layout-task.css` (fixed button, confirmation dialog, blocking overlay, countdown, disabled state)

**Interfaces:**
- Consumes: `ExperimentPauseController` from Task 1 and `ExperimentSession` from Task 2.
- Produces: `ExperimentPauseUi` with `mount()`, `setPageActive(active)`, `destroy()`, and `setTutorialPracticeEnabled(enabled)`.

- [ ] **Step 1: Write failing UI tests**

Test that the mounted UI contains an accessible Pause button, confirmation dialog text, Resume button, countdown text, disabled state after formal use, and a modal overlay with `aria-modal="true"`. Test that `setPageActive(false)` hides the control and `destroy()` removes all owned DOM nodes.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --run src/core/experiment-pause-ui.test.ts`

Expected: FAIL because the UI module does not exist.

- [ ] **Step 3: Implement the UI**

Use event listeners owned by the UI module and remove them in `destroy()`. The confirmation dialog must say:

```text
Are you sure you want to pause? This is your only pause opportunity and it can last up to 15 minutes.
```

The overlay must prevent pointer, keyboard, wheel, and context-menu events from reaching the underlying trial. It must show `Resume` and remaining time in `MM:SS`.

- [ ] **Step 4: Integrate lifecycle hooks**

Mount the UI before starting jsPsych. Keep it active for instructions, reference-board, tutorial, formal, and transition pages. Set it inactive before `renderSavingPage()` and destroy it before `renderEndPage()`. Avoid replacing `document.body` while the controller has live listeners.

- [ ] **Step 5: Run tests and build**

Run: `npm test -- --run src/core/experiment-pause-ui.test.ts src/experiment-runner.test.ts`; then `npm run build`.

Expected: PASS and a successful production build.

- [ ] **Step 6: Commit UI integration**

```bash
git add src/core/experiment-pause-ui.ts src/core/experiment-pause-ui.test.ts src/experiment-runner.ts src/styles/layout-task.css
git commit -m "feat: add global experiment pause controls"
```

### Task 4: Make LayoutTask and flow timing pause-aware

**Files:**
- Modify: `src/core/layout-task-player.ts`
- Modify: `src/core/flow-controller.ts`
- Modify: `src/core/page-timing.ts`
- Modify: `src/core/recorder.ts`
- Modify: `src/core/renderer.ts`
- Modify: `src/core/interaction-controller.ts`
- Test: `src/core/page-timing.test.ts`
- Test: `src/core/recorder.test.ts`
- Test: `src/core/flow-controller.test.ts`
- Test: `src/core/interaction-controller.test.ts`

**Interfaces:**
- Consumes: optional `pause: Pick<ExperimentPauseController, "isPaused" | "getActiveElapsedMs" | "subscribe">` from Task 1.
- Produces: pause-aware result timing while retaining existing standalone behavior when `pause` is omitted.

- [ ] **Step 1: Add failing timing and input-blocking tests**

Cover a trial started at 1_000 ms, paused from 2_000 to 7_000 ms, and submitted at 10_000 ms producing `active_duration_ms = 4_000` while raw timestamps remain unchanged. Cover pause during reference presentation, pause crossing trial transition, and rejection of action/drag/zoom/submit while paused.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --run src/core/page-timing.test.ts src/core/recorder.test.ts src/core/flow-controller.test.ts src/core/interaction-controller.test.ts`

Expected: FAIL on the new active-time and blocked-interaction assertions.

- [ ] **Step 3: Implement active timing injection**

Pass the optional pause clock into `PageTimingCollector`, `Recorder`, and `FlowController`. Replace direct elapsed subtraction for active fields with the shared clock. Keep `page_open_time`, `submit_time`, `start_time`, and `end_time` as raw timestamps. Ensure the reference countdown stops while paused and resumes from its remaining active duration.

- [ ] **Step 4: Implement input blocking**

In `InteractionController` and renderer viewport handlers, return before mutating state or starting drag/action requests when `pause.isPaused()` is true. Keep the overlay as the primary browser-level block, but retain controller guards for keyboard/programmatic events.

- [ ] **Step 5: Run focused tests and full type checks**

Run: `npm test -- --run src/core/page-timing.test.ts src/core/recorder.test.ts src/core/flow-controller.test.ts src/core/interaction-controller.test.ts`; then `npm run build`.

Expected: PASS and a successful build.

- [ ] **Step 6: Commit timing integration**

```bash
git add src/core/layout-task-player.ts src/core/flow-controller.ts src/core/page-timing.ts src/core/recorder.ts src/core/renderer.ts src/core/interaction-controller.ts src/core/page-timing.test.ts src/core/recorder.test.ts src/core/flow-controller.test.ts src/core/interaction-controller.test.ts
git commit -m "feat: exclude pauses from active task timing"
```

### Task 5: Add the tutorial pause lesson and final instructions

**Files:**
- Modify: `src/core/tutorial-controller.ts`
- Modify: `src/core/tutorial-controller.test.ts`
- Modify: `src/experiment-runner.ts` (tutorial completion page copy)
- Modify: `src/experiment-runner.test.ts`
- Modify: `src/styles/layout-task.css` (add the dedicated completion-list class alongside the existing tutorial completion styles)

**Interfaces:**
- Consumes: tutorial-practice callbacks from `ExperimentPauseUi` and the tutorial mode from Task 1.
- Produces: tutorial steps requiring `pause_practice_started` then `pause_practice_resumed`, with no formal quota mutation.

- [ ] **Step 1: Write failing tutorial tests**

Assert that tutorial steps include the pause lesson in order, cannot advance after only clicking Pause, advance after Resume, and preserve the existing final submit step. Assert that the completion page contains bullet-list items for the one-time 15-minute break, voluntary termination without payment/penalty, and truthful responding.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --run src/core/tutorial-controller.test.ts src/experiment-runner.test.ts`

Expected: FAIL because the pause steps and updated completion copy are absent.

- [ ] **Step 3: Implement tutorial integration**

Add explicit events to `TutorialEvent`, insert the pause lesson at the chosen tutorial transition before the tutorial submit instruction, and have the controller show the Pause highlight only for this step. Use the 10-second tutorial practice timer. The tutorial controller must consume `pause_practice_resumed`, not formal `pause_resumed`.

- [ ] **Step 4: Update final tutorial page**

Render the final instructions as semantic `<ul><li>` content, not a single paragraph. Keep all participant-facing copy in English and do not include internal field names.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- --run src/core/tutorial-controller.test.ts src/experiment-runner.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit tutorial changes**

```bash
git add src/core/tutorial-controller.ts src/core/tutorial-controller.test.ts src/experiment-runner.ts src/experiment-runner.test.ts src/styles/layout-task.css
git commit -m "feat: teach the one-time pause in tutorial"
```

### Task 6: Add pause metadata to all exports and recovery paths

**Files:**
- Modify: `src/core/experiment-data.ts`
- Modify: `src/core/data-save-service.ts`
- Modify: `src/core/local-backup-store.ts`
- Modify: `src/core/upload-state.ts`
- Modify: `src/core/zip-recovery.ts`
- Modify: `src/experiment-runner.ts`
- Modify: `src/core/experiment-data.test.ts`
- Modify: `src/core/data-save-service.test.ts`
- Modify: `src/core/local-backup-store.test.ts`
- Modify: `src/core/zip-recovery.test.ts`
- Modify: `src/experiment-runner.test.ts`

**Interfaces:**
- Consumes: `ExperimentPauseSnapshot`, `PauseEvent`, active timing, and stable session identity from Tasks 1-4.
- Produces: identical pause/session metadata in session CSV, results CSV, raw JSON, tutorial result, IndexedDB files, recovery ZIP manifest, and DataPipe submission.

- [ ] **Step 1: Write failing export tests**

Use a fixture with one formal pause from 2_000 to 7_000 ms and assert that all output builders contain `pause_used`, `pause_count`, `pause_duration_ms`, `pause_end_reason`, raw pause timestamps/events, and `active_duration_ms`. Assert tutorial practice appears only in tutorial metadata and does not increment formal `pause_count`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --run src/core/experiment-data.test.ts src/core/data-save-service.test.ts src/core/local-backup-store.test.ts src/core/zip-recovery.test.ts src/experiment-runner.test.ts`

Expected: FAIL on the new metadata assertions.

- [ ] **Step 3: Extend the experiment data input contract**

Add a required `pauseSummary`/`pauseEvents` input to the final file builder, preserve the existing CSV column order where possible, append new columns rather than silently changing meanings, and add the same summary to JSON payloads. Use the stable participant/session identifiers from Task 2 in every file and receiver envelope.

- [ ] **Step 4: Preserve metadata through backup and upload**

Ensure IndexedDB saves the complete file set and session pause record before upload. Ensure upload retry state and recovery ZIP manifest carry the same pause summary and exact session ID. Do not clear local backups until the existing successful final archive path completes.

- [ ] **Step 5: Run focused tests and full test suite**

Run: `npm test -- --run src/core/experiment-data.test.ts src/core/data-save-service.test.ts src/core/local-backup-store.test.ts src/core/zip-recovery.test.ts src/experiment-runner.test.ts`; then `npm test -- --run`.

Expected: all tests pass, including existing DataPipe and recovery tests.

- [ ] **Step 6: Commit export integration**

```bash
git add src/core/experiment-data.ts src/core/data-save-service.ts src/core/local-backup-store.ts src/core/upload-state.ts src/core/zip-recovery.ts src/experiment-runner.ts src/core/experiment-data.test.ts src/core/data-save-service.test.ts src/core/local-backup-store.test.ts src/core/zip-recovery.test.ts src/experiment-runner.test.ts
git commit -m "feat: export experiment pause metadata"
```

### Task 7: End-to-end verification and handoff

**Files:**
- Modify only if required by verification: `src/**/*.ts`, `src/**/*.test.ts`, `src/styles/layout-task.css`
- Verify: `docs/superpowers/specs/2026-09-25-experiment-pause-design.md`

- [ ] **Step 1: Run all automated checks**

Run:

```bash
npm test -- --run
npm run build
git diff --check
```

Expected: all tests pass, production build succeeds, and no whitespace errors are reported.

- [ ] **Step 2: Run browser smoke verification on the active experiment**

Start the dev server and verify the formal experiment, not only `/experiment/` in isolation. Check:

1. Pause is present on the reference board, tutorial, formal trial, and transition pages.
2. Tutorial Pause -> 10-second practice -> Resume advances and leaves the formal button enabled.
3. Formal Pause confirmation consumes the quota only after confirmation.
4. Refresh during formal pause preserves the same session and consumed quota; if the current page is reattached, the remaining countdown is restored, otherwise no second Pause button appears.
5. Manual Resume disables Pause permanently.
6. A simulated 15-minute expiry auto-resumes and disables Pause.
7. Final output has raw timestamps, active durations, and matching pause metadata in local and network payload paths.

- [ ] **Step 3: Review the final diff and commit any verification fix**

Run `git status --short` and `git diff --stat`. If a verification fix is required, add a focused regression test in the owning task before committing it with a message that names the regression.

- [ ] **Step 4: Report the implementation handoff**

Report the final commit range, test/build results, browser smoke result, session persistence behavior, and any intentionally untested browser/network limitation. Do not claim DataPipe delivery succeeded without a real receiver response.
