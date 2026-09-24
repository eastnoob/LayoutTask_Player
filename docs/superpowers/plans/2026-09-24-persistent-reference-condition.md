# Persistent Reference Condition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compile-time `persistent` reference condition in which the perspective image stays visible above the floor-plan workspace for the whole task, while preserving the existing `preview_10s` behavior as the default and recording observable prohibited reference-image assistance.

**Architecture:** Add one explicit `reference_mode` value to authored, runtime, experiment, and compiled-package metadata. The existing `FlowController` and `LayoutTaskRenderer` remain the single execution path; the mode changes their behavior at well-defined boundaries: persistent mode skips the preview gate and keeps the already-rendered display-image frame visible during reconstruction. The compiler overlays the selected mode on generated formal tasks and copies the already-locked tutorial package into the output; it never mutates the tutorial source package. Results carry the mode and assistance observations alongside the existing tutorial/formal classification.

**Tech Stack:** TypeScript, Zod, Vitest, jsPsych, SVG/DOM renderer, `tsx` generator scripts, static package assets.

**Spec:** `docs/superpowers/specs/2026-09-24-persistent-reference-condition-design.md`

## Global Constraints

- `reference_mode` is exactly `"preview_10s" | "persistent"`; omitted authored values default to `"preview_10s"`.
- The default `preview_10s` package and behavior must remain byte-for-byte and behaviorally unchanged.
- Persistent mode keeps the perspective image in a fixed panel above the floor-plan workspace; it does not make the image part of SVG world coordinates.
- Persistent mode removes the preview countdown/acknowledgement gate, but preserves the existing reconstruction, confidence, collision, scoring, tutorial-complete, and submission flow.
- Do not classify floor-plan zoom, pan, resize, orientation, or device-pixel-ratio changes as prohibited reference-image assistance.
- Record only observable events; do not claim that browser zoom was detected when the browser did not expose an observation.
- The fixed tutorial source is `public/layout-task-tutorial/`; compilation copies its locked files and never rewrites that source directory.
- Formal R12 remains 23 trials, and tutorial rows remain explicitly classified as `trial_type=tutorial`.
- Do not modify existing unrelated dirty files or delete `public/layout-task-run12-core23-compiled/assets/collision/`.

## Review Focus

- A missing or malformed mode must still run the old 10-second preview path: pin this in schema and loader tests (Task 1).
- A persistent task must never hide the reference image after reconstruction starts: pin this in flow/renderer tests (Task 2).
- Floor-plan `+/-`, pan, resize, orientation, and DPR changes must not create prohibited assistance events: pin this in the recorder test (Task 3).
- Tutorial and formal rows must carry different `trial_type` values while sharing the same selected `reference_mode`: pin this in export tests (Task 5).
- Compiling persistent mode must not alter the locked tutorial source or the preview output: pin this in compiler/package tests (Task 4).

### Task 1: Add the reference-mode contract

**Files:**
- Modify: `src/types/config.ts` (authored task configuration types near `FlowMode`)
- Modify: `src/types/runtime.ts` (`RuntimeTaskConfig`)
- Modify: `src/types/experiment.ts` (`ExperimentConfig`)
- Modify: `src/schemas/config.schema.ts` (task-level `reference_mode`)
- Modify: `src/schemas/experiment.schema.ts` (experiment-level `reference_mode`)
- Modify: `src/core/config-loader.ts` (resolved runtime default/override)
- Modify: `src/core/experiment-loader.ts` (experiment config normalization)
- Test: `src/schemas/config.schema.test.ts`
- Test: `src/schemas/experiment.schema.test.ts`
- Test: `src/core/experiment-loader.test.ts`

**Interfaces:**
- Produce `export type ReferenceMode = "preview_10s" | "persistent"` from the shared config types.
- Produce `referenceMode: ReferenceMode` on resolved runtime task configs.
- Produce `referenceMode: ReferenceMode` on parsed experiment configs.
- Extend the runtime-loading entry point with an optional override `referenceMode?: ReferenceMode`; an explicit override is used only for the caller-selected experiment condition, otherwise the task’s authored value is used.

