# Experiment Runner, Tutorial, Confidence, And Data Save Spec

## Goal

Build a static GitHub Pages friendly experiment flow around the existing LayoutTask player.

The experiment runs:

```text
tutorial
  -> formal LayoutTask trial 1
  -> formal LayoutTask trial 2
  -> ...
  -> end page / DataPipe save
```

Use jsPsych as the top-level runner. Each formal LayoutTask trial remains one trial containing both preview stimulus and reconstruction submission.

## Experiment Config

Add an experiment-level config file. It owns study sequence and runner-level save settings, not per-task geometry.

Recommended shape:

```json
{
  "schema": "layouttask.experiment.v1",
  "experiment_id": "layout_task_v1",
  "baseUrl": "/layout-task-generated/",
  "order": "fixed",
  "tutorial": {
    "enabled": true,
    "taskId": "tutorial_room",
    "qid": "QTUTORIAL"
  },
  "confidence": {
    "required": true,
    "scale": [1, 2, 3, 4, 5],
    "labels": {
      "1": "很不确定",
      "2": "不太确定",
      "3": "一般",
      "4": "比较确定",
      "5": "很确定"
    }
  },
  "data_save": {
    "mode": "datapipe",
    "experiment_id": "layout_task_v1",
    "endpoint": "https://pipe.jspsych.org/api/data/",
    "filename_prefix": "layout-task"
  },
  "trials": [
    { "taskId": "scene_001", "qid": "Q001" },
    { "taskId": "scene_002", "qid": "Q002" }
  ]
}
```

`experiment.json` manages tutorial, fixed trial order, confidence labels, and one final DataPipe save. `manifest.json` and `tasks/*.json` remain responsible for LayoutTask task content.

Runner-level `data_save` belongs in `experiment.json`, not in each task, because saving happens once after the full jsPsych timeline.

## Trial Flow

Formal trials must use the existing `preview_then_reconstruct` flow:

```text
preview stimulus
  -> reconstruction
  -> confidence required
  -> submit
```

The runner does not rewrite task configs. Experiment preflight fails if a formal trial is missing `preview_then_reconstruct` or is missing enabled `display_image`.

## Tutorial

The tutorial reuses a normal LayoutTask task and adds a top-layer guided bubble controller.

Tutorial behavior:

- Runs once at the start.
- Cannot be skipped in formal runs.
- Uses real player interaction, not fake controls.
- Starts with a short explanation before preview: what the participant will see, what they must remember, and that they will reconstruct afterward.
- Includes preview, reconstruction, selecting a group, moving, rotating, choosing confidence, clicking outside to deselect, selecting another group, and submitting.
- The bubble points to the relevant object/control/area for the current step.
- The next tutorial step starts only after the participant completes the correct operation.
- Tutorial data is lightweight: completed flag and duration. Full practice event logs are not required for v1.

The tutorial must explicitly explain that a furniture group may need no movement or rotation, but still requires a confidence choice.

## Confidence

Confidence is required for formal reconstruction tasks.

Unit:

- Record by `group_id`.
- If a variable object has no `group_id`, fall back to its object id.
- A group needs confidence if it contains at least one `role: "variable"` object.
- Pure fixed/context groups do not need confidence.

Scale:

- 1 = 很不确定
- 2 = 不太确定
- 3 = 一般
- 4 = 比较确定
- 5 = 很确定

Interaction rules:

- Entering edit mode for a furniture group clears that group's current edit confidence state.
- There is no default selected value.
- A value exists only after the participant explicitly chooses 1-5.
- The participant cannot leave the current group edit state until confidence is chosen:
  - clicking outside is blocked
  - selecting another group is blocked
  - submitting is blocked
- Returning to a previously edited group requires choosing confidence again.
- Selecting a group without moving or rotating it still requires confidence before leaving.
- A formal trial cannot be submitted until every variable furniture group has been selected at least once and has a valid final confidence value.

