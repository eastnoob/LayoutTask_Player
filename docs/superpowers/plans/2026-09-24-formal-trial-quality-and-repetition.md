# Formal Trial Quality and Repetition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the completed persistent-reference work into `main`, then create a clean feature branch that adds 25 formal presentations, scientifically generated counterbalanced schedules, repeated-stimulus metadata, dual uncertainty ratings, production DataPipe saving, and complete failure recovery without implementing a Process Integrity Index.

**Architecture:** Treat 23 unique scenes and 25 participant presentations as separate concepts. A compiler-owned schedule artifact will generate Williams-based base sequences, insert the two repeat presentations under explicit lag constraints, and select one complete 25-presentation sequence deterministically from participant metadata. The runtime will consume presentation metadata, save every formal answer, and use one upload state machine for per-presentation backup, final CSV upload, retries, and complete ZIP recovery; tutorial and formal manifests remain separate.

**Tech Stack:** TypeScript, Zod, Vitest, jsPsych, Vite, existing SVG renderer, existing DataPipe adapters, `tsx` generator scripts, static package assets, and `fflate` for browser-side ZIP generation.

**Spec:** `docs/superpowers/specs/2026-09-24-formal-trial-quality-and-repetition-design.md`

## Global Constraints

- Run12 has `unique_scene_count = 23` and `presentation_count = 25`.
- `Trial 1 / 25` counts formal presentations only; tutorial pages and tutorial interaction are excluded.
- The repeated formal scenes are `scene_8902bfd7b7e4` and `scene_15d8ce4dbde3`.
- Formal stimuli use the unlabelled source images from `E:/260917/assets/images/stimulus/`; review images with `P01`-`P06` labels are forbidden in the formal package.
- The base counterbalancing strategy is Williams balanced first-order counterbalancing over 23 unique scenes: 46 base sequences for Run12, derived rather than hard-coded.
- The final schedule contains 25 presentations and is revalidated after repeat insertion; at least seven formal presentations intervene between an original and its repeat, so position difference is at least 8.
- Every presentation, including both repeats, is saved as ordinary formal data with a unique `presentation_id`.
- Do not implement or export a Process Integrity Index.
- Response consistency is offline metadata/analysis only and is never an automatic exclusion or scoring rule.
- Production output uses DataPipe as its normal save path; `copy` is recovery-only.
- Upload timeout/failure records the failure and allows progress; final upload and complete ZIP recovery remain available.
- Never add the tutorial task to the formal manifest; validate tutorial and formal package roots independently.
- Do not revert unrelated dirty files or delete `public/layout-task-run12-core23-compiled/assets/collision/`.

## Review Focus

- Dirty persistent-branch work and user-owned changes must survive branch integration: pin this in the branch preflight and diff review (Task 0).
- Repeated insertion must not silently reduce the final schedule to 23 or break the seven-intervening-presentation constraint: pin this in schedule validation tests (Task 1).
- A repeat must use the unlabelled source asset and equivalent task data while retaining a separate answer row: pin this in package and export tests (Tasks 1 and 3).
- A failed DataPipe request must not advance before its result is frozen or lose the result while it retries: pin this in upload state-machine tests (Task 5).
- A tutorial task must never be checked against the formal manifest, and persistent/direct flows must not fail an obsolete preview-only validator rule: pin this in validator tests (Task 6).

---

### Task 0: Integrate the persistent branch and create the feature branch

**Files:**
- Inspect only: `git status`, `git diff`, `git log`, `git diff main...persistent-reference-condition`
- Preserve unchanged: all existing dirty source/assets and `public/layout-task-run12-core23-compiled/assets/collision/`
- Create after integration: new branch `codex/formal-trial-quality-and-repetition`

**Interfaces:**
- Consumes the existing branch `persistent-reference-condition` and its commits through `609e4f5`.
- Produces a clean feature branch based on updated `main`, containing the persistent-reference implementation and its committed verification artifacts.