- [ ] **Step 1: Write failing schema tests.** Add cases that parse omitted mode as `preview_10s`, accept `persistent`, reject `"always"`, and preserve explicit task-level mode. Add experiment-loader coverage proving the experiment-level value is exposed to the runner.
- [ ] **Step 2: Run the focused tests and verify failure.**

Run:
```powershell
npm test -- --run src/schemas/config.schema.test.ts src/schemas/experiment.schema.test.ts src/core/experiment-loader.test.ts
```

Expected: FAIL because the schemas/types do not yet define `reference_mode` and the loader does not expose `referenceMode`.
- [ ] **Step 3: Implement the smallest contract.** Add the union, Zod enum/default, camelCase normalization, and runtime override without changing existing flow parsing or display-image parsing. Reject invalid values through Zod rather than silently falling back.
- [ ] **Step 4: Run the focused tests and verify pass.**

Run the same command; Expected: PASS, with existing schema tests unchanged.
- [ ] **Step 5: Grill-me check.** Confirm that omitted mode still means preview, an invalid mode fails loudly, and the override cannot mutate the authored task object. Fix the implementation/tests if any answer is negative.
- [ ] **Step 6: Commit.**

```powershell
git add src/types/config.ts src/types/runtime.ts src/types/experiment.ts src/schemas/config.schema.ts src/schemas/experiment.schema.ts src/core/config-loader.ts src/core/experiment-loader.ts src/schemas/config.schema.test.ts src/schemas/experiment.schema.test.ts src/core/experiment-loader.test.ts
git commit -m "feat: add reference mode configuration"
```

### Task 2: Make the runtime behavior conditional

**Files:**
- Modify: `src/core/flow-controller.ts`
- Modify: `src/core/renderer.ts`
- Modify: `src/core/layout-task-player.ts`
- Modify: `src/plugins/jspsych-layout-task.ts`
- Modify: `src/styles/layout-task.css`
- Test: `src/core/flow-controller.test.ts`
- Test: `src/core/renderer.test.ts`
- Test: `src/core/layout-task-player.test.ts`

**Interfaces:**
- Extend `FlowControllerOptions` with `referenceMode: ReferenceMode`.
- Extend the renderer flow methods so `enterReconstructionFlow` receives the mode or reads the resolved runtime mode; its persistent branch keeps `displayImageFrameElement.hidden === false`.
- Extend the jsPsych plugin options with `referenceMode?: ReferenceMode` and pass it to the runtime loader/player; no page-specific URL flag is allowed to select the mode.

- [ ] **Step 1: Write failing behavior tests.** Add tests proving:
  - `preview_10s` runs the existing acknowledgement/countdown and hides the image at reconstruction;
  - `persistent` calls reconstruction immediately, schedules no countdown timer, and leaves the image frame visible;
  - the persistent frame stays above the workspace and uses the existing image asset/layout rather than SVG-world coordinates;
  - `Tutorial complete.` still appears after the tutorial task and before formal trials.
- [ ] **Step 2: Run the focused tests and verify failure.**

```powershell
npm test -- --run src/core/flow-controller.test.ts src/core/renderer.test.ts src/core/layout-task-player.test.ts
```

Expected: FAIL because the controller always treats the task flow as preview/direct and reconstruction always hides the image.
- [ ] **Step 3: Implement the conditional path.** In persistent mode, bypass preview acknowledgement/countdown even if the task’s legacy flow says `preview_then_reconstruct`; enter reconstruction immediately and make `enterReconstructionFlow` retain the image. Keep direct reconstruction behavior and all existing action/collision/confidence handling unchanged. Add a persistent CSS class only for the fixed top reference panel; do not change floor-plan zoom/pan transforms.
- [ ] **Step 4: Run focused tests and verify pass.** Run the same command; Expected: PASS.
- [ ] **Step 5: Grill-me check.** Exercise both modes mentally and through tests: Can a persistent task accidentally inherit a 10-second timer? Can preview mode accidentally expose the image throughout reconstruction? Can the reference image alter world coordinates? If yes, fix before continuing.
- [ ] **Step 6: Commit.**

