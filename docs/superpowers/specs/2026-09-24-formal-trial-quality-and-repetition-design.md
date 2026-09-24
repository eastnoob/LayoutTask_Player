# Formal Trial Quality and Repetition Design

**Date:** 2026-09-24  
**Status:** Draft for user review  
**Related note:** `docs/notes/2026-09-24-experiment-flow-design-notes.md`

## Goal

Extend the formal experiment from 23 unique scenes to 25 formal presentations by repeating two source-image stimuli, preserve every presentation and answer in the data, expose the true formal progress count, and record enough metadata for offline response-consistency analysis without implementing an automatic Process Integrity Index.

The change also defines deterministic counterbalancing, production DataPipe behavior, upload recovery, and separate tutorial/formal manifest validation.

## Non-goals

- Do not implement `Process Integrity Index` in the player, compiler, CSV, or automatic exclusion logic.
- Do not use `Response Consistency Index` as an exclusion rule, scoring rule, or automatic participant filter.
- Do not count tutorial pages or the interactive tutorial as formal trials.
- Do not add the tutorial task to the formal task manifest.
- Do not use review images containing `P01`-`P06` labels as formal stimuli.
- Do not silently change the existing task geometry, furniture poses, scoring tolerances, or collision behavior.

## Definitions

| Term | Meaning |
| --- | --- |
| Unique scene | One distinct formal scene/task identity. Run12 currently has 23. |
| Presentation | One appearance of a formal scene to one participant. Run12 will have 25. |
| Repeat group | The identity connecting the two presentations of the same scene. |
| First-order carry-over | The possible effect of the immediately preceding presentation on the current response. |
| Response consistency | Offline comparison of the two answers to the same repeated scene. |

## 1. Formal Count and Progress

The compiled schedule is authoritative for the total number of presentations. For the current package:

```text
unique_scene_count = 23
formal_presentation_count = 25
```

The formal player displays, for example:

```text
Trial 1 / 25
```

Rules:

- `trial_index` is one-based and refers to presentation order for the participant.
- `trial_total` is 25 for this package.
- Reference-board pages, tutorial interaction, and tutorial completion are not included.
- The tutorial can display `Tutorial` rather than a formal trial counter.
- The same `trial_index` and `trial_total` must be written to the row-level result and session-level export.
- The counter must follow the participant's selected schedule, not the order of task files in the manifest.

## 2. Repeated Stimuli

The following two formal scenes are presented twice each:

```text
scene_8902bfd7b7e4
scene_15d8ce4dbde3
```

The formal schedule therefore contains:

```text
23 unique scenes + 2 repeated presentations = 25 presentations
```

The repetitions use the unlabelled source images:

```text
E:/260917/assets/images/stimulus/8902bfd7b7e4_perspective_stimulus_1920x1080.png
E:/260917/assets/images/stimulus/15d8ce4dbde3_perspective_stimulus_1920x1080.png
```

The review images `9_962_8902bfd7b7e4.png` and `3_1435_15d8ce4dbde3.png` are inspection artifacts only and must never be referenced by the formal package.

The two presentations of a repeated scene must use equivalent task content so their answers are comparable: same perspective source, same floor-plan/task configuration, same object identities, same collision rules, and same scoring reference. Each presentation still receives its own unique `presentation_id` and complete saved answer.

Required presentation metadata:

```text
task_id
presentation_id
repeat_group_id
repeat_index
repeat_of_task_id
trial_index
trial_total
sequence_id
participant_number
```

For a first presentation, `repeat_index=1`; for the repeated presentation, `repeat_index=2`. `repeat_group_id` is equal for the pair. `repeat_of_task_id` points to the first presentation's task identity. The repeated row must not overwrite or merge with the first row.

Both repeated answers are ordinary formal data. They must appear in:

- the primary results export;
- the raw results export;
- event data;
- the per-trial backup;
- the final recovery ZIP.

## 3. Counterbalancing and Schedule Generation

### Design choice

The default strategy is Williams balanced first-order counterbalancing over the 23 unique scenes. For an odd number of conditions, a single Latin square cannot fully balance immediate sequential effects; the paired design produces `2n` base sequences. Therefore Run12 has:

```text
base_unique_scene_count = 23
base_sequence_count = 46
```

This is not a hard-coded value. The compiler derives it from the unique scene count and the selected strategy. A future package with six unique scenes would use six base sequences; participant 7 would map to sequence 1.

### Repetition insertion

The two repeated presentations are not treated as additional unique conditions in the base Williams square. For each base sequence:

1. create candidate positions for the two repeat occurrences;
2. require at least seven intervening formal presentations between each original and its repeat;
3. require the two repeat occurrences not to be adjacent;
4. validate the resulting complete 25-presentation sequence;
5. reject and regenerate deterministically if constraints fail;
6. emit diagnostics for every repeated pair and the final adjacent-pair counts.

The final 25-presentation sequence, not only the 23-item base sequence, is the artifact used by the player.

The phrase “seven-trial separation” means seven intervening presentations. With one-based positions:

```text
abs(repeat_position - original_position) >= 8
```

