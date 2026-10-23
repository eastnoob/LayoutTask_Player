# Run 37 Native-25 Stimulus Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an isolated bilingual Run 37 formal package containing exactly 25 unique tasks, the protocol-derived scoring reference, a validated 50-sequence order matrix, and a self-contained static release path while preserving the existing R12 package, tutorial, data, and rollback path.

**Architecture:** Treat `E:/260917/sample/run_37/native_25/selected.csv` as the selection manifest only. Stream the selected `row_index` values into the read-only `E:/260917/data.csv`, extract the protocol-authored objects and targets, build a new `BatchConfig`, compile it through the existing batch compiler, and publish it under a new package and experiment identity. The current Player, tutorial package, receiver schema, and old R12 artifacts remain unchanged; only the new package, bilingual config, release tooling, and explicitly versioned assignment configuration are added or switched after acceptance.

**Tech Stack:** TypeScript, `csv-parse`, Vitest, existing batch compiler and runtime validators, Vite static build, Playwright Chromium/WebKit acceptance scripts, Python receiver, Docker Compose, SHA-256 manifests.

**Spec:** `docs/superpowers/specs/2026-10-23-run37-native25-stimulus-migration-design.md`

## Global Constraints

- `experiment_id`: `run_37_native25_persistent`.
- `package`: `layout-task-run37-native25-persistent`.
- `schedule_version`: `run37-native25-williams-v1`.
- `scoring_version`: `run37-native25-scoring-v1`.
- `filename_prefix`: `run-37-native25-persistent`.
- `sequence_ids`: `1` through `50`.
- The new formal package uses `reference_mode: "persistent"`.
- The new formal schedule has exactly 25 unique tasks, 25 presentations per sequence, `repeatGroups: []`, and no repeated formal task.
- Across the complete 50-sequence matrix, every ordered pair of distinct tasks appears exactly twice as an adjacent pair.
- The old R12 package, old schedule, old scoring reference, tutorial package, old static release, historical receiver data, and `References` remain recoverable and are not deleted or overwritten.
- Cleanup is permitted only inside a new release staging directory after recursive reference validation.
- `E:/260917/data.csv` and the Run 37 source directory are read-only inputs; the selector CSV is never treated as the answer table.
- Formal saving continues to use the receiver; the frontend never generates participant numbers.
- No Blender asset generation is part of this migration. If implementation discovers that Blender conversion is required, stop and first verify `D:\SteamLibrary\steamapps\common\Blender\blender.exe --version` is Blender 5.2.2 and verify the Blender MCP connection before touching assets.

---

### Task 1: Freeze and validate the Run 37 input snapshot

**Files:**
- Create: `tools/generator/run37-native25-input.ts`
- Create: `tools/generator/run37-native25-input.test.ts`
- Create during execution: `docs/releases/run37-native25-input-manifest.json`
- Read only: `E:/260917/sample/run_37/native_25/selected.csv`
- Read only: `E:/260917/data.csv`

**Interfaces:**
- `readRun37Selection(inputRoot: string): Promise<Run37Selection>` returns the 25 selected rows, 25 combination IDs, 25 image hashes, and 100 furniture records.
- `writeRun37InputManifest(selection, outputPath): Promise<void>` writes source paths, row indices, combination IDs, image hashes, record counts, and SHA-256 values.

- [ ] **Step 1: Write the failing input-integrity tests.** Assert that the selected manifest contains 25 rows, all `row_index` values are integers, all combination IDs are unique, all selected image hashes are unique, and each selected row maps to exactly one row in `data.csv`.

```ts
const selection = await readRun37Selection("E:/260917/sample/run_37/native_25");
expect(selection.rows).toHaveLength(25);
expect(new Set(selection.rows.map((row) => row.rowIndex)).size).toBe(25);
expect(new Set(selection.rows.map((row) => row.combinationId)).size).toBe(25);
expect(selection.furnitureRecords).toHaveLength(100);
```

- [ ] **Step 2: Run the focused test and verify it fails** because the reader and manifest writer do not yet exist.

```powershell
npx vitest run tools/generator/run37-native25-input.test.ts
```

- [ ] **Step 3: Implement a streaming CSV reader.** Use `createReadStream` and the installed `csv-parse` package. Build a `Map<number, SourceRecord>` from `data.csv` while consuming only the selected row indices; reject duplicate source row indices and missing selected indices. Do not load the full CSV into an array.

