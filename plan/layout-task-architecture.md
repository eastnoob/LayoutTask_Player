# Layout Task Architecture Plan

Version: v1.0  
Project: `layout-task-player`

This document keeps the original architecture direction, but rewrites the current project status into a clean UTF-8 note that matches the repository as of May 5, 2026.

## 1. Summary

Layout Task Player is a static-deployable, config-driven spatial layout task player. It can run as:

- a standalone browser page
- a jsPsych plugin inside an experiment timeline

The system loads static JSON config files, resolves them into a runtime task config, renders the scene in SVG, records interaction/result data, and exports one encoded string that can later be decoded into trial/event CSV.

Core principles:

- Static hosting first: GitHub Pages / GitLab Pages / Netlify friendly
- Config driven: task, assets, behavior, messages, and requirements are separated
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
- resolve asset URLs and default values
- inject runtime messages and requirements defaults

Notes:

- `display_image.src` is resolved to a runtime URL
- `requirements.min_viewport` is normalized for renderer consumption
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

Important task-level blocks already supported:

- `completion`
- `recording`
- `output`
- `feedback`
- `display_image`
- `messages`
- `requirements.min_viewport`

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
