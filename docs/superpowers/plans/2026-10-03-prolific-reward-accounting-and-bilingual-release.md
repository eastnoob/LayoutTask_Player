# Prolific identity, reward accounting, and bilingual release

## Execution rules

- Work in the current checkout; do not create a worktree.
- Protect existing dirty files, `public/layout-task-tutorial/`, and
  `assets/collision/`.
- Use TDD for every task: write the failing test, run it and record the
  expected failure, implement the smallest change, run focused tests, run the
  task Grill-me check, then commit only that task's files.
- Keep tutorial rows separate from formal rows. Formal reward aggregation uses
  only `trial_type=formal` results.
- Do not invent endpoints, IDs, or package contents.

## Task 1: Collect the participant Prolific ID

**Files:**
- Modify: `src/core/experiment-consent.ts`
- Modify: `src/core/experiment-consent.test.ts` (create if absent)
- Modify: `src/main.ts`
- Modify: `src/experiment-runner.ts`
- Modify: `src/types/experiment.ts`

**Behavior:** Add a required ID page after consent and before tutorial/assignment.
Return a typed result containing the original non-empty string. In developer
mode bypass the real question and use `DEBUG_9999`.

1. Add a test proving whitespace-only input cannot continue and non-empty input
   returns the original string.
2. Run:
   `npm test -- --run src/core/experiment-consent.test.ts`
   Expected: FAIL because the ID page/result API does not exist.
3. Implement the smallest consent-plus-ID flow and pass `prolificId` into the
   runner.
4. Run the focused consent and runner tests; expected PASS.
5. Grill-me check: verify ID collection happens after consent, before the
   first tutorial/reference-board trial, and developer mode cannot capture a
   real participant ID. Fix any issue found.
6. Commit:
   `git add src/core/experiment-consent.ts src/core/experiment-consent.test.ts src/main.ts src/experiment-runner.ts src/types/experiment.ts && git commit -m "feat: collect prolific id before experiment"`

## Task 2: Persist identity through session and transport metadata

**Files:**
- Modify: `src/core/experiment-session.ts`
- Modify: `src/core/local-backup-store.ts` only if the metadata shape requires it
- Modify: `src/core/zip-recovery.ts`
- Modify: `src/experiment-runner.ts`
- Modify: `src/core/experiment-data.ts`
- Tests: `src/core/experiment-data.test.ts`, `src/core/zip-recovery.test.ts`,
  `src/experiment-runner.test.ts`

1. Add failing tests asserting `prolific_id` appears in generated CSV/JSON,
   recovery manifest, receiver envelope, and saved session metadata.
2. Run the three focused test files; expected: FAIL because no independent
   Prolific field is emitted.
3. Add the field to the shared input type and thread it through all existing
   save paths. Files remain the source of truth for DataPipe payloads; the
   receiver envelope and archive manifest also carry the top-level field.
4. Run the focused tests; expected PASS.
5. Grill-me check: inspect every early failure path and confirm the recovery
   ZIP still has the ID even when upload or archive fails. Fix omissions.
6. Commit:
   `git add src/core/experiment-session.ts src/core/zip-recovery.ts src/experiment-runner.ts src/core/experiment-data.ts src/core/experiment-data.test.ts src/core/zip-recovery.test.ts src/experiment-runner.test.ts && git commit -m "feat: persist prolific id across experiment outputs"`

## Task 3: Add correctness and reward aggregates

**Files:**
- Modify: `src/types/reward.ts`
- Modify: `src/core/reward-calculator.ts`
- Modify: `src/core/reward-calculator.test.ts`
- Modify: `src/schemas/result.schema.ts`

1. Add failing tests for one group with position-only correct, rotation-only
   correct, both correct, and both wrong, plus a tutorial result that must not
   enter the formal summary.
2. Run:
   `npm test -- --run src/core/reward-calculator.test.ts`
   Expected: FAIL because aggregate fields do not exist.
3. Add explicit per-group `bothCorrect`/`bothWrong` and a formal summary with
   `correctPositionCount`, `correctRotationCount`, `fullyCorrectCount`,
   `fullyFailedCount`, `scorableGroupCount`, and existing reward totals.
4. Run the focused tests; expected PASS.
5. Grill-me check: compare totals against independent hand calculations and
   confirm unscorable groups are excluded from correctness counts but preserve
   their existing reward behavior. Fix any mismatch.
6. Commit:
   `git add src/types/reward.ts src/core/reward-calculator.ts src/core/reward-calculator.test.ts src/schemas/result.schema.ts && git commit -m "feat: aggregate formal correctness and rewards"`

## Task 4: Export aggregates and render final payment summary