- [ ] **Step 1: Record the dirty worktree before any branch operation.** Run:

```powershell
git status --short
git diff --name-status
git ls-files --others --exclude-standard
```

Save the output in the task log. Do not use `reset --hard`, `checkout --`, or a blanket destructive clean.
- [ ] **Step 2: Classify every dirty path.** Paths that are already part of the persistent implementation must be reviewed against `git diff persistent-reference-condition`; user-owned furniture/material files and collision assets must be preserved exactly. If a dirty change is required by the persistent implementation, commit it on `persistent-reference-condition` with a focused message before merging. If it is unrelated, leave it untouched and use a temporary worktree or a narrowly scoped WIP commit whose paths are explicitly listed.
- [ ] **Step 3: Verify branch ancestry and main divergence.** Run:

```powershell
git log --oneline --decorate main..persistent-reference-condition
git log --oneline --decorate persistent-reference-condition..main
git diff --stat main...persistent-reference-condition
```

Expected: the persistent branch contains the intended persistent-reference commits; any main-side commits are reviewed before integration.
- [ ] **Step 4: Integrate persistent work into main.** Only after the worktree is clean for the paths being merged, switch to `main` and use fast-forward merge when possible:

```powershell
git switch main
git merge --ff-only persistent-reference-condition
```

If fast-forward is impossible, stop and report the exact divergence instead of inventing a conflict resolution. Do not merge unrelated WIP changes.
- [ ] **Step 5: Verify the integrated persistent baseline.** Run the existing persistent tests and build:

```powershell
npm test -- --run src/core/flow-controller.test.ts src/core/renderer.test.ts src/core/experiment-data.test.ts src/experiment-runner.test.ts
npm run build
```

Expected: PASS before new feature work begins.
- [ ] **Step 6: Create the new branch from updated main.**

```powershell
git switch -c codex/formal-trial-quality-and-repetition
```

Confirm `git branch --show-current` and `git status --short` before continuing.
- [ ] **Step 7: Grill-me check.** Confirm no uncommitted user asset was merged, no collision asset was deleted, persistent reference behavior is present on the new branch, and the new branch is based on the integrated `main`. If any answer is unclear, stop and repair the branch state before Task 1.
- [ ] **Step 8: Do not create a branch-bookkeeping commit.** The merge commit or fast-forward history and the new branch ref are the required record.

### Task 1: Add the schedule schema and deterministic 25-presentation generator

**Files:**
- Create: `src/types/schedule.ts`
- Create: `src/schemas/schedule.schema.ts`
- Create: `src/core/schedule-generator.ts`
- Create: `src/core/schedule-generator.test.ts`
- Create: `tools/generator/schedule-generator.test.ts`
- Modify: `src/types/experiment.ts`
- Modify: `src/schemas/experiment.schema.ts`
- Modify: `src/core/experiment-loader.ts`
- Modify: `src/core/experiment-loader.test.ts`
- Modify: `tools/generator/compile-batch.ts`

**Interfaces:**
- `ReferencePresentation` contains `presentationId`, `taskId`, `repeatGroupId`, `repeatIndex`, `repeatOfTaskId`, and `trialIndex`.
- `ExperimentSchedule` contains `uniqueSceneCount`, `presentationCount`, `baseSequenceCount`, `minimumInterveningTrials`, `strategy`, `repeatGroups`, and `sequences`.
- `generateWilliamsBaseSequences(taskIds: string[]): ExperimentScheduleBaseSequence[]` returns 46 base sequences for 23 unique task IDs and derives `n`/`2n` for even/odd `n`.
- `insertRepeatedPresentations(baseSequence, repeatGroups, minimumInterveningTrials): ReferencePresentation[]` returns exactly 25 presentations and rejects invalid candidates.
- `selectSequence(schedule, participantNumber): SelectedSequence` uses `((participantNumber - 1) % sequenceCount) + 1`.

