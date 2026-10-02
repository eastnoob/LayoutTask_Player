# Reward Incentive Implementation Plan

Branch: `codex/reward-incentive`

Backup: `backup/pre-reward-incentive-20260930`

## 1. Audit and protocol lock

- Verify compiled task/reference counts and repeat presentations.
- Add explicit reference metadata only where the package authoring data can
  identify scorable status; do not hard-code 100 or 19 in runtime logic.
- Grill-me checkpoint: reject object-level double counting, inferred missing
  groups, floating-point money, and tutorial reward leakage.

## 2. Types and schemas (TDD)

- Add reward config, reference metadata, result reward metadata, and export
  summary types.
- Add failing schema tests for defaults, cents validation, and explicit disable.
- Implement schemas and make those tests pass.
- Grill-me repair: preserve backward compatibility for old experiment and
  scoring-reference JSON.

## 3. Pure reward calculator (TDD)

- Add a small pure calculator keyed by `group_id`.
- Add failing tests for exact position/rotation, partial credit, unscorable
  completion, duplicate fixed/variable objects, repeats, and cumulative totals.
- Implement integer-cent calculation and pass the tests.
- Grill-me repair: ensure no task-local state leaks between repeated trials.

## 4. Reference loading and task integration

- Load the configured reference using the existing experiment loader.
- Pass only the current task reference into the player/plugin.
- Attach a provisional reward snapshot when the task is saved/finished.
- Grill-me repair: reward calculation must not alter save/confidence gates or
  expose correctness during a trial.

## 5. JSON/CSV export integration

- Add reward summary fields to existing session/results/debug outputs.
- Keep raw results and event schemas backward compatible.
- Add tests for one group with two SVG objects and repeated presentations.
- Grill-me repair: one group produces one reward row; each presentation is a
  separate row; tutorial is marked but excluded from formal totals.

## 6. Final reward display and receiver compatibility

- Show the final base, component, and total amounts only after the experiment.
- Keep receiver/DataPipe payload format and local recovery ZIP unchanged except
  for the new fields already present in JSON/CSV.
- Add receiver-side tests that accept and retain reward metadata without
  trusting it as a security decision.
- Grill-me repair: no second reward service, no new container, no live amount.

## 7. Package/config updates

- Update the active experiment configuration to enable rewards and point to
  the packaged scoring reference.
- Add explicit reward-version/reference metadata to generated package output
  only if the compiler already has the source data needed to do so.
- Do not mutate unrelated untracked notes or prior package variants.

## 8. Verification

- Run focused Vitest tests after each implementation slice.
- Run full `npm test`, receiver `pytest`, and `npm run build`.
- Start the dev server on an available port and verify final-page reward text,
  hidden trial reward state, and normal upload/recovery behavior.
- Final Grill-me: verify no unrequested scoring tolerance, no reward for
  tutorial, no missing reference silently converted to zero, and no branch
  history damage.

## Commit strategy

Use small commits in this order: `spec`, `reward core`, `export/runner`,
`receiver/package`, `verification fixes`. Do not commit existing unrelated
untracked documents.