```powershell
git add src/core/flow-controller.ts src/core/renderer.ts src/core/layout-task-player.ts src/plugins/jspsych-layout-task.ts src/styles/layout-task.css src/core/flow-controller.test.ts src/core/renderer.test.ts src/core/layout-task-player.test.ts
git commit -m "feat: support persistent reference display mode"
```

### Task 3: Record observable reference-image assistance

**Files:**
- Create: `src/core/reference-assistance-recorder.ts`
- Create: `src/core/reference-assistance-recorder.test.ts`
- Modify: `src/types/result.ts`
- Modify: `src/core/display-info.ts`
- Modify: `src/core/renderer.ts`
- Modify: `src/core/recorder.ts`
- Modify: `src/core/layout-task-player.ts`
- Test: `src/core/recorder.test.ts`
- Test: `src/core/display-info.test.ts`

**Interfaces:**
- Create `ReferenceAssistanceInfo` with `reference_image_zoom_attempts`, `browser_zoom_observations`, `prohibited_events`, and `handled` fields matching the approved spec.
- Create `ReferenceAssistanceRecorder` with `start(referenceFrame, windowRef, documentRef)`, `snapshot()`, and `stop()` methods; it must be usable with injected event targets in tests.
- `LayoutTaskRenderer` exposes the recorder snapshot to the player before result finalization.

- [ ] **Step 1: Write failing recorder tests.** Pin that Ctrl+wheel over the reference frame records `ctrl_wheel`; a reference-image zoom/pointer-wheel event records the corresponding observable event; browser visualViewport scale changes are recorded as observations when available; ordinary floor-plan zoom buttons, right-button pan, resize, orientation, and DPR changes are not prohibited events; repeated identical observations are retained with timestamps or deterministically deduplicated as specified by the result type.
- [ ] **Step 2: Run the focused tests and verify failure.**

```powershell
npm test -- --run src/core/reference-assistance-recorder.test.ts src/core/recorder.test.ts src/core/display-info.test.ts
```

Expected: FAIL because the recorder/result field does not exist.
- [ ] **Step 3: Implement the recorder and wire lifecycle.** Listen only while the task is active, scope pointer/wheel checks to the reference image frame, use `visualViewport` only for observable browser-scale changes, and remove listeners in `stop()`/destroy. Keep the existing display-info metrics as diagnostics; do not relabel them as violations. Add the snapshot to rich result `reference_assistance`.
- [ ] **Step 4: Run focused tests and verify pass.** Run the same command; Expected: PASS.
- [ ] **Step 5: Grill-me check.** Verify no false positive from the existing floor-plan `+/-` controls or right-button pan, no uncaught error when `visualViewport` is absent, and no claim of detection when only a normal resize was observed. Fix any failed case.
- [ ] **Step 6: Commit.**

```powershell
git add src/core/reference-assistance-recorder.ts src/core/reference-assistance-recorder.test.ts src/types/result.ts src/core/display-info.ts src/core/renderer.ts src/core/recorder.ts src/core/layout-task-player.ts src/core/recorder.test.ts src/core/display-info.test.ts
git commit -m "feat: record reference assistance observations"
```

### Task 4: Make the compiler produce isolated persistent packages

**Files:**
- Modify: `tools/generator/compile-batch.ts`
- Modify: `src/core/batch-compiler.ts`
- Modify: `src/types/batch.ts`
- Modify: `src/schemas/batch.schema.ts`
- Modify: `tools/generator/compile-batch.test.ts`
- Modify: `src/core/batch-compiler.test.ts`
- Create: `public/layout-task-run12-core23-persistent/` generated package files (`manifest.json`, `tasks/*.json`, `scoring/scoring-reference.json`, `generation-report.json`, copied referenced assets, and `tutorial/` lock-verified copy)
- Modify: `public/experiment/experiment.json` only in the persistent-condition output branch/config, setting `reference_mode: "persistent"` and the persistent package base URL

**Interfaces:**
- Extend `compileBatchToDirectory` options with `referenceMode?: ReferenceMode`, defaulting to `preview_10s`.
- Extend CLI parsing with `--reference-mode preview_10s|persistent` and include the selected mode in the generated manifest/report/package metadata.
- Compiled task JSON must contain the selected `reference_mode`; the generated tutorial copy must pass `verifyTutorialPackage` and keep the source lock/hash unchanged.

