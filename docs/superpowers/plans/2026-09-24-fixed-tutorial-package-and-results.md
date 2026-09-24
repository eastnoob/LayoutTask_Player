# Fixed Tutorial Package and Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze one self-contained tutorial package for all future compilations and export its complete performance alongside formal results with an explicit `trial_type` classification.

**Architecture:** The tutorial is a protected static release artifact under `public/layout-task-tutorial/`; the formal compiler continues to write only formal run packages. The runner collects tutorial and formal results separately, then the existing CSV/save pipeline emits tutorial rows marked `tutorial`, formal rows marked `formal`, and a separate `tutorial_result.json` backup.

**Tech Stack:** TypeScript, Zod, jsPsych, Vite, Vitest, static JSON/SVG/GIF assets, SHA-256 via Node's built-in `crypto` module for package verification.

**Spec:** `docs/superpowers/specs/2026-09-24-fixed-tutorial-package-and-results-design.md`

## Global Constraints

- `public/layout-task-tutorial/` is the sole source of truth for the tutorial.
- The compiler must never regenerate, clean, or overwrite `public/layout-task-tutorial/`.
- The compiler must copy the verified tutorial source into `public/layout-task-run12-core23-preview/tutorial/` for the deployable R12 package.
- The published reference board and interactive tutorial must resolve through the R12-local `tutorial/` release copy.
- The R12 release package must be deployable without a sibling `public/layout-task-tutorial/` directory.
- Formal trials remain in their existing fixed order and the current formal count remains 23.
- Every trial-bearing CSV row must contain `trial_type=tutorial` or `trial_type=formal`.
- Session `n_trials` counts formal rows only.
- `tutorial_result.json` is required in addition to tutorial CSV rows.
- Do not alter furniture coordinates, rotations, collision geometry, or visual behavior in this work.
- Preserve unrelated existing working-tree changes and the untracked collision asset directory.

## Review Focus

- A reference-board asset URL accidentally points to the formal package: assert generated HTML uses the tutorial base URL.
- A tutorial asset is missing from the fixed package: recursively validate every task/library/reference-board file.
- A compiler run changes the fixed tutorial package: snapshot the package lock/files before and after a formal compile.
- A GitHub Pages deployment omits the sibling tutorial source: test the release package after removing the source package from the fixture.
- Tutorial rows inflate formal statistics: assert `n_trials` and formal collection use only `trial_type=formal`.
- Tutorial data is lost on a save failure or unsupported save mode: test copy, DataPipe, receiver, and recovery-page output with `tutorial_result.json` present.

---

### Task 1: Add explicit trial classification and tutorial extraction

**Files:**
- Modify: `src/core/experiment-data.ts`
- Modify: `src/experiment-runner.ts`
- Modify: `src/types/experiment.ts` only if the tutorial package version needs a typed config field
- Test: `src/experiment-runner.test.ts`
- Test: `src/core/experiment-data.test.ts`

**Interfaces:**
- Consumes: jsPsych rows currently tagged with `tutorial: true` or `formal: true`.
- Produces: `ExperimentTrialType`, `ExperimentTrialResultItem.trialType`, `collectTutorialTrialResult(rows)`, and formal-only `collectFormalTrialResults(rows)`.

- [ ] **Step 1: Write failing extraction tests.**

Add tests that pass rows containing one tutorial result and two formal results and assert:

```ts
expect(collectTutorialTrialResult(rows)).toEqual({
  trialType: "tutorial",
  taskId: "tutorial_room",
  qid: "QTUTORIAL",
  encoded: "TUTORIAL_ENC",
  hash8: "TUT_HASH",
  result: tutorialResult,
});

expect(collectFormalTrialResults(rows)).toEqual([
  expect.objectContaining({ trialType: "formal", taskId: "scene_001" }),
  expect.objectContaining({ trialType: "formal", taskId: "scene_002" }),
]);
```

Add a regression assertion that an unclassified row is ignored rather than inferred as formal.

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run:

```powershell
npm test -- --run src/experiment-runner.test.ts src/core/experiment-data.test.ts
```

Expected: FAIL because trial classification and tutorial extraction are not yet implemented.

- [ ] **Step 3: Implement the typed extraction.**

Add:

```ts
export type ExperimentTrialType = "tutorial" | "formal";

export interface ExperimentTrialResultItem {
  trialType: ExperimentTrialType;
  taskId: string;
  qid?: string;
  encoded?: string;
  hash8?: string;
  result?: LayoutTaskResult | unknown;
}

export function collectTutorialTrialResult(
  rows: Array<Record<string, unknown>>,
): ExperimentTrialResultItem | undefined;
```

Set `trialType` from explicit jsPsych metadata. Update formal extraction to require `row.formal === true` or a normalized `trial_type=formal`; do not classify a row merely because it has `encoded` or `result`.

- [ ] **Step 4: Run the focused tests and verify they pass.**

Run the same command from Step 2. Expected: all extraction tests pass.

- [ ] **Step 5: Grill-me check.**

Check that tutorial rows cannot enter formal extraction, formal rows cannot be mislabeled from missing metadata, and both helpers preserve encoded/result/hash fields. If any case is ambiguous, add a test before continuing.

- [ ] **Step 6: Commit.**

```powershell
git add src/experiment-runner.ts src/experiment-runner.test.ts src/core/experiment-data.ts src/core/experiment-data.test.ts src/types/experiment.ts
git commit -m "feat: classify tutorial and formal trial results"
```

---

### Task 2: Make the fixed tutorial package self-contained and locked

**Files:**
- Modify: `public/layout-task-tutorial/manifest.json`
- Modify: `public/layout-task-tutorial/generation-report.json` only if required to record the fixed package identity
- Create: `public/layout-task-tutorial/tutorial-package.lock.json`
- Create or copy: `public/layout-task-tutorial/assets/tutorial-reference/**`
- Modify: `src/core/tutorial-package.test.ts`
- Create: `src/core/tutorial-package-lock.ts`
- Test: `src/core/tutorial-package-lock.test.ts`

**Interfaces:**
- Consumes: tutorial manifest, task/library references, and the four reference-board item paths in `public/experiment/experiment.json`.
- Produces: `readTutorialPackageLock(root)` and `verifyTutorialPackage(root, formalRoot)` returning a structured verification result or throwing an actionable error.

- [ ] **Step 1: Write failing package-lock tests.**

Test that the verifier:

1. accepts the current fixed package after all referenced tutorial assets are present;
2. rejects a missing referenced file;
3. rejects a modified locked file;
4. rejects a tutorial task ID present in the formal manifest;
5. rejects a reference-board URL whose resolved path is outside the tutorial root.

Use a temporary directory with two small files for hash tests so the tests do not mutate `public/`.

- [ ] **Step 2: Run the lock tests and verify they fail.**

```powershell
npm test -- --run src/core/tutorial-package-lock.test.ts src/core/tutorial-package.test.ts
```

Expected: FAIL because the lock file/verifier does not exist and the tutorial reference assets are not yet guaranteed to be self-contained.

- [ ] **Step 3: Copy only the required reference-board assets into the tutorial package.**

Copy the four item pairs from the current working asset source into the exact paths configured by the tutorial reference board:

```text
public/layout-task-tutorial/assets/tutorial-reference/tutorial/whole/svg/
public/layout-task-tutorial/assets/tutorial-reference/tutorial/whole/
public/layout-task-tutorial/assets/tutorial-reference/tutorial/variable/svg/
public/layout-task-tutorial/assets/tutorial-reference/tutorial/variable/
```

Do not move or rewrite formal assets. Confirm each of the 16 configured SVG/GIF files exists before generating the lock.

- [ ] **Step 4: Implement deterministic lock generation and verification.**

Use Node `crypto.createHash("sha256")` and sorted POSIX-relative file paths. The lock must contain:

