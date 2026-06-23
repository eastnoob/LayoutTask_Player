# Compile Workflow Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a concise operator-facing compile workflow document that records the recommended Rhino/StimuliGenerator-to-static-webpage path and default flags.

**Architecture:** Keep the new workflow as a standalone protocol document at `protocol/compile-workflow.md`, then link it from `protocol/README.md`. Do not expand the protocol schema or change compiler behavior in this task.

**Tech Stack:** Markdown documentation, existing `pixi` tasks, existing TypeScript adaptor/compiler CLI tools.

---

## File Structure

- Create: `protocol/compile-workflow.md`
  - Responsibility: step-by-step default workflow for assembling, validating, compiling, serving, and debugging Rhino/StimuliGenerator exports.
- Modify: `protocol/README.md`
  - Responsibility: add `compile-workflow.md` to the main protocol document list and point authors to it for operational steps.

---

### Task 1: Create Compile Workflow Document

**Files:**
- Create: `protocol/compile-workflow.md`

- [ ] **Step 1: Create the document with the full recommended workflow**

Use `apply_patch` to add `protocol/compile-workflow.md` with this exact content:

```markdown
# LayoutTask Compile Workflow

This document is the recommended operator workflow for turning a Rhino/StimuliGenerator export into a static LayoutTask webpage.

Use this when you already have a generated run folder such as:

```text
D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_2
```

The examples below use PowerShell paths. Replace `sg_output_2`, package names, experiment IDs, and titles for each real run.

## Default Position

Use standard JSON and explicit Rhino bbox dimensions by default.

Do not use `--trust-svg-viewbox` unless the SVG root `viewBox` values are already authored in the same task-space world units as `world.viewBox`.

For the current Rhino pipeline, the best default is:

- preserve `background.x/y/width/height`
- preserve object `default_width/default_height`
- attach object collider SVGs with `--attach-collider-svg`
- normalize paired group/variable SVG dimensions with `--normalize-paired-svg-dimensions`
- compile into a self-contained static package under `public/<package-name>`

## Expected Input Folder

The source folder should contain:

```text
sg_output_2/
  data.csv
  assets/
    images/
      stimulus/
      thumb/
  processing/
```

The LayoutTask package folder should contain or receive:

```text
processing/layouttask-source-collider-preserve-size/
  batch.json
  assets/
    backgrounds.json
    objects.json
    backgrounds/
    objects/
    collision/
      objects/
    images/
  behaviors/
    behaviors.json
```

Object visual SVGs should live under `assets/objects/`.

Object collider SVGs should live under `assets/collision/objects/` and use the same stem plus `_COLLISION.svg`, for example:

```text
assets/objects/m04_variable.svg
assets/collision/objects/m04_variable_COLLISION.svg
```

Stimulus preview images should be copied into the package if `display_image.src` points to `assets/images/...`.

## Recommended Commands

Set paths once:

```powershell
$src = "D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_2"
$pkg = "$src\processing\layouttask-source-collider-preserve-size"
$public = "public\layout-task-generated-sg-output-2-collider-preserve-size"
```

Assemble the protocol package:

```powershell
pixi run assemble-stimuli-csv `
  --csv "$src\data.csv" `
  --out "$pkg" `
  --experiment-id sg_output_2_collider_preserve_size `
  --title "SG Output 2 Collider Preserve Size" `
  --attach-collider-svg `
  --normalize-paired-svg-dimensions `
  --asset-root "$pkg"
```

Copy preview images into the package if the adaptor output references them:

```powershell
if (!(Test-Path "$pkg\assets\images")) {
  New-Item -ItemType Directory -Force "$pkg\assets\images" | Out-Null
}
Copy-Item -LiteralPath "$src\assets\images" -Destination "$pkg\assets" -Recurse -Force
```

Validate the batch:

```powershell
pixi run validate-batch "$pkg\batch.json"
```

Expected output:

```json
{
  "valid": true,
  "experiment_id": "sg_output_2_collider_preserve_size",
  "trial_count": 10
}
```