- [ ] **Step 1: Write failing tests for count and metadata.** Test 23 unique task IDs produce 46 base sequences; final sequences contain 25 presentations; both repeat groups occur twice; every presentation ID is unique; `trialIndex` is 1..25; participant 47 maps to sequence 1; no tutorial task is accepted as a formal task.
- [ ] **Step 2: Write failing tests for lag and repeat identity.** Test each repeat pair has at least seven intervening presentations (`abs(position2-position1) >= 8`), the two repeat occurrences are not adjacent, and each repeat keeps `repeatGroupId`, `repeatIndex`, and `repeatOfTaskId`.
- [ ] **Step 3: Run focused tests to verify failure.**

```powershell
npm test -- --run src/core/schedule-generator.test.ts src/core/experiment-loader.test.ts
```

Expected: FAIL because schedule types, schema, and generator do not yet exist.
- [ ] **Step 4: Implement the generator and schema.** Generate the Williams base sequences deterministically from the ordered unique scene list, insert repeats using a deterministic seeded candidate search, validate the complete 25-presentation result, and serialize the schedule artifact. Do not use unseeded `Math.random()` in the browser.
- [ ] **Step 5: Run focused tests to verify pass.** Run the same command; Expected: PASS.
- [ ] **Step 6: Grill-me check.** Confirm the final schedule, not only the base 23-item order, is what the player receives; confirm the schedule count is derived from package content; confirm repeated task IDs cannot overwrite one another because presentation IDs are unique.
- [ ] **Step 7: Commit.**

```powershell
git add src/types/schedule.ts src/schemas/schedule.schema.ts src/core/schedule-generator.ts src/core/schedule-generator.test.ts tools/generator/schedule-generator.test.ts src/types/experiment.ts src/schemas/experiment.schema.ts src/core/experiment-loader.ts src/core/experiment-loader.test.ts tools/generator/compile-batch.ts
git commit -m "feat: generate counterbalanced formal schedules"
```

### Task 2: Compile the 25-presentation R12 schedule and duplicate the correct source stimuli

**Files:**
- Modify: `tools/generator/compile-batch.ts`
- Modify: `src/core/batch-compiler.ts`
- Modify: `src/types/batch.ts`
- Modify: `src/schemas/batch.schema.ts`
- Modify: `tools/generator/compile-batch.test.ts`
- Modify: `src/core/batch-compiler.test.ts`
- Modify: `public/experiment/experiment.json`
- Modify: `public/experiment/experiment-persistent.json`
- Create: `public/layout-task-run12-core23-persistent/schedule.json`

**Interfaces:**
- The compiler accepts a schedule input/option and emits the validated schedule artifact alongside the package manifest.
- Formal task assets resolve only to the unlabelled source image paths.
- The experiment config points to the compiled schedule and uses `presentation_count = 25`.

- [ ] **Step 1: Write failing compiler tests.** Assert the real R12 compile output contains 23 unique task identities, 25 schedule presentations, two repeated groups, correct unlabelled source-image references, and no review-image references.
- [ ] **Step 2: Run focused compiler tests to verify failure.**

```powershell
npm test -- --run tools/generator/compile-batch.test.ts src/core/batch-compiler.test.ts
```

Expected: FAIL because the current package has 23 presentations and no validated schedule artifact.
- [ ] **Step 3: Implement compile-time schedule integration.** Keep the formal task manifest as the unique task set; store presentation order in `schedule.json`; use the same underlying task config for a repeat while assigning a new presentation identity at runtime. Copy only the specified unlabelled source images.
- [ ] **Step 4: Run focused tests to verify pass.** Run the same command; Expected: PASS.
- [ ] **Step 5: Compile the real R12 package.** Use the repository's actual R12 batch input and write the persistent production output without overwriting the protected tutorial source or unrelated compiled assets. Validate 25 presentations and all target assets.
- [ ] **Step 6: Grill-me check.** Confirm the formal manifest remains a task/config manifest, the schedule is the only place that expands 23 unique scenes to 25 presentations, and each repeated answer can be stored separately.
- [ ] **Step 7: Commit.**

