# Experiment Pause and Resume Design

**Date:** 2026-09-25  
**Status:** Design specification; implementation requires a reviewed workplan.  
**Scope:** Experiment runner, interactive tutorial, timing, persistence, local recovery, and data export.

## 1. Goal

Give participants one real opportunity to pause the experiment for up to 15 minutes, while keeping the tutorial self-contained and teachable. The pause control must be available throughout active experiment pages, must not alter the task state, and must produce auditable timing and pause metadata in every relevant output path.

The tutorial includes a practice pause interaction. The practice pause is explicitly marked as tutorial-only and does not consume the participant's one formal pause opportunity.

## 2. Confirmed Rules

- The formal experiment has exactly one pause opportunity per session.
- The formal pause may last at most 15 minutes.
- A participant may resume manually before the limit.
- At 15 minutes the experiment automatically resumes and the opportunity becomes permanently consumed.
- The pause opportunity remains consumed after a page refresh in the same browser tab/session.
- The tutorial pause is a practice interaction and never consumes the formal opportunity.
- While paused, task interaction, reference-image zoom, floor-plan zoom/pan, drag, movement, rotation, confidence selection, and submit actions are blocked.
- The pause control is visible on every active tutorial/formal page, including reference-image presentation pages, and hidden on saving and completion pages.
- Correctness is not inferred from pause use; pause data is diagnostic metadata only.

## 3. Architecture

Add an experiment-level `ExperimentPauseController` owned by the experiment runner. It is not implemented inside `LayoutTaskRenderer` or per-trial controllers because the pause spans instructions pages, reference-board pages, the interactive tutorial, formal trials, and trial transitions.

The controller owns:

- the state machine;
- the fixed-position Pause/Resume control and confirmation dialog;
- the blocking overlay while paused;
- the 15-minute countdown and automatic resume;
- session persistence and restoration;
- pause event callbacks for timing and result collection;
- tutorial practice mode.

The runner passes a small pause interface to pages and the LayoutTask player. The player remains responsible for furniture interaction, but must reject input while the pause interface reports `paused`.

### 3.1 State machine

Formal mode:

```text
available -> confirming -> paused -> resumed
available -> confirming -> paused -> auto_resumed
resumed/auto_resumed -> consumed
```

The persisted formal state is monotonic: once the pause is confirmed, `pause_used` cannot return to false. A cancelled confirmation leaves the state `available`.

Tutorial mode uses a separate transient state:

```text
practice_available -> practice_paused -> practice_resumed
```

Tutorial practice state is not written into the formal pause quota.

### 3.2 UI behavior

- Render a consistent Pause button in a fixed, non-obstructive location compatible with the existing LayoutTask visual language.
- Confirmation text must state that this is the participant's only formal pause and that it lasts no longer than 15 minutes.
- During formal pause, show a modal/overlay with remaining time and a Resume button.
- Disable or intercept all underlying pointer, keyboard, wheel, drag, zoom, and submit interactions.
- On manual resume, remove the overlay, resume active timing, and render a disabled Pause button.
- On automatic resume, perform the same UI transition and show no second confirmation.
- The tutorial highlights the Pause button, requires the participant to use it, shows a 10-second practice countdown, then requires Resume before advancing.
- The tutorial's final page uses bullet points and explains the one-time 15-minute break, voluntary termination without payment or penalty, and truthful responding requirements.

## 4. Session Persistence

The experiment must reuse a session identifier stored in `sessionStorage` for the current browser tab. A fresh tab receives a new session identifier. This avoids cross-participant leakage from long-lived `localStorage` while allowing refresh recovery in the same tab.

Persist a versioned pause/session record under an experiment-scoped key containing:

- `schema_version`;
- `experiment_id`;
- `participant_id`;
- `session_id`;
- `mode` (`tutorial_practice` or `formal`);
- `pause_used`;
- `pause_started_at`;
- `pause_ended_at` when available;
- `pause_duration_ms` when available;
- `pause_end_reason` (`manual_resume` or `auto_resume_15m`);
- `updated_at`.

