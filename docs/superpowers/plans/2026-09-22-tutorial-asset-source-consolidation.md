# Tutorial Asset Source Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `assets/` the source-of-truth asset root for tutorial reference-board materials while keeping formal experiment runtime assets isolated and unpolluted.

**Architecture:** Keep the existing formal asset folders in `assets/backgrounds`, `assets/collision`, and `assets/objects` untouched because compiler/runtime references already depend on that shape. Add `assets/tutorial-reference/` as the source directory for tutorial models and SVG/GIF assets, sync only browser-needed SVG/GIF files into `public/experiment/layout-task/assets/tutorial-reference/`, and point tests at that contract.

**Tech Stack:** PowerShell file operations, TypeScript/Vitest tests, Vite public static serving.

**Spec:** User request in this thread on 2026-09-22: use `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\assets` as the single managed asset source root; keep existing formal-experiment compile assets isolated; link tutorial assets through that source.

## Global Constraints

- Do not move or rename existing formal compile assets in `assets/backgrounds`, `assets/collision`, or `assets/objects` in this task.
- Tutorial reference-board source models and display assets live under `assets/tutorial-reference/`.
- Runtime-served tutorial copies live under `public/experiment/layout-task/assets/tutorial-reference/`.
- Tutorial config must continue to load from the browser at `/experiment/layout-task/assets/tutorial-reference/...`.
- Four tutorial items remain: m01, m03, m04, m05.

## Review Focus

- Broken browser paths: every configured tutorial SVG/GIF should resolve under `/experiment/layout-task/assets/tutorial-reference/`.
- Source drift: every configured runtime tutorial asset should have a source file in `assets/tutorial-reference/`.
- Formal pollution: no tutorial reference files should be copied into `assets/objects`, `assets/collision`, or formal compiled package object folders.
- Orphan clutter: old unused tutorial-reference root files should not be required by config or tests.
- Build stability: the Vite build and full Vitest suite should remain green.

---

### Task 1: Establish Tutorial Source Directory

**Files:**
- Create/copy: `assets/tutorial-reference/models/*.3dm`
- Create/copy: `assets/tutorial-reference/tutorial/**`
- Create: `assets/README.md`
- Modify: none in runtime code

**Interfaces:**
- Produces: source tutorial models and display assets matching the public `tutorial/**` layout.
- Consumes: current working runtime copies from `public/experiment/layout-task/assets/tutorial-reference/tutorial/**`.

- [ ] Copy `public/experiment/layout-task/assets/tutorial-reference/tutorial/**` into `assets/tutorial-reference/tutorial/**`.
- [ ] Copy the four active tutorial `.3dm` models into `assets/tutorial-reference/models/`.
- [ ] Add `assets/README.md` explaining that `assets/` is the source asset root, existing `backgrounds/collision/objects` are formal compile sources, and `tutorial-reference` syncs to public runtime assets.
- [ ] Verify the source folder contains 16 tutorial board assets: 8 SVG files and 8 GIF files.

### Task 2: Clean Runtime Tutorial Folder

**Files:**
- Modify/delete under: `public/experiment/layout-task/assets/tutorial-reference/`

**Interfaces:**
- Consumes: source files from Task 1.
- Produces: clean browser-served tutorial assets with only the active `tutorial/**` layout.

- [ ] Remove unreferenced legacy files directly under `public/experiment/layout-task/assets/tutorial-reference/`.
- [ ] Re-copy `assets/tutorial-reference/tutorial/**` to `public/experiment/layout-task/assets/tutorial-reference/tutorial/**`.
- [ ] Verify `public/experiment/layout-task/assets/tutorial-reference/` contains the active `tutorial` directory and no required config asset is missing.

### Task 3: Pin The Contract With Tests

**Files:**
- Modify: `src/core/tutorial-reference-board.test.ts`

**Interfaces:**
- Consumes: experiment config item paths.
- Produces: regression coverage proving each configured tutorial path maps to both public runtime copy and root source copy.

- [ ] Add a test that reads `public/experiment/experiment.json`, extracts the 16 configured reference-board asset paths, maps them to source paths under `assets/tutorial-reference/`, and asserts each exists.
- [ ] Keep the existing browser path test asserting rendered image URLs stay under `/experiment/layout-task/assets/`.
- [ ] Run the targeted test and verify it passes.

### Task 4: Verify Whole App

**Files:**
- No source edits expected.

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: verified local app state.

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Check `git status --short` and summarize changed files.