```powershell
git add tools/generator/compile-batch.ts src/core/batch-compiler.ts src/types/batch.ts src/schemas/batch.schema.ts tools/generator/compile-batch.test.ts src/core/batch-compiler.test.ts public/experiment/experiment.json public/experiment/experiment-persistent.json public/layout-task-run12-core23-persistent
git commit -m "feat: compile R12 repeated presentation schedule"
```

### Task 3: Propagate presentation metadata and formal progress through the player

**Files:**
- Modify: `src/experiment-runner.ts`
- Modify: `src/plugins/jspsych-layout-task.ts`
- Modify: `src/core/layout-task-player.ts`
- Modify: `src/core/renderer.ts`
- Modify: `src/core/recorder.ts`
- Modify: `src/types/result.ts`
- Modify: `src/core/experiment-data.ts`
- Test: `src/experiment-runner.test.ts`
- Test: `src/core/layout-task-player.test.ts`
- Test: `src/core/renderer.test.ts`
- Test: `src/core/experiment-data.test.ts`

**Interfaces:**
- The runner receives `SelectedSequence` and passes one `PresentationMetadata` object to each formal player instance.
- `PresentationMetadata` contains the fields from Task 1 and is written into rich result, CSV, raw JSON, events, and backup envelope.
- Renderer accepts `trialIndex` and `trialTotal` and displays `Trial {trialIndex} / {trialTotal}` for formal trials only.

- [ ] **Step 1: Write failing tests.** Test `Trial 1 / 25`, tutorial exclusion, 25 formal timeline presentations, repeat metadata on both repeated rows, and preservation of all 25 answers in CSV/raw/backup collectors.
- [ ] **Step 2: Run focused tests to verify failure.**

```powershell
npm test -- --run src/experiment-runner.test.ts src/core/layout-task-player.test.ts src/core/renderer.test.ts src/core/experiment-data.test.ts
```

Expected: FAIL because the runner currently uses the fixed 23-trial list and result structures lack presentation metadata.
- [ ] **Step 3: Implement metadata propagation.** Make the schedule authoritative for timeline order, keep tutorial rows separate, add the progress display, and retain duplicate presentations as distinct formal rows. Do not change object state or scoring semantics.
- [ ] **Step 4: Run focused tests to verify pass.** Run the same command; Expected: PASS.
- [ ] **Step 5: Grill-me check.** Confirm a repeated presentation is not filtered as a duplicate, the progress counter is 25 rather than 23, and tutorial results remain `trial_type=tutorial`.
- [ ] **Step 6: Commit.**

```powershell
git add src/experiment-runner.ts src/plugins/jspsych-layout-task.ts src/core/layout-task-player.ts src/core/renderer.ts src/core/recorder.ts src/types/result.ts src/core/experiment-data.ts src/experiment-runner.test.ts src/core/layout-task-player.test.ts src/core/renderer.test.ts src/core/experiment-data.test.ts
git commit -m "feat: record 25 formal presentations and progress"
```

### Task 4: Require and save separate position/rotation uncertainty

**Files:**
- Modify: `src/core/confidence-controller.ts`
- Modify: `src/core/renderer.ts`
- Modify: `src/core/interaction-controller.ts`
- Modify: `src/core/recorder.ts`
- Modify: `src/types/result.ts`
- Modify: `src/styles/layout-task.css`
- Test: `src/core/confidence-controller.test.ts`
- Test: `src/core/renderer.test.ts`
- Test: `src/core/interaction-controller.test.ts`
- Test: `src/core/recorder.test.ts`

