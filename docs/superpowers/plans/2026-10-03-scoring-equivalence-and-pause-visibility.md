# Scoring Equivalence and Pause Visibility Implementation Plan

## Constraints

- Work in the existing `release/zh-CN` checkout; do not create a worktree.
- Protect all existing dirty user files and `public/layout-task-run12-core23-compiled/assets/collision/`.
- Do not modify `public/layout-task-tutorial/`.
- Use TDD for every task: write the failing test, run it and record the expected
  failure, implement the smallest change, run focused tests, perform a Grill-me
  self-check, then commit only that task.
- Keep the source and participant-facing packages aligned. Publish both
  `web-release/main` (Chinese) and `web-release/en-US` (English) after validation.

## Task 1: Add generic scoring equivalence metadata

Files:

- `src/types/batch.ts`
- `src/schemas/batch.schema.ts`
- `src/types/reward.ts`
- `src/core/batch-compiler.ts`
- `src/core/batch-compiler.test.ts`

RED: add a compiler test with `equivalence_classes.rotation_steps: [[-2, 2]]`
and assert it is emitted in the scoring reference; run the focused test and record
the missing-field failure.

GREEN: add the shared type/schema field and copy it through the compiler. Preserve
the current JSON schema version and exact behavior when the field is absent.

Focused verification: `npx vitest run src/core/batch-compiler.test.ts`.
Grill-me: confirm the compiler only transports authored metadata and does not
recognize `M05` or any asset name.
Commit: `feat: add data-driven scoring equivalence metadata`.

## Task 2: Apply equivalence in runtime and offline scoring

Files:

- `src/core/reward-calculator.ts`
- `src/core/reward-calculator.test.ts`
- `tools/scoring/scoring-utils.ts`
- `tools/scoring/scoring-utils.test.ts`

RED: add tests for declared `[-2, 2]` equivalence in both directions, and a
negative test proving an undeclared object still requires exact equality. Run both
focused test files and record the failures.

GREEN: implement one small generic equivalence helper shared by the runtime
reward path and offline scoring path. Use exact equality first, then declared
equivalence classes. Do not add model-specific branches.

Focused verification: the two focused Vitest files.
Grill-me: check that target `0` is not accidentally matched by `2`, and that the
new field never changes position scoring.
Commit: `feat: honor scoring equivalence classes`.

## Task 3: Annotate and regenerate the R12 M05 references

Files/data:

- `assets/generated-experiments/run_12_core_23/source/batch.json`
- generated R12 scoring references and task packages produced by the existing
  compiler; do not hand-edit collision assets.

RED: add a batch/compiler assertion that the authored M05 variable carries the
equivalence class and that non-M05 objects do not. Run the focused compiler test
and record the failure before annotation/regeneration.

GREEN: add the declaration to the authored M05 variable objects, compile the
existing R12 input into the established compiled/persistent package locations,
and verify all 23 M05 declarations are present while other objects are unchanged
in scoring metadata.

Focused verification: batch compiler tests plus the repository's package and
scoring-reference validators.
Grill-me: compare source-package hashes and collision directory contents before
and after; no tutorial source or collision file may change.
Commit: `data: declare R12 M05 rotation equivalence`.

## Task 4: Hide Pause until an interactive Layout Task is ready

Files:

- `src/plugins/jspsych-layout-task.ts`
- `src/experiment-runner.ts`
- `src/core/experiment-pause-ui.test.ts`
- `src/experiment-runner.test.ts`

RED: add lifecycle tests proving Pause is hidden at trial start and becomes active
only through the Layout Task ready callback; add a regression test for the
reference-board-to-tutorial transition. Run focused tests and record the failure.

GREEN: add the internal function callback to the plugin parameter surface,
activate it immediately after `player.start()`, and make runner `on_trial_start`
hide Pause before every trial. Keep `setTutorialPracticeEnabled` unchanged so the
tutorial and formal controllers remain separate.

Focused verification: `npx vitest run src/core/experiment-pause-ui.test.ts src/experiment-runner.test.ts`.
Grill-me: inspect that instructions, reference board, tutorial-complete, loading,
and config-error paths cannot make the button visible.
Commit: `fix: show pause only after task mount`.

## Task 5: Recompile and validate local packages

Run the existing R12 compiler/validation commands used by the repository. Validate:

- 23 formal tasks and 25 scheduled presentations remain unchanged.
- all scoring references load and include only the intended equivalence metadata.
- `public/layout-task-tutorial/` is byte-for-byte unchanged.
- collision assets are unchanged.
- both debug locales and the formal configs load with the updated runtime.

Run `npm test -- --run`, `npm run build`, `npm run validate:web-release`, and
`git diff --check` after focused checks. Grill-me the complete local package
contents and output paths.
Commit: `build: regenerate R12 packages with scoring metadata` if generated files
are tracked and changed.

## Task 6: Synchronize the two participant-facing branches

Use the existing `web-release` remote. Put built `dist/` contents at the root of
`main` (Chinese) and `en-US` (English), preserving the repository's established
root redirect and package structure. Do not push source files or a nested `dist`.

Validate each branch contains the new runtime, R12 package, scoring reference, and
tutorial assets. Verify both remote branch heads after pushing.

Grill-me: check that the packages are identical in behavior, locale configuration
is correct, and no old package was accidentally deployed.
Commit/push: use the existing release-package workflow and report exact hashes.

## Task 7: Browser smoke test and final verification

Start Vite on an available port and test the actual experiment entry for:

- four reference pages: no Pause;
- reference-to-tutorial loading: no Pause;
- tutorial practice: Pause appears after the interactive task mounts;
- formal task: Pause appears after mount;
- M05 scoring metadata is loaded and the page still advances normally.

Run the final verification skill with fresh commands, inspect `git status`, and
report commits, branch, test/build/package outputs, browser URL, release branch
hashes, and any limitation. Do not claim completion without fresh evidence.
