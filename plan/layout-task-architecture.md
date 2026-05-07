# Layout Task Architecture Plan

Version: v1.0  
Project: `layout-task-player`

This document keeps the original architecture direction, but rewrites the current project status into a clean UTF-8 note that matches the repository as of May 5, 2026.

## 1. Summary

Layout Task Player is a static-deployable, config-driven spatial layout task player. It can run as:

- a standalone browser page
- a jsPsych plugin inside an experiment timeline

The system loads static JSON config files, and may also load trusted JS module task configs, resolves them into a runtime task config, renders the scene in SVG, records interaction/result data, and exports one encoded string that can later be decoded into trial/event CSV.

Core principles:

- Static hosting first: GitHub Pages / GitLab Pages / Netlify friendly
- Config driven: task, assets, behavior, messages, and requirements are separated
- Human-editable task config: JSON remains default; trusted `.config.js` task files are available for comments/variables
- Reproducible result transport: encoded output carries header/meta plus structured JSON result
- Research workflow friendly: decode/export tools exist outside the browser runtime

## 2. Current Repo Status

- source branch before this phase: `feature/display-image-frame`
- current branch for this phase: `feature/release-hardening`
- current debug encoding policy: `public/layout-task/tasks/room01.json` stays on `plain-json`

Recent milestone commits:

- `2d9687b feat: add snap drag interaction`
- `87f7114 chore: add stable local serve task`
- `9f8b6d0 feat: add limit feedback polish`
- `50ed1a7 feat: record display timing and guard empty submissions`

Already landed capabilities:

- standalone player core factory via `createLayoutTaskPlayer()`
- jsPsych plugin integration
- button movement and snap drag movement
- limit feedback overlays
- display image frame above the workspace
- `display.changes` tracking for viewport/image changes during a trial
- `page_timing` metadata for page-open vs player-start timing
- unchanged-submission extra confirm before final lock
- optional DataPipe save service with copy fallback
- decoder validation and CSV export tools

Explicit non-goal for this phase:

- do not switch `room01.json` back to compressed output yet

## 3. Runtime Architecture

High-level flow:

```text
URL params / jsPsych trial params
          |
          v
ConfigLoader -> config validation
          |
          v
RuntimeTaskConfig
          |
          +-> standalone main.ts
          |
          +-> LayoutTaskPlugin
                 |
                 v
        createLayoutTaskPlayer()
                 |
                 +-> StateStore
                 +-> LayoutTaskRenderer
                 +-> InteractionController
                 +-> CompletionController
                 +-> Recorder
                 +-> DisplayInfoCollector
                 +-> LayoutTaskEncoder
                 +-> ClipboardService
```

Offline analysis flow:

```text
encoded result string
    -> decoder
    -> validation
    -> export-trials CSV
    -> export-events CSV
```

## 4. Key Modules

### 4.1 ConfigLoader

Responsibility:

- load `manifest.json`
- resolve task selection from `taskId` / `qid`
- load task + object/background/behavior libraries
- allow task files to be JSON or trusted JS modules
- resolve asset URLs and default values
- inject runtime messages and requirements defaults

Notes:

- `display_image.src` is resolved to a runtime URL
- `requirements.min_viewport` is normalized for renderer consumption
- `.js` / `.mjs` task configs are loaded with dynamic import and still validated by the same schema
- `manifest.asset_base_url` may optionally redirect only static asset URLs to a CDN without moving manifest/task/library loading
- this layer stays static-host friendly and does not require a backend

### 4.2 Player Core

`createLayoutTaskPlayer()` is the actual product core.

Responsibility:

- mount renderer
- wire store, interaction, completion, recorder, encoder, clipboard
- expose start/destroy/state lifecycle

Boundary:

- `main.ts` is only a thin standalone entry
- `LayoutTaskPlugin` is only a jsPsych lifecycle adapter

### 4.3 Renderer

Responsibility:

- build DOM + SVG stage
- render objects, controls, feedback, completion UI
- render optional display image frame
- render optional min viewport warning

Important current UI behaviors:

- object edit mode is selection-based, not hover-only
- drag objects hide move arrows but may still expose rotation buttons
- limit feedback flashes reachable area / rotation halo plus a short label
- SVG object assets are inlined into the stage when possible.
- selected-object highlighting uses a separate shadow layer behind the real object, so filters never act directly on the object body.

### 4.4 Recorder / Display Metrics

Recorder currently supports:

- event log recording
- blocked-event policy
- final state output
- user-agent capture
- display info capture
- display change tracking
- page timing capture

Current display-related result payload may include:

- viewport
- screen
- `visualViewport`
- screen orientation
- color depth / pixel depth
- display image frame rect
- display image rendered CSS/effective pixel size
- `display.changes` summary + events

### 4.5 Decoder Tools

Current tools:

- `tools/decoder/decode-results.ts`
- `tools/decoder/export-trials.ts`
- `tools/decoder/export-events.ts`

Current decoder responsibilities:

- decode encoded strings
- validate hash/header/result consistency
- export trial-level CSV
- export event-level CSV
- expose QC-relevant fields such as `hash_ok`, `header_ok`, and `final_state_mode`

## 5. Researcher-Facing Config Areas

Main authoring files:

- `public/layout-task/manifest.json`
- `public/layout-task/assets/objects.json`
- `public/layout-task/assets/backgrounds.json`
- `public/layout-task/behaviors/behaviors.json`
- `public/layout-task/tasks/*.json`
- `public/layout-task/tasks/*.config.js` for trusted maintainer-authored task config

Important task-level blocks already supported:

- `completion`
- `recording`
- `output`
- `data_save`
- `feedback`
- `display_image`
- `messages`
- `requirements.min_viewport`
- `world.grid.origin` for shifting the movement/drag snap lattice

Behavior policy:

- Task objects use a single object-shaped `behavior` field.
- `behavior.template` references reusable entries in `behaviors.json`.
- `behavior.config` can override a template or provide a complete object-local behavior.
- Legacy `behavior: "template_name"` is intentionally unsupported to keep config semantics unique.

Stage fit policy:

- `world.viewBox` is the SVG/world coordinate source of truth.
- `stage.fit = contain` scales the complete world into the available browser stage without changing world coordinates.
- `grid.size`, movement steps, background placement, and object positions remain in the same world units.
- `room01_x4000_fit_test` is a large-coordinate fixture for validating this behavior, not a default experiment task.

Object rendering policy:

- SVG object assets are treated as the preferred foreground asset format.
- The loader may attach SVG source text to runtime object assets so the renderer can inline the shapes into the main SVG stage.
- Selection glow is a renderer concern, not per-object config.
- The real object layer must remain unfiltered; selection glow is rendered by a separate silhouette/shadow layer behind it.
- This avoids browser differences when applying filters to external SVG images or rotated object groups.

Data save policy:

- Default mode is `copy`: lock, encode, copy/show result.
- Optional `datapipe` mode posts `{ experimentID, filename, data }` to DataPipe after the result is locked.
- `datapipe` requires `experiment_id` in task config.
- `datapipe.payload_format` can be `json-envelope`, `encoded-only`, or `csv-row`; default remains the self-describing JSON envelope.
- DataPipe failures are non-fatal because copy/show remains the primary fallback.

Grid policy:

- `world.grid.size` controls the grid step.
- `world.grid.snap` controls whether movement/drag snaps to grid points.
- `world.grid.origin` is optional and shifts the snap lattice to `origin + n * size`.
- This is not a background anchor system; background placement is still controlled by `background.x/y/width/height`.

Config format policy:

- JSON is the safest default and should be used for shared, data-only task files.
- Trusted JS module task config is supported when comments, constants, or small authoring helpers make a task easier to maintain.
- JS config must not be used for untrusted uploads, because it is executable browser code.
- Optional CDN policy: keep config files on the main site, and only move asset-like URLs through `asset_base_url` when static asset acceleration is actually needed.

## 6. Phase Status

### v0.1 Minimal Player

Status: done

### v0.2 Grid + Movement

Status: done

### v0.3 Controls + Limits

Status: done

### v0.4 Data Encoding

Status: done

### v0.5 jsPsych Plugin Integration

Status: done

### v0.6 Modular Config

Status: done

### v0.7 Decoder Tools

Status: done

### v0.7.1 Decoder Validation

Status: done

- decoded result validation added
- CSV export validation-related columns added
- decoder unit tests added

### v0.8 Drag Interface

Status: done

### v0.9 Release Hardening

Status: in progress

Scope for this phase:

- clean up and sync architecture doc
- harden decoder export columns for display/timing data
- add lightweight researcher docs
- centralize user-visible messages
- add optional min viewport warning
- keep `room01` in `plain-json` debug mode

## 7. Release Notes For This Phase

During v0.9, `room01.json` intentionally remains:

```json
{
  "output": {
    "encoding": "plain-json"
  }
}
```

Reason:

- easier manual inspection during debugging
- easier to inspect `display`, `page_timing`, and final-state payloads directly

Formal experiment output policy can switch back to `lz-uri` in a later phase, but that decision is intentionally deferred.