Result shape:

```json
{
  "confidence": {
    "m01_group": 4,
    "m02_group": 2
  }
}
```

The final value for each group is the last valid confidence value after the latest edit session for that group.

## Participant Identity

Prefer externally supplied participant id from URL parameters, in this priority order:

```text
participant
participant_id
subject
subject_id
PROLIFIC_PID
```

If none is supplied, generate one:

```text
P_YYYYMMDD_HHMMSS_RANDOM
```

Generated participant ids may be stored in `localStorage` so the same browser keeps a stable fallback id.

Always generate a new session id on page load:

```text
S_YYYYMMDD_HHMMSS_RANDOM
```

Use browser-native randomness, such as `crypto.getRandomValues()`, with a 6-8 character base36/base32 suffix. No dependency is needed.

## Data Save

Save once per participant/session, not once per trial.

At the end:

1. jsPsych has collected all formal LayoutTask trial data.
2. The runner builds one CSV row.
3. The runner uploads one CSV file to DataPipe/pipeline.
4. If upload fails, the end page shows a clear error and offers copy/download fallback for the exact CSV content.

Recommended CSV columns:

```csv
participant_id,session_id,experiment_id,start_time,end_time,n_trials,tutorial_completed,tutorial_duration_ms,trial_order_json,trial_results_json
```

`trial_results_json` is plain, uncompressed JSON in v1. Each formal trial item keeps both:

- `encoded`: compatibility/fallback for the existing decoder path.
- `result`: direct JSON for pipeline parsing and manual inspection.

One participant/session uploads one CSV file with one row. DataPipe filename:

```text
layout-task_{participant_id}_{session_id}.csv
```

Both `participant_id` and `session_id` must also appear inside the CSV row.

DataPipe POST uses the same endpoint shape as the existing single-trial save path:

```json
{
  "experimentID": "layout_task_v1",
  "filename": "layout-task_P001_S_20260702_153012_B7Q9MD.csv",
  "data": "participant_id,session_id,..."
}
```

## Experiment Preflight

Add a runner-level preflight before GitHub Pages deployment.

Minimum checks:

- `experiment.json` loads and matches schema.
- `baseUrl` points to a deployable LayoutTask base.
- Tutorial task exists when tutorial is enabled.
- Every formal trial listed in `trials` exists in the LayoutTask manifest.
- Every formal trial uses `flow.mode: "preview_then_reconstruct"`.
- Every formal trial has enabled `display_image`.
- Reuse runtime package preflight to catch missing assets, malformed collider SVGs, and illegal variable/context overlaps.

Preflight should fail deployment for missing tasks, missing preview flow, missing display images, missing assets, or collision-invalid formal packages.

## Testing

Use mostly small deterministic tests:

- Pure function tests for participant/session id generation, CSV escaping, experiment config parsing, timeline data assembly, and DataPipe payload generation.
- Schema/preflight tests for missing tutorial, missing formal task, non-preview formal task, missing display image, and invalid runtime package.
- Confidence state tests for clearing on edit entry, blocking leave/switch/submit without confidence, allowing exit after confidence, and requiring all variable groups before submit.
- jsPsych runner tests for fixed-order timeline creation, tutorial metadata, formal trial collection, end-page CSV generation, and DataPipe success/failure.
- Browser smoke using the open browser/Chrome operation skill on a tiny package: tutorial plus two preview trials. Verify preview image appears, confidence gating works, and final CSV is produced.

Avoid a brittle large browser automation suite that clicks through every furniture action. Core behavior should be covered by state and runner tests; browser testing is for smoke-level integration.

## Deployment

GitHub Pages can host the experiment as static files. The deployable package must include:

- built JS/CSS
- `experiment.json`
- generated task JSON
- object/background/display-image assets
- icons
- manifests and behavior libraries

If preview stimulus is missing in deployment, first check `flow`, `display_image`, `baseUrl`, and copied assets.