- [ ] **Step 4: Verify source and review image files.** Resolve every selected source image and review image beneath the Run 37 root, compute SHA-256, and assert that the declared hash and the source/review hashes agree for all 25 selections.

- [ ] **Step 5: Write the input manifest and rerun the focused tests.** The manifest must contain the exact input paths, counts, selected row indices, combination IDs, image hashes, and file hashes. Expected result: all input-integrity tests pass.

- [ ] **Step 6: Confirm the snapshot is read-only.** Record `git status --short`, verify that no `E:/260917` file timestamp changes, and keep the generated manifest outside `public/` until the batch mapping is accepted.

### Task 2: Build the Run 37 authoring batch and answer mapping

**Files:**
- Create: `tools/generator/build-run37-native25-batch.ts`
- Create: `tools/generator/build-run37-native25-batch.test.ts`
- Modify: `src/types/batch.ts` only if the source-derived metadata needs a typed field already supported by the schema
- Test input/output: `tmp/run37-native25/run37-native25.batch.json`

**Interfaces:**
- `buildRun37Batch(selection, sourceRecords): BatchConfig` creates exactly 25 `BatchTrialConfig` entries.
- `extractProtocolTargets(sourceRecord): BatchObjectConfig[]` takes targets only from the protocol JSON embedded in the canonical `data.csv` row.

- [ ] **Step 1: Write the failing mapping tests.** Assert that the output has `schema: "layouttask.batch.v1"`, experiment ID `run_37_native25_persistent`, 25 trials, 100 furniture objects, one-to-one task/QID mapping, and a non-empty relative target for every scorable object.

```ts
expect(batch.experiment_id).toBe("run_37_native25_persistent");
expect(batch.trials).toHaveLength(25);
expect(batch.trials.flatMap((trial) => trial.objects)).toHaveLength(100);
expect(batch.trials.every((trial) => trial.objects.every((object) => object.target?.relative))).toBe(true);
```

- [ ] **Step 2: Run the focused mapping test and verify it fails** because the Run 37 batch builder does not yet exist.

- [ ] **Step 3: Implement the source-to-batch mapping.** Use the selected row's canonical `row_index` to locate the protocol JSON in `data.csv`; map the source background, display image, object assets, collision references, initial poses, object roles/groups, and relative target steps into the existing `BatchConfig` shape. Derive any absolute target only as secondary metadata. Never copy targets from the old R12 scoring reference.

- [ ] **Step 4: Make task IDs deterministic and one-to-one.** Use the existing source combination/content identifier after normalization as `scene_<normalized-id>`, retain the original combination ID and image hash in batch metadata, and fail on any collision rather than silently renaming a duplicate.

- [ ] **Step 5: Add the explicit new schedule block to the batch.** The Run 37 batch must declare `generation_mode: "williams_first_order"` and `repeat_groups: []`; this prevents the R12 hard-coded repeat behavior from being inherited implicitly.

```json
"schedule": {
  "generation_mode": "williams_first_order",
  "repeat_groups": []
}
```

- [ ] **Step 6: Rerun the mapping tests and write the batch JSON.** Expected result: 25 unique trials, 100 furniture objects, all targets sourced from the selected canonical rows, and no reference to the old package.

### Task 3: Add a tested full first-order Williams generator

**Files:**
- Modify: `src/core/schedule-generator.ts`
- Modify: `src/core/schedule-generator.test.ts`
- Modify: `tools/generator/schedule-generator.test.ts` only for new Run 37 coverage

**Interfaces:**
- Preserve the existing default `generateWilliamsBaseSequences(taskIds, options)` behavior used by R12.
- Add an explicit generation option: `generationMode?: "legacy_cyclic" | "williams_first_order"`.
- `generationMode: "williams_first_order"` returns `2 * taskIds.length` base sequences.

- [ ] **Step 1: Write the failing 25-task balance test.** Count adjacent ordered pairs over all generated presentations and assert exactly 600 distinct pairs, each occurring twice. Also assert 50 sequences, 25 positions per sequence, and each task occurring exactly twice at every position.