There is no universal academic law requiring lag 7. It is a preregistered, task-specific constraint motivated by the fact that lag affects memory, practice, and sequential response effects. The selected lag and rationale must be recorded in the schedule metadata rather than presented as a universal standard. Relevant methodological evidence discusses interval choice as context-dependent and reports lag-dependent behavior in repeated-stimulus tasks ([test-retest reliability and interval choice](https://pmc.ncbi.nlm.nih.gov/articles/PMC5466566/), [retest effects](https://pubmed.ncbi.nlm.nih.gov/29907925/), [sequential learning and lag](https://pubmed.ncbi.nlm.nih.gov/20396653/)).

### Participant assignment

The compiled package contains an explicit schedule table. Assignment is deterministic:

```text
sequence_id = ((participant_number - 1) % sequence_count) + 1
```

The package records the selected `sequence_id`; it does not perform an unseeded browser-side shuffle. If participant numbers are not guaranteed to be sequential, the deployment layer must provide a stable participant number or schedule assignment before the first formal trial.

### Schedule artifact

```json
{
  "schema": "layouttask.schedule.v1",
  "strategy": "williams_balanced_first_order",
  "unique_scene_count": 23,
  "presentation_count": 25,
  "base_sequence_count": 46,
  "minimum_intervening_trials": 7,
  "repeat_groups": [
    "scene_8902bfd7b7e4",
    "scene_15d8ce4dbde3"
  ],
  "sequences": [
    {
      "sequence_id": 1,
      "presentations": [
        {
          "presentation_id": "...",
          "task_id": "scene_...",
          "repeat_group_id": null,
          "repeat_index": 0
        }
      ]
    }
  ]
}
```

The schedule validator must prove:

- every sequence contains exactly 25 presentations;
- every sequence contains the 23 unique scenes plus exactly one repeat occurrence for each repeat group;
- each repeat pair satisfies the minimum lag;
- repeated source assets resolve to the unlabelled source image;
- no tutorial task occurs in a formal sequence;
- no presentation ID is duplicated;
- the selected sequence is fully reproducible from participant metadata.

## 4. Response-Consistency Metadata

No Process Integrity Index is generated by the application. The player preserves raw data needed for offline analysis.

For both presentations in each repeat group, save:

- final object positions and rotations;
- position uncertainty;
- rotation uncertainty;
- all valid actions;
- trial and active-interaction timing;
- display/browser metadata already supported by the recorder;
- upload status and attempts;
- repeat metadata from Section 2.

Offline analysis may derive:

```text
repeat_position_difference
repeat_rotation_difference
repeat_position_confidence_difference
repeat_rotation_confidence_difference
response_consistency_index
```

The application must not pre-combine these measures into a quality exclusion. Response consistency is a soft diagnostic and sensitivity-analysis variable only.

## 5. Position and Rotation Uncertainty

Each editable furniture group has two required confidence dimensions:

```text
How uncertain are you about this object's position?
How uncertain are you about this object's rotation?
```

Both must be selected and saved before leaving the group or submitting the presentation. The data shape is:

```json
{
  "group_id": {
    "position": 3,
    "rotation": 5
  }
}
```

The words `position` and `rotation` are bold and use the designated emphasis color. The visible scale is ordered high-to-low:

```text
5  Very sure
4  Sure
3  Neutral
2  Unsure
1  Very unsure
```

The numeric semantics remain unchanged: 1 is very unsure and 5 is very sure.

## 6. DataPipe and Recovery

Production compiled output uses DataPipe as the normal save path. Copy is not the normal production mode; it is only a recovery mechanism.

### Per-presentation save

After a formal presentation is completed:

1. freeze the completed presentation result;
2. show a saving overlay;
3. submit the compact trial backup;
4. record `upload_status`, `upload_attempts`, `upload_error`, and `uploaded_at`;
5. on success, automatically advance;
6. on timeout or failure, preserve the result, record the failure, and continue;
7. retry in the background with a stable backup identifier and bounded retry policy.

The participant must not be blocked indefinitely by a remote endpoint.

### Final save

At experiment completion:

1. submit the complete plain CSV export;
2. retry failed trial backups;
3. record all final outcomes;
4. if failures remain, create one ZIP from the complete authoritative result set;
5. show the configured recovery email and request that the participant send the ZIP.

The ZIP must include the complete set of available output files, including all 25 formal presentations and tutorial data where applicable. Its manifest must include participant, session, experiment, sequence, upload status, failure reason, and timestamp fields matching the network submissions.

Success and failure are statuses on one data model, not incompatible output formats.

## 7. Package Validation

The validator must treat tutorial and formal packages as separate roots:

1. read the formal manifest from `config.baseUrl`;
2. validate the 25-presentation schedule against the formal task set;
3. read the tutorial manifest from `config.tutorial.baseUrl`;
4. validate the tutorial task against the tutorial manifest;
5. never add the tutorial task to the formal manifest.

The old unconditional rule that every formal task must use `preview_then_reconstruct` must be replaced by a condition-aware validation rule. Direct reconstruction and persistent reference mode are valid when selected by the package condition.

## 8. Compatibility and Verification

Default behavior outside the selected production condition must remain unchanged. The implementation must verify:

- preview/tutorial packages still load;
- persistent and preview reference modes remain distinct;
- the formal schedule has 25 presentations;
- both repeat source images are unlabelled;
- every repeated answer is exported;
- no Process Integrity Index is silently added;
- response consistency is never an automatic exclusion;
- DataPipe success, failure, timeout, retry, final upload, and complete ZIP fallback are tested;
- tutorial/formal manifest validation passes;
- the production build contains every referenced asset.