Compile the static package:

```powershell
pixi run compile-batch "$pkg\batch.json" --out "$public"
```

Expected output includes:

```text
Compiled 10 task(s) to public\layout-task-generated-sg-output-2-collider-preserve-size
Copied static directories: assets, behaviors, assets/icons
```

Build the app:

```powershell
npm run build
```

Serve locally:

```powershell
pixi run serve-local
```

If port `5173` is already running, reuse it.

## Browser URL

Use this URL shape:

```text
http://127.0.0.1:5173/?base=/layout-task-generated-sg-output-2-collider-preserve-size/&task=scene_afa7ff5e4ecd&q=Q_scene_afa7ff5e4ecd
```

Rules:

- `base` points to the generated package folder under `public/`.
- `task` is the task ID from `manifest.json`.
- `q` can use the matching `qid`; if unsure, inspect `manifest.json`.

## Why These Defaults

`--attach-collider-svg` attaches same-name collider sidecars and enables task-level discrete collision.

`--normalize-paired-svg-dimensions` fixes Rhino/SVG exports where a `*_variable` and `*_group` asset share one SVG viewBox axis but the exported bbox dimensions disagree on that axis. This is preferred over hand-editing `assets/objects.json`.

`--asset-root "$pkg"` tells the adaptor where to read the SVG files when normalizing dimensions. Run this after the visual/collider assets have been copied into the package.

`compile-batch` copies `assets/`, `behaviors/`, and Player UI `assets/icons/` into the output package. A generated package should be directly usable from a static server.

## Do Not Use By Default

Do not add `--trust-svg-viewbox` for normal Rhino output.

Use `--trust-svg-viewbox` only when:

- the SVG root `viewBox` is already in task-space world units
- object sizes should be inferred from SVG `viewBox.width/height`
- background placement should be inferred from SVG `viewBox.x/y/width/height`

If the SVG `viewBox` is asset-local pixels or Illustrator units, trusting it will distort the scene.

## Quick Checks

Check the generated manifest:

```powershell
Invoke-RestMethod "http://127.0.0.1:5173/layout-task-generated-sg-output-2-collider-preserve-size/manifest.json"
```

Check common static assets:

```powershell
$base = "http://127.0.0.1:5173/layout-task-generated-sg-output-2-collider-preserve-size/"
Invoke-WebRequest ($base + "assets/icons/arrow-right.svg") -Method Head
Invoke-WebRequest ($base + "assets/images/stimulus/afa7ff5e4ecd_perspective_stimulus_1920x1080.png") -Method Head
```

Both should return status `200`.

## Troubleshooting

### Startup error: `Unexpected token '<'`

This usually means the browser requested JSON but received `index.html`.

Check:

- `base` has leading and trailing slashes, for example `/layout-task-generated.../`
- `manifest.json` exists under `public/<package-name>/`
- `compile-batch` was run after `assemble-stimuli-csv`
- the browser URL points to the latest package name

### Missing prompt or control icons

Check:

```powershell
Invoke-WebRequest ($base + "assets/icons/arrow-right.svg") -Method Head
```

If this is not `200`, rerun `pixi run compile-batch ...`; the compiler should copy `assets/icons`.

### Preview image missing

Check `display_image.src` in a task JSON file. If it points to `assets/images/...`, copy `$src\assets\images` into `$pkg\assets` before compiling.

### Furniture size looks wrong

First confirm whether the package was assembled with:

```text
--normalize-paired-svg-dimensions --asset-root "$pkg"
```

Then inspect `assets/objects.json`. For the current short-bookcase example, `m04_variable` should be approximately:

```json
{
  "default_width": 3865.162,
  "default_height": 603.932
}
```

Do not fix this by hand unless you are making a temporary diagnostic package.

### Collision does not block movement

Check both levels:

- task JSON has `collision.enabled: true`
- moving object has `collision.enabled: true`
- blocking object also has `collision.enabled: true`
- object collision shape is `asset_outline` or resolved runtime polygons
- collider SVG is present under `assets/collision/objects/`

