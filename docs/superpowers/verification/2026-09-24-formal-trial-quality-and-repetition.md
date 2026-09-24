# Formal Trial Quality And Repetition Verification

## Scope

This verification covers the implementation plan `2026-09-24-formal-trial-quality-and-repetition.md` on branch `codex/formal-trial-quality-and-repetition`, created from updated `main` after the fast-forward merge of `persistent-reference-condition`.

## Results

- Full tests: `npm test -- --run` passed, 48 test files and 426 tests.
- Build: `npm run build` passed.
- Schedule validator: passed for `public/layout-task-run12-core23-persistent/schedule.json`.
- Experiment package validator: passed for `public/experiment/experiment-persistent.json`.
- Runtime package validator: passed; 23 tasks and 92 variable objects.
- Direct formal task smoke test: `http://127.0.0.1:5174/?base=layout-task-run12-core23-persistent%2F&task=scene_be84fc97a8d1` loaded successfully.
- Formal experiment entry smoke test: `http://127.0.0.1:5174/experiment/?config=experiment-persistent.json` loaded the reference board and its continue countdown.

## Data And Recovery

The formal schedule contains 23 unique scenes and 25 presentations. Two repeat presentations retain independent presentation metadata and are separated by the configured lag. Tutorial rows are classified separately and do not contribute to the formal count.

Trial-level DataPipe backups use the existing JSON-envelope contract with `schema`, `qid`, `task_id`, `session`, `hash8`, `encoding`, and `encoded`. The experiment-level export keeps the plain CSV files and produces a complete recovery ZIP when one or more uploads fail.

No Process Integrity Index was added. Raw metadata remains available for offline analysis, and response consistency is not an automatic exclusion.

## External Configuration

No approved production endpoint/token pair was present for the persistent configuration. The existing dirty receiver configuration in `public/experiment/experiment.json` was preserved and was not copied into the persistent package. No endpoint or token was invented.

## Protected Worktree State

Existing user modifications remain untouched, including `public/layout-task-run12-core23-compiled/assets/collision/` and the other pre-existing dirty paths. `git diff --check` reports only the pre-existing trailing blank line in `docs/superpowers/plans/2026-09-23-tutorial-package-separation.md`.