- [ ] **Step 1: Write failing compiler/package tests.** Add tests that compile the same batch twice, assert the persistent output task configs and manifest identify `persistent`, assert the default output identifies `preview_10s`, assert both outputs contain 23 formal tasks and the same scoring references/assets, and assert the protected `public/layout-task-tutorial/` files are byte-identical before/after. Add a test that rejects an invalid CLI mode.
- [ ] **Step 2: Run focused compiler tests and verify failure.**

```powershell
npm test -- --run tools/generator/compile-batch.test.ts src/core/batch-compiler.test.ts
```

Expected: FAIL because compile options and generated metadata have no reference mode.
- [ ] **Step 3: Implement the minimal compiler condition.** Parse/validate the mode, overlay it into each emitted runtime task without changing object poses/assets/scoring, copy only the locked tutorial files already selected by `tutorial-package.lock.json`, and write a package manifest/report field that names the mode. Keep the existing refusal to write into `layout-task-tutorial`.
- [ ] **Step 4: Run focused compiler tests and verify pass.** Run the same command; Expected: PASS.
- [ ] **Step 5: Generate the persistent R12 package.** Use the real R12 batch input and the existing tutorial source, writing only to `public/layout-task-run12-core23-persistent/`; verify the generated package has 23 tasks, 92 variable objects, and no missing referenced assets.
- [ ] **Step 6: Grill-me check.** Compare preview and persistent output hashes for every task field except the intentional mode/package metadata; confirm tutorial source and existing preview package are untouched; confirm no compiler path points at the protected tutorial source as an output directory. Fix any accidental asset/pose/scoring change.
- [ ] **Step 7: Commit.**

```powershell
git add tools/generator/compile-batch.ts src/core/batch-compiler.ts src/types/batch.ts src/schemas/batch.schema.ts tools/generator/compile-batch.test.ts src/core/batch-compiler.test.ts public/layout-task-run12-core23-persistent public/experiment/experiment.json
git commit -m "feat: compile isolated persistent reference package"
```

### Task 5: Propagate mode through tutorial, formal timeline, and results

**Files:**
- Modify: `src/experiment-runner.ts`
- Modify: `src/core/tutorial-controller.ts`
- Modify: `src/core/messages.ts`
- Modify: `src/core/experiment-data.ts`
- Modify: `src/types/result.ts`
- Modify: `src/core/experiment-data.test.ts`
- Modify: `src/core/tutorial-controller.test.ts`
- Modify: `src/experiment-runner.test.ts`
- Modify: `src/core/experiment-loader.test.ts`
- Modify: `public/experiment/experiment.json`

**Interfaces:**
- `buildExperimentTimeline` passes the parsed experiment `referenceMode` to tutorial and formal `LayoutTaskPlugin` instances.
- Mode-specific tutorial copy includes the approved persistent wording: the perspective image may be consulted at any time; browser zoom, Ctrl+scroll, and magnification tools are prohibited and may be recorded; honest answers are required and correctness alone is not a quality-monitoring exclusion condition.
- Result rich JSON, session metadata, and CSV rows include `reference_mode`; assistance is present where the result schema permits it; `trial_type` remains unchanged.

- [ ] **Step 1: Write failing timeline/export tests.** Assert persistent timeline plugin options contain `referenceMode: "persistent"`, preview timeline options contain `preview_10s`, persistent tutorial text does not promise a 10-second preview, the four reference-board pages remain before tutorial, `Tutorial complete.` remains between tutorial and formal trials, the formal count is 23, and generated CSV/JSON carries `reference_mode` plus tutorial/formal headings.
- [ ] **Step 2: Run focused tests and verify failure.**

```powershell
npm test -- --run src/experiment-runner.test.ts src/core/experiment-data.test.ts src/core/tutorial-controller.test.ts src/core/experiment-loader.test.ts
```