**Interfaces:**
- `ConfidenceByGroup` is `Record<string, { position: number; rotation: number }>`.
- `ConfidenceController.canLeaveActiveGroup()` returns a missing-dimension reason when either value is absent.
- `ConfidenceController.saveActiveGroup()` persists both values atomically and returns a gate result.

- [ ] **Step 1: Write failing controller tests.** Test that selecting only position or only rotation cannot save/leave; selecting both persists both; switching groups cannot discard an unsaved dimension; final result includes both dimensions for every completed group.
- [ ] **Step 2: Run focused tests to verify failure.**

```powershell
npm test -- --run src/core/confidence-controller.test.ts src/core/interaction-controller.test.ts src/core/recorder.test.ts
```

Expected: FAIL because the current controller stores one scalar confidence value per group.
- [ ] **Step 3: Implement the two-dimensional control.** Render two separate questions, emphasize `position` and `rotation` with bold text and the existing designated accent color, order visible values 5 through 1 top-to-bottom, and keep Save disabled until both are selected.
- [ ] **Step 4: Run focused tests to verify pass.** Run the same command plus renderer tests; Expected: PASS.
- [ ] **Step 5: Grill-me check.** Confirm the gate concerns only confidence completeness, does not judge whether the layout answer is correct, and does not alter repeat metadata or scoring.
- [ ] **Step 6: Commit.**

```powershell
git add src/core/confidence-controller.ts src/core/renderer.ts src/core/interaction-controller.ts src/core/recorder.ts src/types/result.ts src/styles/layout-task.css src/core/confidence-controller.test.ts src/core/renderer.test.ts src/core/interaction-controller.test.ts src/core/recorder.test.ts
git commit -m "feat: collect position and rotation confidence"
```

### Task 5: Make production DataPipe saving stateful and recoverable

**Files:**
- Modify: `src/core/data-save-service.ts`
- Modify: `src/core/completion-controller.ts`
- Modify: `src/experiment-runner.ts`
- Create: `src/core/upload-state.ts`
- Create: `src/core/upload-state.test.ts`
- Create: `src/core/zip-recovery.ts`
- Create: `src/core/zip-recovery.test.ts`
- Modify: `package.json` (add pinned runtime dependency `fflate`)
- Modify: `package-lock.json` (lock the `fflate` dependency)
- Modify: `src/core/experiment-data.ts`
- Modify: `src/types/experiment.ts`
- Modify: `src/types/result.ts`
- Modify: `src/schemas/experiment.schema.ts`
- Modify: `public/experiment/experiment.json`
- Modify: `public/experiment/experiment-persistent.json`
- Test: `src/experiment-runner.test.ts`
- Test: `src/core/data-save-service.test.ts`
- Test: `src/core/completion-controller.test.ts`

**Interfaces:**
- `UploadAttempt` contains `uploadStatus: "success" | "failed" | "timeout"`, `attempts`, `error`, `uploadedAt`, and a stable `backupId`.
- `UploadState` exposes `recordAttempt`, `pendingRetries`, `markFinalUpload`, and `getManifest`.
- `createCompleteRecoveryZip(files, manifest)` receives the complete authoritative file list and returns a Blob/ArrayBuffer suitable for download; it must not infer completeness from failed filenames.

- [ ] **Step 1: Write failing upload-state tests.** Test saving overlay lifecycle, success before advance, timeout/failure followed by advance, stable backup IDs across retries, bounded retry recording, and final retry of all failed backups.
- [ ] **Step 2: Write failing ZIP tests.** Test the ZIP includes every authoritative file, all 25 formal records, tutorial data where present, and a manifest with participant/session/experiment/sequence and failure details. Test no partial “copy only failed files” archive is produced.
- [ ] **Step 3: Run focused tests to verify failure.**

```powershell
npm test -- --run src/core/upload-state.test.ts src/core/zip-recovery.test.ts src/core/data-save-service.test.ts src/core/completion-controller.test.ts src/experiment-runner.test.ts
```

