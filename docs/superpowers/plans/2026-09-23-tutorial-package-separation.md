# Tutorial Package Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give the tutorial its own fixed, self-contained task package selected from a generation record outside the formal `run_12_core_23` task set.

**Architecture:** Keep `public/layout-task-run12-core23-preview/` as the formal package. Add `public/layout-task-tutorial/` containing only the selected tutorial task and its referenced assets. Extend the experiment config with an optional tutorial package base URL; the reference board continues using the experiment asset base, while the interactive tutorial task uses the tutorial package base.

**Tech Stack:** TypeScript, Zod, jsPsych, Vite, Vitest, static JSON/SVG/PNG assets.

**Spec:** User request in the 2026-09-23 conversation: tutorial assets/data must be separated from formal run data, selected from a generation record, excluded from the run, copied into the project, and reused as the fixed tutorial thereafter.

## Global Constraints

- Formal trials remain fixed to `run_12_core_23` and are not replaced or rewritten.
- The selected tutorial task must not appear in the formal run manifest.
- The tutorial package must be self-contained under `public/layout-task-tutorial/`.
- Reference-board assets remain under the existing experiment asset root.
- Do not modify the selected task's coordinates, rotations, or source-generated asset content.

## Review Focus

- Tutorial and formal tasks resolve against different base URLs: test the timeline's tutorial URL while formal URLs remain unchanged.
- A tutorial task may reference only a subset of the source package assets: validate every referenced object, behavior, background, collision, and stimulus file exists.
- A missing tutorial base URL must preserve the existing single-base behavior: cover with schema/loader defaults.
- The selected tutorial ID must be absent from the formal manifest: verify with a package-level regression test.
- The reference board must not be redirected to the tutorial package: retain its existing base URL in the timeline test.

### Task 1: Add tutorial package base URL support

**Files:**
- Modify: `src/types/experiment.ts`
- Modify: `src/schemas/experiment.schema.ts`
- Modify: `src/core/experiment-loader.ts`
- Test: `src/core/experiment-loader.test.ts`
- Test: `src/experiment-runner.test.ts`

- [ ] Write failing tests for resolving `tutorial.baseUrl` and passing it only to the tutorial LayoutTask trial.
- [ ] Run the focused tests and verify they fail because the field is not supported.
- [ ] Add the optional `tutorial.baseUrl` field and resolve it relative to `experiment.json`.
- [ ] Pass the resolved tutorial base URL to the interactive tutorial trial while leaving the reference board and formal trials on their existing bases.
- [ ] Run focused tests, then the full test suite.

### Task 2: Create the self-contained tutorial package

**Files:**
- Create: `public/layout-task-tutorial/manifest.json`
- Create: `public/layout-task-tutorial/generation-report.json`
- Create: `public/layout-task-tutorial/tasks/scene_e88186a19384.json`
- Create: `public/layout-task-tutorial/assets/**` (only referenced assets)
- Create: `public/layout-task-tutorial/behaviors/behaviors.json`
- Create: `public/layout-task-tutorial/scoring/scoring-reference.json`
- Modify: `public/experiment/experiment.json`
- Test: `src/core/tutorial-package.test.ts`

- [ ] Copy the selected task and reduce the source asset libraries to the task's referenced IDs.
- [ ] Copy the referenced SVG objects, background, collision assets when present, behavior library, stimulus image, and scoring record.
- [ ] Add the tutorial package URL and fixed task ID to `experiment.json`.
- [ ] Add a package integrity test proving all references exist and the task is absent from the formal manifest.
- [ ] Run the package integrity test and full suite.

### Task 3: Verify the built/static flow

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Confirm the tutorial package is present in the static output and the formal package remains present.
- [ ] Open the experiment entry and verify the first interactive tutorial task loads from `layout-task-tutorial`, while formal trial data still points to `layout-task-run12-core23-preview`.