Expected: FAIL because the runner, messages, and export builders do not yet carry the new mode.
- [ ] **Step 3: Implement propagation and copy.** Thread one parsed mode through the existing timeline; select persistent wording only in persistent mode; keep the default copy/timeline byte-for-byte where possible; add the CSV column without changing existing column meanings or removing `trial_type`.
- [ ] **Step 4: Run focused tests and verify pass.** Run the same command; Expected: PASS.
- [ ] **Step 5: Grill-me check.** Confirm a tutorial result is still exactly one tutorial result, formal output is still 23 trials, mode is not inferred from task ID or URL query, and persistent mode cannot silently convert formal rows into tutorial rows. Fix any mismatch.
- [ ] **Step 6: Commit.**

```powershell
git add src/experiment-runner.ts src/core/tutorial-controller.ts src/core/messages.ts src/core/experiment-data.ts src/types/result.ts src/core/experiment-data.test.ts src/core/tutorial-controller.test.ts src/experiment-runner.test.ts src/core/experiment-loader.test.ts public/experiment/experiment.json
git commit -m "feat: export persistent reference condition metadata"
```

### Task 6: Full verification and direct-task smoke test

**Files:**
- Modify: `docs/superpowers/specs/2026-09-24-persistent-reference-condition-design.md` only if implementation evidence requires a factual correction
- Create: `docs/superpowers/verification/2026-09-24-persistent-reference-condition.md`

- [ ] **Step 1: Run the complete test suite.**

```powershell
npm test -- --run
```

Expected: all tests pass, including the new mode, flow, assistance, compiler, and export tests.
- [ ] **Step 2: Build the application.**

```powershell
npm run build
```

Expected: Vite build succeeds and emitted assets include the selected package references.
- [ ] **Step 3: Validate both packages.**

```powershell
npx tsx tools/generator/validate-runtime-package.ts public/layout-task-run12-core23-preview --check-targets
npx tsx tools/generator/validate-runtime-package.ts public/layout-task-run12-core23-persistent --check-targets
```

Expected: both report `ok: true`, 23 tasks, and 92 variable objects; no missing target assets.
- [ ] **Step 4: Run the persistent condition directly.** Start the Vite server on an available local port and open the persistent experiment entry, not `/experiment/` tutorial-only mode. Verify visually that the perspective image is above the floor plan from first interaction through confidence selection, the plan remains interactive, floor-plan controls still work, no countdown appears, and `Tutorial complete.` precedes formal trials.
- [ ] **Step 5: Inspect the emitted result.** Complete one controlled tutorial/formal smoke path and verify `reference_mode=persistent`, `trial_type=tutorial/formal`, 23 formal task order, display metrics, and assistance observations are present; verify no automatic “locked and copied” behavior was reintroduced.
- [ ] **Step 6: Grill-me final check.** Review the diff for accidental changes to the default preview condition, package source, R12 task count, scoring/poses, or existing dirty user files. Stop and fix any discrepancy before claiming completion.
- [ ] **Step 7: Commit verification record.**

```powershell
git add docs/superpowers/verification/2026-09-24-persistent-reference-condition.md
git commit -m "test: verify persistent reference condition"
```

## Handoff Prompt

Use the following prompt for the implementation agent:

```text
Implement docs/superpowers/plans/2026-09-24-persistent-reference-condition.md in D:\PROJECTS\web\LayoutTask\LayoutTask_Player.

Required process:
1. Read and follow superpowers:using-superpowers, superpowers:executing-plans (or subagent-driven-development), superpowers:test-driven-development, and superpowers:verification-before-completion.
2. Work task-by-task. For every task: write the failing test, run it and record the expected failure, implement the smallest change, run the focused tests, perform the task's Grill-me check, then commit exactly the task's changes.
3. Do not revert unrelated existing dirty files or delete public/layout-task-run12-core23-compiled/assets/collision/.
4. Preserve preview_10s as the default and do not alter the protected source package public/layout-task-tutorial/.
5. Use the real R12 batch input to generate public/layout-task-run12-core23-persistent/; verify it contains 23 tasks and 92 variable objects.
6. Test the real persistent experiment page directly, not the tutorial-only /experiment/ page. Report the exact URL used and the final test/build/package-validation results.
7. Before saying complete, run superpowers:verification-before-completion and provide the commits, changed files, and any remaining limitation.
```