```json
{
  "schema": "layouttask.tutorial-package-lock.v1",
  "package_version": "tutorial-edc634ac7856-v1",
  "task_id": "scene_edc634ac7856",
  "qid": "Q_scene_edc634ac7856",
  "source_generation": "E:/260917",
  "files": [{ "path": "...", "sha256": "..." }]
}
```

The verifier must validate task references, library references, collision sources, display image, reference-board assets, hashes, and formal-manifest exclusion.

- [ ] **Step 5: Add the package test against the real package.**

Update `src/core/tutorial-package.test.ts` to call the verifier and assert that the fixed package passes and the formal manifest does not contain `scene_edc634ac7856`.

- [ ] **Step 6: Run package tests and verify they pass.**

```powershell
npm test -- --run src/core/tutorial-package-lock.test.ts src/core/tutorial-package.test.ts
```

Expected: all package/reference/hash tests pass.

- [ ] **Step 7: Grill-me check.**

Inspect every configured board path and every task/library path. Confirm no URL is resolved against `layout-task-run12-core23-preview`, and confirm the lock excludes generated caches and unrelated formal assets.

- [ ] **Step 8: Commit.**

```powershell
git add public/layout-task-tutorial src/core/tutorial-package-lock.ts src/core/tutorial-package-lock.test.ts src/core/tutorial-package.test.ts
git commit -m "feat: lock self-contained tutorial package"
```

---

### Task 3: Route both tutorial flows through the R12 release copy

**Files:**
- Modify: `src/experiment-runner.ts`
- Modify: `src/core/tutorial-reference-board.test.ts` if needed for base URL coverage
- Modify: `src/experiment-runner.test.ts`
- Modify: `public/experiment/experiment.json` only if the fixed tutorial package metadata is missing

**Interfaces:**
- Consumes: `config.tutorial.baseUrl` and `buildTutorialReferenceBoardPages`.
- Produces: timeline entries where reference-board media and the interactive tutorial both use the R12-local `tutorial/` release copy, while formal entries use `config.baseUrl`.

- [ ] **Step 1: Write failing timeline URL tests.**

Set `tutorial.baseUrl` to `/layout-task-run12-core23-preview/tutorial/` and assert that every reference-board asset URL contains `/layout-task-run12-core23-preview/tutorial/`, the tutorial `LayoutTaskPlugin` uses that base, and the first formal trial uses `/layout-task-run12-core23-preview/`.

- [ ] **Step 2: Run the focused timeline tests and verify they fail.**

```powershell
npm test -- --run src/experiment-runner.test.ts src/core/tutorial-reference-board.test.ts
```

Expected: the existing reference-board assertion fails because the current configuration points to the sibling source package.

- [ ] **Step 3: Implement the base URL routing.**

Change the published experiment configuration and reference-board call to use:

```ts
const tutorialBaseUrl = config.tutorial.baseUrl ?? `${config.baseUrl}tutorial/`;
const pages = buildTutorialReferenceBoardPages({ baseUrl: tutorialBaseUrl, board });
```

Keep formal trial `baseUrl: config.baseUrl` unchanged and use the same `tutorialBaseUrl` for the interactive tutorial.

- [ ] **Step 4: Run timeline tests and verify they pass.**

Run the command from Step 2. Expected: all timeline/base URL tests pass.

- [ ] **Step 5: Grill-me check.**

Verify a config without `tutorial.baseUrl` still works, a config with the R12-local base never routes formal trials into `tutorial/`, and reference-board HTML has no sibling `layout-task-tutorial` path.

- [ ] **Step 6: Commit.**

```powershell
git add src/experiment-runner.ts src/experiment-runner.test.ts src/core/tutorial-reference-board.test.ts public/experiment/experiment.json
git commit -m "fix: route tutorial reference board to fixed package"
```

---

### Task 4: Export tutorial rows and `tutorial_result.json`

**Files:**
- Modify: `src/core/experiment-data.ts`
- Modify: `src/core/experiment-data.test.ts`
- Modify: `src/experiment-runner.ts`
- Modify: `src/experiment-runner.test.ts`
- Modify: `src/types/experiment.ts` if a package version field is added to the parsed config

