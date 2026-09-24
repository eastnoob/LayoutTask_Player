# Persistent Reference Condition Verification

Date: 2026-09-24
Branch: `persistent-reference-condition`

## Scope

Implemented the persistent reference condition from the workplan. The existing
`preview_10s` condition remains the default. The protected tutorial source
`public/layout-task-tutorial/` was not used as a compiler output directory and
was not modified.

The workplan contains Tasks 1 through 6; there is no separate Task 7 heading in
the checked-in plan.

## Task Results

1. **Task 1: reference-mode contract**
   - Added the shared `preview_10s | persistent` contract, schema defaults,
     loader normalization, and experiment configuration support.
   - RED tests confirmed missing mode support; focused tests then passed.
   - Grill check: omitted mode still resolves to `preview_10s`, invalid values
     fail through schema validation, and overrides do not mutate authored tasks.
   - Commit: `2186592 feat: add reference mode configuration`

2. **Task 2: conditional runtime behavior**
   - Persistent mode skips the preview gate and keeps the reference frame visible
     during reconstruction; preview behavior remains unchanged.
   - RED behavior tests preceded the implementation; focused flow/renderer/player
     tests passed afterward.
   - Grill check found no persistent countdown, no preview image leakage into the
     old mode, and no reference image in floor-plan world coordinates.
   - Commit: `fa26646 feat: support persistent reference display mode`

3. **Task 3: observable assistance recording**
   - Added scoped reference-frame assistance observations and result metadata.
   - RED recorder tests preceded implementation; focused tests passed.
   - Grill check confirmed floor-plan zoom/pan, resize, orientation, and DPR
     changes are not classified as prohibited reference assistance.
   - Commit: `d577fb3 feat: record reference assistance observations`

4. **Task 4: isolated persistent package**
   - Added compiler mode selection and generated
     `public/layout-task-run12-core23-persistent/` from the real R12 batch.
   - RED compiler/package tests preceded implementation; focused compiler tests
     passed.
   - Grill check confirmed preview and persistent packages retain the same task
     poses, assets, and scoring inputs apart from intentional mode metadata, and
     the tutorial source remains protected.
   - Commit: `c641859 feat: compile isolated persistent reference package`

5. **Task 5: timeline and results metadata**
   - Propagated the mode through the tutorial/formal timeline and result export.
   - Tutorial and formal rows retain explicit `trial_type` values; formal R12
     remains 23 trials.
   - RED timeline/export tests preceded implementation; focused tests passed.
   - Grill check confirmed tutorial rows do not become formal rows and mode is
     carried explicitly rather than inferred from task IDs.
   - Commit: `a020285 feat: export persistent reference condition metadata`

6. **Task 6: verification and loader correction**
   - During the real browser smoke test, the full experiment still showed the
     preview gate. A regression test reproduced that `ConfigLoader` dropped an
     explicit `persistent` selection and returned `preview_10s`.
   - RED: `ConfigLoader reference mode > forwards an explicit persistent reference mode into the runtime config` failed with received `preview_10s`.
   - GREEN: the focused config-loader suite passed after forwarding
     `selection.referenceMode` into `resolveRuntimeConfig`.
   - Grill check: default and authored task-level mode behavior remain covered;
     the correction changes only the configuration boundary.
   - Correction commits: `b996fdf fix: align persistent mode type boundaries` and
     `bba94aa fix: forward reference mode through config loader`.

## Verification Evidence

- `npm test -- --run`: **PASS**, 43 test files, 410 tests.
- `npm run build`: **PASS**, TypeScript compilation and Vite production build.
- `npx tsx tools/generator/validate-runtime-package.ts public/layout-task-run12-core23-preview --check-targets`: **PASS**, 23 tasks, 92 variable objects, no failures.
- `npx tsx tools/generator/validate-runtime-package.ts public/layout-task-run12-core23-persistent --check-targets`: **PASS**, 23 tasks, 92 variable objects, no failures.
- `git diff --check`: no diff errors; only existing line-ending warnings.
- `public/experiment/experiment-persistent.json` resolves to the persistent base
  package, declares `reference_mode=persistent`, points tutorial loading at the
  package-local `tutorial/`, and contains 23 formal trials.
- `public/layout-task-tutorial/` has no Git diff after compilation.

## Browser Smoke Test

Vite was started on `127.0.0.1:5173`. The real persistent experiment was opened
at:

`http://127.0.0.1:5173/experiment/?config=experiment-persistent.json`

The flow loaded the four reference-board pages and reached the fixed tutorial.
The perspective image remained visible above the floor plan, the tutorial
instruction was shown, and the obsolete `Start preview` / 10-second preview
gate was absent after the loader correction.

A direct formal task entry was also opened at:

`http://127.0.0.1:5173/?base=layout-task-run12-core23-persistent%2F&task=scene_be84fc97a8d1`

It loaded the task heading, reference image, floor-plan stage, and zoom controls
from the self-contained persistent package.

## Preserved Worktree State

The unrelated dirty user changes were left untouched, including the existing
asset, renderer, tutorial, message, URL, completion, and main-entry changes.
The untracked `public/layout-task-run12-core23-compiled/assets/collision/`
directory was preserved. The unrelated untracked tutorial-package-separation
plan was also preserved.

## Remaining Limitation

The browser smoke test did not submit all 23 formal trials or produce a live
participant result file. Package-level counts, schema, timeline, result-export
tests, and the persistent runtime entry were verified. Browser-scale assistance
is recorded only when the browser exposes an observable `visualViewport` scale
change; the implementation does not claim to detect unavailable browser state.