```ts
const schedule = generateWilliamsBaseSequences(taskIds25, {
  generationMode: "williams_first_order",
});
const counts = new Map<string, number>();
for (const sequence of schedule.sequences) {
  const ids = sequence.presentations.map((presentation) => presentation.taskId);
  for (let index = 0; index < ids.length - 1; index += 1) {
    const key = `${ids[index]}->${ids[index + 1]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
}
expect(counts.size).toBe(25 * 24);
expect(new Set(counts.values())).toEqual(new Set([2]));
```

- [ ] **Step 2: Run the focused schedule tests and verify the new balance test fails** under the current positional cyclic-shift implementation.

```powershell
npx vitest run src/core/schedule-generator.test.ts tools/generator/schedule-generator.test.ts
```

- [ ] **Step 3: Implement the explicit full first-order construction.** Build the standard odd-N base order, rotate labels within that order for all 25 offsets, then append the reversed form of each row. Do not rotate positions for this mode. Keep the current positional cyclic behavior as the default legacy mode so regenerated R12 artifacts do not silently change.

- [ ] **Step 4: Preserve schedule metadata.** Every generated presentation must have sequential `trialIndex`, `trialTotal: 25`, `repeatGroupId: null`, `repeatIndex: 0`, and `repeatOfTaskId: null` for the Run 37 no-repeat schedule.

- [ ] **Step 5: Rerun focused tests.** Expected result: the new 25-task ordered-pair assertion passes, all existing R12 sequence-count tests remain green, and tutorial exclusion still throws before any schedule is generated.

### Task 4: Make batch compilation schedule configuration explicit

**Files:**
- Modify: `src/types/batch.ts`
- Modify: `src/schemas/batch.schema.ts`
- Modify: `src/core/batch-compiler.ts`
- Modify: `src/core/batch-compiler.test.ts`
- Modify: `tools/generator/compile-batch.ts` only if CLI output or logging needs to expose the selected schedule mode

**Interfaces:**
- Add optional `BatchConfig.schedule` with `generation_mode` and `repeat_groups`.
- `compileBatch` uses explicit `batch.schedule.repeat_groups` when present, including an explicit empty array.
- When `batch.schedule` is absent, the existing R12 default repeat behavior remains unchanged.

- [ ] **Step 1: Add failing compiler tests.** Cover both cases:
  - an existing R12-shaped batch without `schedule` still compiles with the two legacy repeats when the two R12 task IDs are present;
  - a Run 37-shaped batch with `repeat_groups: []` compiles with 25 presentations and no repeat metadata.

```ts
expect(legacy.schedule.presentationCount).toBe(25);
expect(legacy.schedule.repeatGroups).toEqual(["scene_8902bfd7b7e4", "scene_15d8ce4dbde3"]);
expect(run37.schedule.presentationCount).toBe(25);
expect(run37.schedule.repeatGroups).toEqual([]);
expect(run37.schedule.sequences.every((sequence) =>
  sequence.presentations.every((presentation) => presentation.repeatGroupId === null),
)).toBe(true);
```

- [ ] **Step 2: Run the focused compiler tests and verify the Run 37 assertions fail** because the compiler currently derives repeats from the hard-coded R12 IDs and always uses the legacy generator.

- [ ] **Step 3: Implement the minimal configuration path.** Select the requested generation mode, distinguish omitted `repeat_groups` from an explicit empty array, and retain `R12_REPEAT_GROUPS` only as the compatibility fallback for batches without a schedule block.

- [ ] **Step 4: Validate the new batch through `batchSchema`.** Reject unknown generation modes, duplicate repeat IDs, repeat IDs absent from the compiled task list, and any schedule that produces a presentation count other than 25 for Run 37.

- [ ] **Step 5: Rerun compiler tests and the existing schema suite.** Expected result: old R12 behavior remains stable; Run 37 cannot accidentally inherit repeats.

### Task 5: Compile and validate the isolated Run 37 runtime package

**Files:**
- Create during execution: `public/layout-task-run37-native25-persistent/`
- Create during execution: `docs/releases/run37-native25-package-manifest.json`
- Test: `tools/generator/validate-runtime-package.test.ts` and existing package validators

**Interfaces:**
- Use the existing `compileBatchToDirectory({ input, out, referenceMode: "persistent" })` path.
- The resulting package contains `manifest.json`, exactly 25 task files, `schedule.json`, `scoring/scoring-reference.json`, `generation-report.json`, asset libraries, collisions, images, and the verified tutorial copy.

- [ ] **Step 1: Compile into a new temporary staging directory.** Use a unique directory under `tmp/run37-native25-staging/`; do not write directly over the R12 package.

```powershell
npx tsx tools/generator/compile-batch.ts `
  --input tmp/run37-native25/run37-native25.batch.json `
  --out tmp/run37-native25-staging/layout-task-run37-native25-persistent `
  --reference-mode persistent
```

