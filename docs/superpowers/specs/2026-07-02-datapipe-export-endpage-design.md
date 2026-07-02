# DataPipe Export And End Page Design

## Goal

After the tutorial and all formal layout trials finish, the experiment saves analysis-friendly CSV files to DataPipe/OSF, then shows a final English page telling the participant the study is complete and the page can be closed.

## Tutorial-To-Formal Page

Keep the current warning page, but add a compact ASCII diagram so the participant sees the repeated trial structure before starting the formal experiment:

```text
Study image -> Reconstruct scene -> Rate confidence -> Submit
```

The page remains short and uses the existing jsPsych instructions plugin.

## End Page

Replace the current "data is being saved" finish page with a final state page after saving completes.

Success text:

```text
Experiment complete. Your data has been saved.
You may now close this page.
```

Failure text:

```text
Experiment complete, but automatic saving failed.
Please copy or download the data shown below, then contact the researcher.
```

Add a `Close page` button that calls `window.close()`. If the browser does not close the tab, show a short fallback message asking the participant to close it manually.

## DataPipe Files

Use the provided DataPipe experiment id:

```text
mshCnq690sD5
```

Keep the existing direct DataPipe API save path instead of adding the jsPsych Pipe CDN. Save three files per participant session:

```text
layout_session_<participant_id>_<session_id>.csv
layout_results_<participant_id>_<session_id>.csv
layout_events_<participant_id>_<session_id>.csv
```

DataPipe does not need OSF folders. The shared filename prefix groups files for the same participant/session when sorted.

## CSV Shapes

`layout_session` has one row per experiment run:

```text
participant_id,session_id,experiment_id,started_at,ended_at,duration_ms,tutorial_completed,tutorial_duration_ms,n_trials,trial_order_json,user_agent,viewport_width,viewport_height,screen_width,screen_height
```

`layout_results` has one row per formal trial object:

```text
participant_id,session_id,experiment_id,trial_index,task_id,qid,object_id,confidence,origin_x,origin_y,origin_rotation,movement_step,rotation_step,final_x,final_y,final_rotation,relative_dx_steps,relative_dy_steps,relative_rotation_steps,start_time,end_time,duration_ms,flow_mode,preview_duration_ms,task_config_hash,encoded,hash8
```

`layout_events` has one row per recorded formal trial event:

```text
participant_id,session_id,experiment_id,trial_index,task_id,qid,event_index,event_time_ms,object_id,action,valid,blocked_reason,before_x,before_y,before_rotation,after_x,after_y,after_rotation,relative_dx_steps,relative_dy_steps,relative_rotation_steps,pointer_client_x,pointer_client_y,pointer_world_x,pointer_world_y
```

If a value is missing, leave the CSV cell blank. Do not JSON-compress these files; pipeline can merge flat CSVs directly.

## Implementation Notes

Reuse current `LayoutTaskResult` payloads from jsPsych formal trials. `layout_results` is derived from each result's `final_state` plus `context.objects`. `layout_events` is derived from each result's `events`. Browser and display metadata should live only in `layout_session`, not repeated on every object row.

Keep copy-mode as a fallback for local/demo use. In DataPipe mode, save all three CSV files before rendering the final page.

## Verification

- Unit tests cover CSV generation and DataPipe payload filenames.
- `pixi run test`
- `pixi run build`
- Browser smoke test completes one experiment run against `mshCnq690sD5`.
- Confirm the final page reports saved data; if OSF access is available, confirm the three files appear with the same participant/session prefix.