Remember: collision blocks only if the next candidate step intersects a collision shape. If a move is allowed, the runtime may be correctly reporting that the next step does not intersect the current collider geometry.

## Release Checklist

Before using a package in a study:

1. Run `pixi run validate-batch`.
2. Run `pixi run compile-batch`.
3. Run `npm run build`.
4. Open at least one task URL in the browser.
5. Confirm preview image, background, object sizes, controls, icons, and collision behavior.
6. Submit one result and confirm the encoded output can be decoded/scored.
```

- [ ] **Step 2: Verify the file exists and contains no unfinished markers**

Run:

```powershell
rg -n "TO""DO|TB""D|fill in|later" protocol/compile-workflow.md
```

Expected: no matches.

- [ ] **Step 3: Commit this document**

Run:

```powershell
git add protocol/compile-workflow.md
git commit -m "docs: add compile workflow guide"
```

Expected: commit succeeds.

---

### Task 2: Link Workflow From Protocol README

**Files:**
- Modify: `protocol/README.md`

- [ ] **Step 1: Add the workflow file to the main file list**

In `protocol/README.md`, change the "Main files" list by adding this line after `player-ingestion.md`:

```markdown
- `compile-workflow.md`: recommended assemble/validate/compile/serve workflow and default flags.
```

- [ ] **Step 2: Add a short operational pointer near compiler guidance**

In `protocol/README.md`, after the paragraph that starts with ``Runtime player files can be generated by `compile-batch` ``, add:

```markdown
For day-to-day Rhino/StimuliGenerator exports, follow `compile-workflow.md`.
It records the recommended default flags, package layout, local URL shape, and
diagnostic checks.
```

- [ ] **Step 3: Verify the link text is present**

Run:

```powershell
rg -n "compile-workflow|recommended assemble" protocol/README.md
```

Expected output includes:

```text
compile-workflow.md
recommended assemble/validate/compile/serve workflow
```

- [ ] **Step 4: Commit the README link**

Run:

```powershell
git add protocol/README.md
git commit -m "docs: link compile workflow guide"
```

Expected: commit succeeds.

---

### Task 3: Final Documentation Verification

**Files:**
- Verify: `protocol/compile-workflow.md`
- Verify: `protocol/README.md`

- [ ] **Step 1: Check command names against `pixi.toml`**

Run:

```powershell
rg -n "assemble-stimuli-csv|validate-batch|compile-batch|serve-local" pixi.toml protocol/compile-workflow.md
```

Expected: every command named in `protocol/compile-workflow.md` exists under `[tasks]` in `pixi.toml`.

- [ ] **Step 2: Check generated package wording matches compiler output**

Run:

```powershell
rg -n "Copied static directories: assets, behaviors, assets/icons|assets/icons|Unexpected token" protocol/compile-workflow.md
```

Expected: all three troubleshooting/compiler references are present.

- [ ] **Step 3: Review final diff**

Run:

```powershell
git diff --stat HEAD~2..HEAD
git show --stat --oneline HEAD
```

Expected: only `protocol/compile-workflow.md` and `protocol/README.md` changed in these documentation commits.

---

## Self-Review

Spec coverage:

- The plan creates a standalone compile workflow document.
- The plan includes the recommended default flags.
- The plan explains why `--trust-svg-viewbox` is not default.
- The plan includes asset copying, validation, compilation, serving, URL shape, and troubleshooting.
- The plan links the new document from `protocol/README.md`.

Unfinished-marker scan:

- No unfinished-marker strings or vague "fill in later" steps are present.
- Commands are concrete PowerShell commands.

Type and name consistency:

- `assemble-stimuli-csv`, `validate-batch`, `compile-batch`, and `serve-local` match existing `pixi.toml` task names.
- `--attach-collider-svg`, `--normalize-paired-svg-dimensions`, and `--asset-root` match the current TS adaptor flags.