- [ ] **Step 2: Run schema and package validators.** Validate the batch, runtime package with `--check-targets`, schedule, experiment package, and tutorial lock. Assert 25 manifest tasks, 100 source furniture records, 25 display images, and no tutorial task in the formal manifest.

- [ ] **Step 3: Run collision validation for both initial and target poses.** Any initial or target collision is a release blocker; do not adjust the target table to make validation pass.

- [ ] **Step 4: Recursively resolve every declared asset reference.** Check PNG, SVG, GIF, collision SVG, icons, backgrounds, behavior files, tutorial files, and all JSON references. Fail on an absolute source path, a missing file, a nested `dist` directory, or an asset outside the staged package.

- [ ] **Step 5: Compare the copied tutorial lock and hashes with the currently verified tutorial package.** The tutorial must be byte-for-byte equivalent except for its enclosing package location.

- [ ] **Step 6: Write the package manifest.** Record relative paths, sizes, and SHA-256 values for every staged file. Store the manifest outside the runtime package if it would be exposed to participants; use it for release verification.

- [ ] **Step 7: Copy the validated staging directory into `public/layout-task-run37-native25-persistent/`** only after all previous checks pass, and verify the old R12 directory's file hashes are unchanged.

### Task 6: Add bilingual Run 37 experiment configurations

**Files:**
- Create: `public/experiment/experiment-run37-native25-zh.json`
- Create: `public/experiment/experiment-run37-native25-en.json`
- Create: `src/core/run37-native25-config.test.ts`
- Modify only after user acceptance: `public/experiment/experiment.json`, `public/experiment/experiment-en.json`

**Interfaces:**
- Both configs use the same 25 task IDs, schedule path, schedule version, scoring version, reward values, receiver endpoint, and tutorial package.
- Chinese config uses `locale: "zh-CN"`; English config uses `locale: "en-US"`.
- Both use `data_save.mode: "receiver"` and `filename_prefix: "run-37-native25-persistent"`.

- [ ] **Step 1: Write failing config tests.** Parse both files with `parseExperimentConfig`; assert the new experiment ID, package base URL, schedule version, persistent mode, receiver mode, 25 trials, and exact equality of task ID order between locales.

- [ ] **Step 2: Create the two configs by copying only invariant tutorial, confidence, reward, and receiver fields from the verified R12 config.** Change only experiment identity, formal package paths, scoring paths/version, filename prefix, locale, and the 25 Run 37 trial entries.

- [ ] **Step 3: Assert that no new config points to `layout-task-run12-core23-persistent` for formal task or scoring paths.** The tutorial path may remain the verified tutorial location only if its lock hash matches the accepted tutorial package.

- [ ] **Step 4: Rerun bilingual config tests and validate both configs against the new package.** Do not switch the default participant-facing config yet.

### Task 7: Generalize static package copying and validation without dropping assets

**Files:**
- Modify: `tools/generator/copy-web-release-assets.ts`
- Modify: `tools/generator/copy-web-release-assets.test.ts`
- Modify: `tools/generator/validate-web-release-package.ts`
- Modify: `tools/generator/validate-web-release-package.test.ts`
- Modify: `package.json` only if a release validation command is needed

**Interfaces:**
- `copyWebReleaseAssets` accepts an explicit formal package directory or derives it from the selected entry config; it must not hard-code the R12 package.
- `validateWebReleasePackage` validates the package referenced by the selected entry config and reports every missing declared asset.

- [ ] **Step 1: Add failing tests with a temporary Run 37 package.** Assert that the copier includes the configured package, icons, tutorial, images, and collision assets, and does not require the old R12 package when the Run 37 entry config is selected.

- [ ] **Step 2: Add an explicit `--config <experiment-json>` or equivalent entry selector** to the copy/validation command while preserving the current default behavior for existing R12 local builds.

- [ ] **Step 3: Replace the validator's hard-coded `layout-task-run12-core23-persistent` root** with the package root resolved from the selected config's `baseUrl`, then recursively visit the formal manifest, schedule, scoring reference, tutorial manifest/lock, and all JSON-declared paths.