Expected: FAIL because the current save path has no explicit upload state or ZIP builder.
- [ ] **Step 4: Implement the state machine.** Freeze the result before upload, show the existing styled saving UI, wait for the request while allowing timeout, record outcome, continue on failure, retry with a stable ID, submit final CSVs, and create the complete ZIP fallback. Do not change encoded trial-backup semantics or call compression encryption.
- [ ] **Step 5: Configure production DataPipe only from approved deployment values.** Inspect the existing repository/deployment configuration for the real VPS endpoint, experiment ID, and optional token. Use those exact values. If no approved production endpoint exists, stop this step and report the missing external value; do not substitute a test URL or invent a domain. Keep copy-only fixtures in tests.
- [ ] **Step 6: Run focused tests to verify pass.** Run the same command; Expected: PASS.
- [ ] **Step 7: Grill-me check.** Confirm network failure never discards a frozen result, final upload uses the same identifiers as trial backups, retry does not duplicate ambiguously, and the ZIP is complete even when only one file failed to upload.
- [ ] **Step 8: Commit.**

```powershell
git add src/core/data-save-service.ts src/core/completion-controller.ts src/experiment-runner.ts src/core/upload-state.ts src/core/upload-state.test.ts src/core/zip-recovery.ts src/core/zip-recovery.test.ts package.json package-lock.json src/core/experiment-data.ts src/types/experiment.ts src/types/result.ts src/schemas/experiment.schema.ts public/experiment/experiment.json public/experiment/experiment-persistent.json src/experiment-runner.test.ts src/core/data-save-service.test.ts src/core/completion-controller.test.ts
git commit -m "feat: add recoverable DataPipe upload flow"
```

### Task 6: Separate tutorial/formal package validation

**Files:**
- Modify: `tools/generator/validate-experiment-package.ts`
- Modify: `tools/generator/validate-experiment-package.test.ts`
- Modify: `tools/generator/validate-runtime-package.ts` only if schedule target validation requires a shared helper
- Create: `tools/generator/validate-schedule.ts`
- Create: `tools/generator/validate-schedule.test.ts`

**Interfaces:**
- `validateExperimentPackage({ baseDir, configPath, skipRuntimePreflight })` validates formal and tutorial roots independently.
- `validateSchedule({ schedule, formalManifest, tutorialTaskId })` returns explicit failures for count, repeat, lag, asset, and tutorial-contamination violations.

- [ ] **Step 1: Write failing validator tests.** Test that the tutorial task is found in `config.tutorial.baseUrl` rather than searched in the formal manifest; formal validation accepts 25 presentations backed by 23 unique task configs; persistent/direct reconstruction does not fail a stale preview-only rule; tutorial contamination is rejected.
- [ ] **Step 2: Run focused tests to verify failure.**

```powershell
npm test -- --run tools/generator/validate-experiment-package.test.ts tools/generator/validate-schedule.test.ts
```

Expected: FAIL with the current `Tutorial task ... is missing from manifest` behavior and stale formal-flow assumptions.
- [ ] **Step 3: Implement separate-root validation.** Resolve and load the formal manifest from `config.baseUrl`, the tutorial manifest from `config.tutorial.baseUrl`, then validate schedule presentations against the formal task set. Keep formal manifest entries unique and keep presentation order in the schedule.
- [ ] **Step 4: Run focused tests to verify pass.** Run the same command; Expected: PASS.
- [ ] **Step 5: Grill-me check.** Confirm the validator would fail if the tutorial is missing from its own package, fail if a formal sequence has 24 or 26 presentations, and pass the current persistent package without requiring preview-only flow.
- [ ] **Step 6: Commit.**

```powershell
git add tools/generator/validate-experiment-package.ts tools/generator/validate-experiment-package.test.ts tools/generator/validate-runtime-package.ts tools/generator/validate-schedule.ts tools/generator/validate-schedule.test.ts
git commit -m "fix: validate tutorial and formal packages separately"
```