**Files:**
- Modify: `src/core/experiment-data.ts`
- Modify: `src/experiment-runner.ts`
- Modify: `src/core/reward-export.test.ts`
- Modify: `src/experiment-runner.test.ts`

1. Add failing export tests asserting session CSV, rewards CSV, debug JSON,
   and final-page HTML contain all aggregate counts, `prolific_id`, and pound
   formatting.
2. Run:
   `npm test -- --run src/core/reward-export.test.ts src/experiment-runner.test.ts`
   Expected: FAIL because only per-group booleans and euro formatting exist.
3. Emit the summary once in the shared session/debug/rewards outputs, preserve
   per-group rows, and render `£4.00`, earned reward, and total reward on the
   end page. Use formal trial results only.
4. Run the focused tests; expected PASS.
5. Grill-me check: ensure tutorial-only runs do not claim formal correctness
   or earned rewards, and ensure zero-reward/full-failure counts are visible in
   saved data. Fix any issue.
6. Commit:
   `git add src/core/experiment-data.ts src/experiment-runner.ts src/core/reward-export.test.ts src/experiment-runner.test.ts && git commit -m "feat: export reward totals and payment summary"`

## Task 5: Verify bilingual and developer configuration behavior

**Files:**
- Modify: `public/experiment/experiment-en.json` only if the current English
  gate/config is inconsistent
- Modify: `public/experiment/experiment-zh.json` only if the current Chinese
  gate/config is inconsistent
- Modify: `src/core/experiment-loader.test.ts`
- Modify: `src/core/developer-debug.test.ts` (create if absent)

1. Add failing configuration tests proving English skips the completion-code
   page, Chinese keeps its configured gate, both use the reward values £4 +
   £0.04 + £0.04, and developer mode isolates the experiment ID/prefix.
2. Run the focused config/debug tests; expected: FAIL for any missing invariant.
3. Make only the minimal config/test changes needed; do not change task assets,
   schedule, tutorial package, or scoring reference.
4. Run the focused tests; expected PASS.
5. Grill-me check: diff the two configs and verify all differences are
   intentional locale/gate/presentation differences, not data-flow differences.
6. Commit:
   `git add public/experiment/experiment-en.json public/experiment/experiment-zh.json src/core/experiment-loader.test.ts src/core/developer-debug.test.ts && git commit -m "test: lock bilingual identity and reward configuration"`

## Task 6: Build and publish current self-contained web packages

**Files:**
- Modify: `index.html`
- Modify: `package.json`
- Create: `tools/generator/validate-web-release-package.ts`
- Create: `tools/generator/validate-web-release-package.test.ts`
- Build output: `dist/` (generated and not committed to the source branch)

1. Add a failing package validation test or extend the existing validator to
   require the current experiment configs, root `manifest.json`, current R12
   package, tutorial copy, and updated asset hashes.
2. Run the focused validator; expected: FAIL until the package requirements
   are asserted and the fresh build exists.
3. Run `npm run build`, validate `dist/`, and inspect the generated package.
   Copy the current build contents directly to the configured web-release
   branches: Chinese to `main`, English to `en-US`. Do not nest `dist/`, do not
   publish the legacy standalone package as root, and do not use an old commit.
4. Run package validation and a local HTTP smoke check for both config URLs;
   expected: root manifest and all referenced current assets return 200.
5. Grill-me check: compare source asset hashes against both built packages and
   verify `public/layout-task-tutorial/` and `assets/collision/` are unchanged.
   Fix any release mismatch before committing.
6. Commit the release entry and validator:
   `git add index.html package.json tools/generator/validate-web-release-package.ts tools/generator/validate-web-release-package.test.ts docs/superpowers/plans/2026-10-03-prolific-reward-accounting-and-bilingual-release.md && git commit -m "build: validate current bilingual web packages"`

## Task 7: Full verification and final report

1. Run the complete suite:
   `npm test -- --run`
2. Run the build:
   `npm run build`
3. Run whitespace validation:
   `git diff --check`
4. Start Vite and smoke-test:
   - Chinese consent -> Prolific ID -> tutorial -> formal trials -> completion
     gate -> saving/end page;
   - English consent -> Prolific ID -> tutorial -> formal trials -> saving/end
     page without completion gate;
   - developer Konami path uses 9999/DEBUG_9999 and full saving flow;
   - final output shows £4 base, earned reward, total reward, and correctness
     totals;
   - failed upload still leaves a recovery ZIP containing the ID and summary.
5. Grill-me final check: inspect branch history, changed files, package roots,
   protected source hashes, and exact browser URLs. Fix findings before the
   completion verification.
6. Run `superpowers:verification-before-completion` checks and report commits,
   tests, build, package validation, browser URLs, deployment branches, and
   any remaining limitation. Do not claim deployment success without fresh
   command evidence.
