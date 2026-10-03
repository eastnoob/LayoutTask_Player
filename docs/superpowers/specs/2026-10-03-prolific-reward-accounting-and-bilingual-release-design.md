# Prolific identity and reward accounting design

## Goal

Make the participant-facing experiment collect a Prolific ID before the
tutorial, preserve it with the complete session, and export auditable reward
and correctness summaries for the current bilingual R12 packages. The same
runtime behavior must be available in Chinese, English, and developer mode;
only visible language/configuration and developer isolation differ.

## Existing gap

The player can read several URL parameters, including `PROLIFIC_PID`, but it
does not display a participant-facing Prolific ID question or preserve an
independently named `prolific_id` field through every output. Reward scoring
already compares each variable furniture group with the task's scoring
reference and records per-group position/rotation booleans, but it does not
export aggregate counts for correct position, correct rotation, both correct,
or both wrong. The end page also formats the configured reward using `€`.

## Decisions

### Participant flow

After consent and before any tutorial page or formal assignment request, show
a required Prolific ID page. The input preserves the original user string
after trimming only surrounding whitespace for validation; the stored value is
the entered string. Empty or whitespace-only input cannot continue. The page
may be completed with normal clipboard paste.

Developer mode is entered from the consent page's Konami-code path. It skips
the real participant ID requirement, uses participant `9999`, and records the
explicit marker `DEBUG_9999` as `prolific_id`; it must never use a researcher's
real ID. The debug flow otherwise runs the same tutorial, formal trials,
scoring, saving, and upload pipeline.

### Scoring and reward

The existing scoring reference remains authoritative. For each scorable
variable furniture group, compare relative `dx_steps`, `dy_steps`, and
`rotation_steps` independently. Record:

- `position_correct`: position matches;
- `rotation_correct`: rotation matches;
- `both_correct`: both booleans are true;
- `both_wrong`: both booleans are false;
- movement and rotation reward components;
- group reward and cumulative reward.

Aggregate only formal trial results. Tutorial results never contribute to
formal counts or reward. The session summary records the number of formal
groups with correct position, correct rotation, both correct, both wrong, and
the total number of scorable groups. It also records base reward, earned
reward, total reward, formal trial count, and rewarded group count.

The production configuration remains £4 base reward plus £0.04 for each
correct position and £0.04 for each correct rotation. Values stay in integer
cents in data and are displayed with the `£` symbol on the final page.

### Persistence and transport

`prolific_id` and the reward summary must appear in:

- session, results, raw-results, events, and rewards CSV files where the field
  is meaningful;
- the debug JSON document;
- the per-trial result JSON and session summary;
- IndexedDB session metadata and backed-up files;
- recovery ZIP `manifest.json` and its files;
- receiver/DataPipe submission metadata and uploaded files.

The existing one-time final upload and recovery behavior remains unchanged.
No new endpoint or invented production configuration is introduced.

### Bilingual release

Chinese keeps its configured completion-code gate. English continues to skip
that gate, as required by the current platform flow. Both configurations use
the same identity and reward fields. The build must produce a complete static
package with root `manifest.json`, current assets, experiment configs, and the
R12 persistent/tutorial packages. The published web repository must contain
the built files directly at its branch root, with `main` as Chinese and
`en-US` as English.

## Non-goals and protections

- Do not modify `public/layout-task-tutorial/`.
- Do not delete or regenerate `assets/collision/`.
- Do not alter furniture geometry, coordinates, rotations, or visual behavior.
- Do not change the scoring reference or schedule semantics.
- Do not add Process Integrity Index or automatic participant exclusion.
- Do not publish a historical build or the legacy standalone package as the
  web-package root.

## Acceptance criteria

1. A normal participant must enter a non-empty Prolific ID before tutorial
   content appears.
2. The original entered ID is present in every required local, recovery, and
   remote output.
3. A developer session uses participant `9999` and `DEBUG_9999` without
   requiring a real Prolific ID.
4. Correctness and reward aggregates are mathematically consistent with the
   existing per-group scoring reference and count formal trials only.
5. The final page shows base, earned, and total rewards in pounds.
6. Chinese and English package configs preserve their language-specific gate
   behavior while sharing the new data flow.
7. Fresh builds validate as self-contained web packages and load the current
   assets without `manifest.json` or asset 404s.