### Task 7: Full verification and deployment-package review

**Files:**
- Create: `docs/superpowers/verification/2026-09-24-formal-trial-quality-and-repetition.md`

- [ ] **Step 1: Run the full test suite.**

```powershell
npm test -- --run
```

Expected: all tests pass, including schedule, repeat export, confidence, upload, ZIP, and validator tests.
- [ ] **Step 2: Build.**

```powershell
npm run build
```

Expected: Vite build succeeds with every referenced asset included.
- [ ] **Step 3: Validate package targets.**

```powershell
npx tsx tools/generator/validate-schedule.ts public/layout-task-run12-core23-persistent/schedule.json
npx tsx tools/generator/validate-experiment-package.ts public/experiment --config experiment-persistent.json
npx tsx tools/generator/validate-runtime-package.ts public/layout-task-run12-core23-persistent --check-targets
```

Expected: schedule validation passes with 25 presentations, experiment validation passes with separate tutorial/formal manifests, and runtime validation reports no missing target assets.
- [ ] **Step 4: Run direct browser smoke tests.** Open the production experiment entry, not the tutorial-only page. Verify `Trial 1 / 25`, schedule-selected task order, both repeats, two confidence dimensions, saving overlay, timeout continuation, and final recovery UI.
- [ ] **Step 5: Inspect output artifacts.** Confirm primary/raw/events CSVs contain 25 formal presentations, repeated answers are separate, metadata is present, no Process Integrity Index is emitted, and a forced upload failure produces a complete ZIP.
- [ ] **Step 6: Grill-me final check.** Review the final diff for accidental changes to the persistent baseline, task geometry, scoring, tutorial assets, or user-owned dirty files. Verify branch history includes the persistent merge and the new feature branch. Fix any in-scope discrepancy before claiming completion.
- [ ] **Step 7: Commit the verification record.**

```powershell
git add docs/superpowers/verification/2026-09-24-formal-trial-quality-and-repetition.md
git commit -m "test: verify formal repetition and recovery flow"
```

## Handoff Prompt

```text
Implement docs/superpowers/plans/2026-09-24-formal-trial-quality-and-repetition.md in D:\PROJECTS\web\LayoutTask\LayoutTask_Player.

Required process:
1. Read and follow superpowers:using-superpowers, superpowers:executing-plans or superpowers:subagent-driven-development, superpowers:test-driven-development, superpowers:verification-before-completion, and stop-that-shit.
2. Start with Task 0. Protect all existing dirty user changes and public/layout-task-run12-core23-compiled/assets/collision/. Verify persistent-reference-condition, merge it safely into main, then create codex/formal-trial-quality-and-repetition from the updated main. Do not use destructive git commands.
3. Execute each task with TDD: write the failing test, run and record the failure, implement the smallest change, run focused tests, perform the task's Grill-me check, and commit only that task's files.
4. Keep 23 unique scenes and 25 formal presentations distinct. Both repeated scenes must save complete independent answers and use the unlabelled source images.
5. Generate the Williams-based schedule from the package contents, use 46 base sequences for 23 unique scenes, insert repeats with at least seven intervening presentations, and validate the final 25-presentation schedules.
6. Do not implement Process Integrity Index. Preserve raw metadata for offline analysis; Response Consistency is never an automatic exclusion.
7. Use the real approved production DataPipe endpoint and experiment ID only if present in the repository/deployment configuration. Never invent a domain or replace it with a test endpoint. If absent, stop that configuration step and report the exact missing value.
8. Test the actual production experiment entry, not only /experiment/ tutorial mode. Run the complete test suite, build, schedule validation, formal/tutorial package validation, and runtime target validation before reporting completion.
9. Before saying complete, run superpowers:verification-before-completion and report branch history, commits, tests, build, validation outputs, browser URL, and any external configuration blocker.
```