**Interfaces:**
- Consumes: `ExperimentTrialResultItem` with `trialType`, tutorial extraction, formal results, and the package version from the lock.
- Produces: `createExperimentCsvFiles(input)` with classified rows and `createTutorialResultFile(input)` returning an `ExperimentCsvFile` named `tutorial_result_<participant>_<session>.json`.

- [ ] **Step 1: Write failing CSV/JSON tests.**

Build one tutorial result and two formal results. Assert:

```ts
expect(resultsCsv).toContain("trial_type");
expect(resultsCsv).toContain("tutorial");
expect(resultsCsv).toContain("formal");
expect(rawCsv).toContain('"tutorial"');
expect(eventsCsv).toContain("tutorial");
expect(sessionCsv).toContain("\n23,"); // formal count fixture, not total exported rows
expect(tutorialJson.filename).toContain("tutorial_result");
expect(JSON.parse(tutorialJson.data)).toMatchObject({
  schema: "layouttask.tutorial-result.v1",
  trial_type: "tutorial",
  package_version: "tutorial-edc634ac7856-v1",
});
```

Add a regression test that formal CSV trial indexes remain `0..22` and do not shift because the tutorial row is exported.

- [ ] **Step 2: Run the focused data tests and verify they fail.**

```powershell
npm test -- --run src/core/experiment-data.test.ts src/experiment-runner.test.ts
```

Expected: FAIL because the current data model has no trial classification, tutorial rows are filtered, and no tutorial JSON file exists.

- [ ] **Step 3: Implement classified CSV generation.**

Add `trial_type` to every trial-bearing header and pass it for results, raw results, and events. Keep `trialOrder` and session `n_trials` based on formal `trialResults` only. Add package version to session/debug metadata without changing existing formal columns' meanings.

- [ ] **Step 4: Implement `createTutorialResultFile`.**

Serialize the full tutorial result, encoded/hash fields, package version, completion status, and participant/session identifiers as a self-describing JSON file. Keep it deterministic except for values already present in the result.

- [ ] **Step 5: Update the runner's finish path.**

Collect one tutorial result separately, collect formal results separately, pass both to the CSV builder, and append the tutorial JSON file to the files array. Do not change the formal `trialOrder` array.

- [ ] **Step 6: Run focused tests and verify they pass.**

Run the command from Step 2. Expected: all CSV classification, formal-count, tutorial JSON, and finish-path tests pass.

- [ ] **Step 7: Grill-me check.**

Review generated CSV headers and rows with a standard CSV parser. Confirm every row has the same number of columns, tutorial data is present in all three trial-bearing CSVs, and session/formal counts exclude tutorial rows.

- [ ] **Step 8: Commit.**

```powershell
git add src/core/experiment-data.ts src/core/experiment-data.test.ts src/experiment-runner.ts src/experiment-runner.test.ts src/types/experiment.ts
git commit -m "feat: export tutorial results with trial classification"
```

---

### Task 5: Deliver tutorial files through every save mode and recovery page

**Files:**
- Modify: `src/experiment-runner.ts`
- Modify: `src/experiment-runner.test.ts`
- Modify: `src/core/data-save-service.ts` only if the audit finds the per-trial backup path drops tutorial metadata
- Modify: `src/core/data-save-service.test.ts` only if that audit requires a regression test

**Interfaces:**
- Consumes: `ExperimentCsvFile[]` containing CSV, debug, and `tutorial_result.json` files.
- Produces: unchanged `saveExperimentFiles` contract that saves every supplied file in copy, DataPipe, and receiver modes.

- [ ] **Step 1: Write failing save/recovery tests.**

Add a `tutorial_result.json` fixture and assert:

- receiver mode includes it in the JSON `files` array;
- DataPipe mode posts it as its own filename and payload;
- copy mode returns without filtering it from the supplied file list;
- failed save recovery HTML/output includes the tutorial filename and data.