When restoring a formal paused record, calculate elapsed wall-clock pause time. If the existing runner can reattach to the active page, resume the countdown from the stored start time. If it is at or above 15 minutes, automatically close the pause as `auto_resume_15m`, mark the opportunity consumed, and continue the experiment. A refresh must never grant a second pause opportunity. This feature does not introduce a new full-timeline checkpoint/resume system; existing page/task recovery behavior remains the boundary for restoring the exact current trial.

Persistence failures must not create a second opportunity. The in-memory state remains consumed after confirmation, and the failure is recorded in diagnostic metadata when possible.

## 5. Timing Semantics

Do not overwrite raw wall-clock timestamps. Preserve raw start/end timestamps and add active-time fields.

The canonical active-time calculation is:

```text
active_duration_ms = max(0, wall_end_ms - wall_start_ms - total_formal_pause_duration_ms)
```

Apply the same rule to:

- experiment/session duration;
- tutorial duration, excluding only tutorial practice pause time;
- formal trial duration when a pause crosses a trial boundary;
- player elapsed time and flow phase elapsed time where those fields are emitted.

The pause controller exposes an active clock or pause intervals rather than making each consumer subtract timestamps independently. This prevents inconsistent rounding and double subtraction.

The reference image's presentation duration remains a separate field. Because the pause control is available on every active page, a formal pause may start during the reference presentation gate. The presentation countdown freezes while paused, resumes afterward, and the paused interval is excluded from both presentation active duration and the enclosing trial/session active duration.

## 6. Output and Transport

Every output that currently carries session/trial timing must also carry pause metadata, using the same participant and session identifiers:

- session CSV: pause used/count, total pause duration, start/end, end reason, active duration;
- formal results CSV: per-row active duration and session pause summary;
- raw JSON/backup files: full pause event list and current pause state;
- tutorial result: `tutorial_pause_practice: true` and practice pause duration/events;
- local IndexedDB backup: the same files plus the resumable session/pause record;
- recovery ZIP manifest: pause state and all pause events;
- DataPipe payload: the same pause summary and event metadata, without changing the existing CSV content contract.

The participant-facing final page must not expose internal diagnostic complexity unless an upload fails. On upload failure, the recovery package must include the complete output set and the exact pause/session metadata used in the attempted submission.

## 7. Voluntary Termination

The final tutorial instructions must explain that participants may stop if the experiment causes discomfort. No new forced termination flow is required by this feature. If an existing termination path is present, it must record a termination event and preserve local recovery data without treating the session as successfully completed.

## 8. Compatibility and Scope

- Existing persistent-reference and preview reference modes remain unchanged except for the shared pause control and active-time accounting.
- Standalone LayoutTask player usage without the experiment runner remains functional; it may omit the experiment-level pause control unless a pause interface is explicitly supplied.
- Existing upload retry, IndexedDB backup, and recovery ZIP behavior remains intact.
- Tutorial pause practice must not appear as a formal trial and must not consume the formal pause quota.
- No new browser dependency is required.

## 9. Testing Requirements

Add unit tests for:

- formal state transitions and confirmation cancellation;
- one-time consumption after manual and automatic resume;
- 15-minute cap and automatic resume;
- sessionStorage restoration during and after a pause;
- tutorial practice isolation from formal quota;
- active-time calculations with one pause, refresh, and automatic resume;
- cross-trial pause accounting;
- disabled interaction while paused;
- tutorial step ordering and final bullet copy;
- pause metadata in session CSV, results CSV, raw JSON, tutorial result, backup manifest, and DataPipe payload;
- recovery after persistence or upload failure.

Add browser smoke coverage for:

1. tutorial Pause -> Resume practice;
2. one formal Pause -> manual Resume;
3. refresh during formal pause and restoration of the countdown;
4. automatic resume at the time limit;
5. disabled Pause after use;
6. final output containing pause metadata and active durations.

## 10. Acceptance Criteria

The feature is complete when a participant can use exactly one formal pause, the pause cannot be duplicated by refresh, tutorial practice remains separate, all active durations exclude paused time, and every local/network output can be joined by identical participant/session identifiers and explains how the pause ended.