- [ ] **Step 4: Add tests for the failure cases that caused earlier regressions:** missing icon, missing hand/tutorial asset, missing Run 37 image, wrong package root, nested `dist`, and a 404-equivalent unresolved reference.

- [ ] **Step 5: Run the focused copier/validator tests and `git diff --check`.** Expected result: the new package is self-contained and the old build path remains usable.

### Task 8: Run bilingual Chromium/WebKit local acceptance

**Files:**
- Create: `tools/browser/run37-native25-acceptance.cjs`
- Reuse: `tools/browser/tutorial-entry-acceptance.cjs`
- Reuse: `tools/browser/tutorial-regression.cjs`
- Create during execution: `output/playwright/run37-native25/`

**Interfaces:**
- The acceptance runner accepts `chromium|webkit`, `zh-CN|en-US`, and an entry URL/config path.
- It reports package identity, loaded task count, network failures, first formal task, schedule version, and locale.

- [ ] **Step 1: Add the acceptance assertions before the runner implementation.** The run must verify:
  - the tutorial opens from the selected config;
  - the first formal task uses the Run 37 package and persistent reference mode;
  - exactly 25 formal task IDs are reachable from the manifest;
  - no formal preview countdown appears;
  - the page remains image-above-floor-plan and does not expose a 404 asset request;
  - an edit, confidence selection, save, and confirm produce the expected Run 37 task ID and schedule metadata in local copy mode.

- [ ] **Step 2: Implement the runner by parameterizing the existing acceptance helpers** rather than duplicating tutorial interaction logic. Keep network guards enabled so local acceptance cannot submit to the production receiver.

- [ ] **Step 3: Start both local configs on separate ports or with explicit config query parameters.** Use the existing local preview procedure; do not use the production/debug config that points to the live receiver.

- [ ] **Step 4: Run all four combinations.**

```powershell
node tools/browser/run37-native25-acceptance.cjs chromium zh-CN
node tools/browser/run37-native25-acceptance.cjs chromium en-US
node tools/browser/run37-native25-acceptance.cjs webkit zh-CN
node tools/browser/run37-native25-acceptance.cjs webkit en-US
```

- [ ] **Step 5: Inspect screenshots, acceptance JSON, and network logs.** Any missing asset, locale mismatch, wrong package identity, wrong order, unexpected receiver request, collision, or UI regression stops the release.

### Task 9: User acceptance gate and release staging

**Files:**
- Create during execution: `tmp/run37-native25-release/zh-CN/`
- Create during execution: `tmp/run37-native25-release/en-US/`
- Create: `docs/releases/2026-10-23-run37-native25-release-record.md`

- [ ] **Step 1: Start the local Chinese and English previews** using `experiment-run37-native25-zh.json` and `experiment-run37-native25-en.json` and provide both URLs to the user.

- [ ] **Step 2: Wait for explicit user approval** of the local bilingual preview. Do not update the default entry config, static repository, or VPS before approval.

- [ ] **Step 3: Create fresh release staging directories.** Copy only the selected entry configs, the Run 37 package, icons, tutorial, application assets, and files reachable from their manifests. Do not incrementally modify the old static checkout.

- [ ] **Step 4: Run the release validator against both staged locales and compare the staged file manifests.** Both locales must point to the same package, schedule, task IDs, scoring version, and tutorial hashes; only locale-specific UI/config fields may differ.

- [ ] **Step 5: Record the release candidate hashes** in `docs/releases/2026-10-23-run37-native25-release-record.md`, including source manifest hash, package manifest hash, schedule hash, scoring reference hash, config hashes, and browser acceptance report paths.

### Task 10: Switch and verify the static repository after acceptance

**Files:**
- Modify after acceptance: `public/experiment/experiment.json`
- Modify after acceptance: `public/experiment/experiment-en.json`
- Modify only if required by the established deployment repository: static release entry files
- Record: `docs/releases/2026-10-23-run37-native25-release-record.md`

- [ ] **Step 1: Change the participant-facing default entries** to the accepted Run 37 Chinese and English configs, preserving the old configs and old package in the source repository.

- [ ] **Step 2: Build from a clean output directory and copy the configured Run 37 package.** Run `npm run build` and then `npm run validate:web-release -- dist` with the selected Run 37 entry configuration.