- [ ] **Step 2: Run focused save tests and verify they fail.**

```powershell
npm test -- --run src/experiment-runner.test.ts src/core/data-save-service.test.ts
```

Expected: at least the new recovery/filename assertions fail before implementation.

- [ ] **Step 3: Implement the smallest save-path change.**

Keep `saveExperimentFiles` generic over all `ExperimentCsvFile` entries. If a filename/content-type assumption rejects JSON, widen only that validation; do not special-case tutorial rows or alter formal upload envelopes.

- [ ] **Step 4: Verify the per-trial backup audit.**

Read the existing `DataSaveService` tests and ensure the compact per-trial backup continues to accept a tutorial result payload. Add a regression test only if explicit tutorial metadata is otherwise dropped.

- [ ] **Step 5: Run save tests and verify they pass.**

Run the command from Step 2. Expected: all copy, DataPipe, receiver, timeout, error, and tutorial-file tests pass.

- [ ] **Step 6: Grill-me check.**

Force a failed DataPipe response and verify the recovery output contains the tutorial JSON and all classified CSVs. Confirm no retry or error path silently removes the tutorial file.

- [ ] **Step 7: Commit.**

```powershell
git add src/experiment-runner.ts src/experiment-runner.test.ts src/core/data-save-service.ts src/core/data-save-service.test.ts
git commit -m "feat: deliver tutorial data in every save path"
```

---

### Task 6: Protect the tutorial source and build the R12 release copy

**Files:**
- Modify: `tools/generator/compile-batch.ts`
- Test: `tools/generator/compile-batch.test.ts`
- Modify: `public/experiment/experiment.json`

**Interfaces:**
- Consumes: formal compiler output root and locked source package `public/layout-task-tutorial/`.
- Produces: formal compilation behavior unchanged, plus `<out>/tutorial/` containing the verified fixed tutorial package.

- [ ] **Step 1: Write a failing protection test.**

Create a temporary formal output root and a temporary tutorial source package. Run `compileBatchToDirectory` from `tools/generator/compile-batch.ts` with the formal root and assert: (a) the source package is byte-for-byte unchanged, (b) `<out>/tutorial/` contains the same locked files, (c) deleting the source package after compilation does not prevent the copied release package from loading, and (d) the compiler rejects `public/layout-task-tutorial/` as its output root before writing.

- [ ] **Step 2: Run the compiler guard test and verify it fails.**

```powershell
npm test -- --run tools/generator/compile-batch.test.ts
```

Expected: FAIL until the compiler/output path explicitly protects or excludes the tutorial root.

- [ ] **Step 3: Implement the output-root guard.**

Make the formal compiler reject `public/layout-task-tutorial/` as an output root, copy the verified source package into `<out>/tutorial/`, and keep all generated files under the requested formal package root. Do not add a destructive cleanup step that can traverse the parent `public/` directory. Update the published experiment configuration to use `../layout-task-run12-core23-preview/tutorial/`.

- [ ] **Step 4: Run the guard test and verify it passes.**

Run the command from Step 2. Expected: PASS with the tutorial snapshot unchanged.

- [ ] **Step 5: Grill-me check.**

Test both a normal formal compile and an attempted tutorial-root compile. Confirm the former succeeds, creates a self-contained `<out>/tutorial/` release copy without changing the source package, and the latter fails before writing.

- [ ] **Step 6: Commit.**

```powershell
git add tools/generator/compile-batch.ts tools/generator/compile-batch.test.ts public/experiment/experiment.json
git commit -m "feat: bundle fixed tutorial into R12 release"
```


---

### Task 7: Full verification and handoff artifact

**Files:**
- Modify: `src/core/tutorial-package.test.ts` or the relevant end-to-end test file
- Create: `.superpowers/sdd/2026-09-24-fixed-tutorial-package-and-results/progress.md` when using the executing-plans/subagent workflow

- [ ] **Step 1: Add the static-flow regression test.**

Load `public/experiment/experiment.json` through the existing loader and assert:

```ts
expect(config.tutorial.baseUrl).toContain("layout-task-run12-core23-preview/tutorial");
expect(config.baseUrl).toContain("layout-task-run12-core23-preview");
expect(config.trials).toHaveLength(23);
```

Build the timeline and assert tutorial/reference-board URLs use the R12-local `tutorial/` copy while formal tasks use the formal package. Remove or hide the source package in a temporary static fixture and confirm the release copy still resolves every tutorial asset.

- [ ] **Step 2: Run the complete verification suite.**

```powershell
npm test
npm run build
```

Expected: all tests pass, build succeeds, and `dist/layout-task-run12-core23-preview/tutorial/` plus the formal package are present in the static output.

- [ ] **Step 3: Open the real browser flow.**

Start the server if needed:

```powershell
npm run dev -- --host 127.0.0.1
```

Open the tutorial entry:

```text
http://127.0.0.1:5173/?base=layout-task-tutorial%2F&task=scene_edc634ac7856
```

Verify the reference board loads, the interactive tutorial loads from the R12-local `tutorial/` copy, and no request depends on a sibling source package. Then verify a formal entry still resolves against `layout-task-run12-core23-preview`.

- [ ] **Step 4: Run final grill-me review.**

Check the diff and generated file list against every spec requirement. Specifically verify: tutorial rows are in CSV, `trial_type` is present, formal count remains 23, tutorial JSON is delivered, and the fixed package is unchanged.

- [ ] **Step 5: Commit tests/documentation only if needed.**

```powershell
git status --short
git diff --check
```

Do not stage unrelated existing user changes.

---

## Workplan Self-Review

### Spec coverage

- Fixed source package, R12 release copy, and base routing: Tasks 2, 3, and 6.
- Package lock and integrity: Task 2.
- Tutorial result fields and explicit classification: Tasks 1 and 4.
- CSV inclusion and formal isolation: Task 4.
- Independent JSON backup: Task 4.
- All save modes and recovery: Task 5.
- Compiler protection: Task 6.
- Build/static/browser/GitHub Pages verification: Task 7.

### Grill-me findings and repairs

- **Finding:** The reference-board source was previously passed `config.baseUrl`, so a “self-contained” tutorial could still depend on formal assets. **Repair:** Task 3 makes tutorial base routing an explicit failing test and Task 2 copies/locks board assets.
- **Finding:** Filtering by `!row.tutorial` is too implicit once tutorial rows are intentionally exported. **Repair:** Task 1 requires explicit classification and formal extraction; Task 4 asserts formal count isolation.
- **Finding:** An independent JSON file alone would not satisfy the request for tutorial content in the final CSV. **Repair:** Task 4 puts tutorial rows in results/raw/events CSVs and retains JSON as backup.
- **Finding:** A generic save pipeline could silently omit a new JSON file. **Repair:** Task 5 tests the file list across copy, DataPipe, receiver, and recovery paths.
- **Finding:** A build guard could be misplaced if the actual compiler path is guessed. **Repair:** Task 6 is pinned to the discovered compiler entry point `tools/generator/compile-batch.ts` and its existing test file.
- **Finding:** A sibling-only tutorial directory can be omitted when deployment uploads only the R12 package. **Repair:** Task 6 copies the locked source package into `<out>/tutorial/`, and Task 7 verifies the release copy without the sibling source.

### Placeholder scan

The compiler path was resolved during pre-flight to `tools/generator/compile-batch.ts`, with coverage in `tools/generator/compile-batch.test.ts`. No `TODO`, `TBD`, or vague test step is left in the plan.

### Interface consistency

Task 1 produces `ExperimentTrialResultItem.trialType` and `collectTutorialTrialResult`; Task 4 consumes both. Task 2 produces the package version/lock identity; Tasks 4, 6, and 7 consume it. Task 3 produces the R12-local tutorial URL contract; Task 6 produces the release copy that satisfies it. Task 4 produces the complete `ExperimentCsvFile[]`; Task 5 consumes it. Task 6 also protects the source root while creating the release package.