- [ ] **Step 3: Re-run the four browser acceptance combinations against the built static output** and verify that the built package has no nested `dist` directory and no unresolved reference.

- [ ] **Step 4: Publish from the fresh staging copy** using the already configured static repository remote and the established branch mapping. Do not guess a new remote, force-push an unrelated branch, or delete the previous release history.

- [ ] **Step 5: Verify remote branch hashes and entry content.** Check the static repository's Chinese and English branches, confirm the new experiment ID and package name, and verify the remote package manifest hash matches the local release record.

### Task 11: Cut over VPS assignment configuration without touching historical data

**Files/configuration:**
- Modify on the existing VPS deployment only after static release verification: receiver environment values in the established deployment location
- Record: `docs/releases/2026-10-23-run37-native25-release-record.md`
- Reference: `receiver/README.md` and the existing verified deployment procedure

- [ ] **Step 1: Snapshot the current deployment values and active service image/config hash.** Preserve the old experiment ID, schedule version, and sequence list for rollback; do not alter the data volume.

- [ ] **Step 2: Set exactly these new assignment values:**

```text
ASSIGNMENT_EXPERIMENT_ID=run_37_native25_persistent
ASSIGNMENT_SCHEDULE_VERSION=run37-native25-williams-v1
ASSIGNMENT_SEQUENCE_IDS=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50
```

- [ ] **Step 3: Restart only through the established receiver deployment command** (`docker compose up -d --build` in the verified deployment directory) and verify `/health` returns `{"ok":true}`.

- [ ] **Step 4: Send one controlled `/assign` request with a fresh idempotency token.** Assert the response contains the new experiment ID, schedule version, a sequence ID from 1 through 50, and a fresh participant number. Repeat the same token and assert the exact assignment is returned without consuming another number.

- [ ] **Step 5: Verify archive configuration is unchanged.** Confirm both existing WebDAV remotes, spool behavior, retry behavior, and metadata archive settings remain intact; do not clear tables, pending files, or historical archives.

- [ ] **Step 6: Record the cutover response, health response, environment hash, and rollback values** in the release record.

### Task 12: Final verification, commits, and rollback readiness

**Files:**
- Modify: `docs/releases/2026-10-23-run37-native25-release-record.md`
- Commit: implementation files and the new Run 37 package/config only

- [ ] **Step 1: Run the complete verification set.**

```powershell
npm test
npm run build
npm run validate:web-release -- dist
git diff --check
```

Run the receiver test suite in the existing supported environment and repeat the four browser acceptance runs after the final build.

- [ ] **Step 2: Inspect the final diff.** Confirm no `References` file, old package, old config, receiver data, or unrelated untracked user file is staged.

- [ ] **Step 3: Commit in focused batches:** generator/schema/tests; Run 37 package and bilingual configs; release-tooling changes; final release record. Use non-interactive commits and keep each commit independently reviewable.

- [ ] **Step 4: Push only the source branch when the user requests source publication.** Static repository publication and VPS cutover remain separate operations and are recorded with their own remote hashes.

- [ ] **Step 5: Verify rollback readiness.** A rollback consists only of restoring the old static entry and the saved old VPS assignment values; no historical submission rewrite or data deletion is permitted.

## Plan Self-Review Results

- **Spec coverage:** Input snapshot, canonical target extraction, 25-task package, no-repeat schedule, ordered-pair balance, bilingual config, self-contained static package, local browser acceptance, user approval gate, static publication, VPS assignment cutover, archive preservation, and rollback are each covered by a task.
- **Placeholder scan:** No `TODO`, `TBD`, or “implement later” instructions are used. Deployment uses the already verified deployment directory and checked-in receiver procedure rather than inventing a host or access method.
- **Type consistency:** `BatchConfig.schedule.generation_mode` and `repeat_groups` are introduced before compiler usage; the Run 37 builder emits that shape; compiler tests verify the explicit empty repeat list; the generated schedule is consumed by both configs and VPS sequence IDs.
- **Legacy safety:** R12 compilation without a schedule block retains the current hard-coded compatibility behavior; old package and historical data are never regenerated or deleted.
- **Asset safety:** The release is built in fresh staging, recursively validated, hash-recorded, and only then copied into the new public package and static release.
- **Approval gates:** No implementation, default-config switch, static publication, or VPS change occurs until the user approves this plan and later approves the bilingual local preview.

