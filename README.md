# Layout Task Player

Layout Task Player is a static, browser-based spatial layout task player for research use. It can run as a standalone page or as a jsPsych plugin, and it exports one encoded result string that can later be decoded into structured trial/event data.

## What it does

- renders a layout task from static JSON or trusted JS config
- supports button movement, rotation, and snap drag movement
- records final state and optional interaction/display metadata
- copies one encoded result string for survey collection
- provides decoder/export tools for later analysis

## Local Development

This repo uses `pixi` as the main workflow wrapper.

Install JS dependencies:

```bash
pixi run install-js
```

Start Vite dev server:

```bash
pixi run dev
```

Build production assets:

```bash
pixi run build
```

Run tests:

```bash
pixi run test
```

Stable local preview server:

```bash
pixi run serve-local
```

Typical standalone debug URL:

```text
http://127.0.0.1:5173/?task=room01&q=Q1
```

Collision demo:

```text
http://127.0.0.1:5173/?task=room_collision_demo&q=QCOLLISION
```

Collision constraints are optional and use world-unit `contain`/`block` areas or a hidden SVG analysis layer. See `protocol/rhino.md`.

Complete preview + collision demo:

```text
http://127.0.0.1:5173/?task=room_collision_preview_demo&q=QCOLLISIONPREVIEW
```

This demo first shows a reference `display_image`, then switches to a button-controlled reconstruction scene with collision constraints.

## Static Deployment

This project is designed for pure static hosting.

Suitable targets:

- GitHub Pages
- GitLab Pages
- Netlify

General deployment flow:

1. run `pixi run build`
2. publish the generated `dist/` directory
3. make sure the static `public/layout-task/` assets are included in the build output

No backend is required for runtime task delivery.

## Researcher Workflow

Typical use:

1. configure a task in `public/layout-task/tasks/*.json` or `*.config.js`
2. publish the page and send participants a link
3. participant completes the task and copies the encoded result string
4. collect those strings in your survey platform
5. decode/export them later with the decoder tools

Example decoder usage:

```bash
pixi run npm exec tsx -- tools/decoder/decode-results.ts --input results.txt --pretty
pixi run npm exec tsx -- tools/decoder/export-trials.ts --input results.txt --output trials.csv
pixi run npm exec tsx -- tools/decoder/export-events.ts --input results.txt --output events.csv
```

## Configuration Entry Points

Main config files:

- `public/layout-task/manifest.json`
- `public/layout-task/assets/objects.json`
- `public/layout-task/assets/backgrounds.json`
- `public/layout-task/behaviors/behaviors.json`
- `public/layout-task/tasks/*.json`
- `public/layout-task/tasks/*.config.js`

### Protocol Kit and Batch Generation

Large studies should use the protocol kit in `protocol/` rather than hand-authoring every task file. The canonical source format is standard JSON, not JSON5 or executable code. A future Rhino exporter should produce `layouttask.batch.v1` JSON following `protocol/rhino.md` and the templates in `protocol/templates/`.

```bash
pixi run validate-batch --input protocol/examples/minimal-batch.json
pixi run compile-batch --input protocol/examples/minimal-batch.json --out public/layout-task-generated
```

Rhino v1 support is dictionaries, conventions, templates, and export checklists only. This repository does not ship or require Rhino scripts, Grasshopper components, Rhino Python, Rhino C#, or Rhino plugins for the protocol workflow. The protocol examples and assets under `protocol/examples/` are self-authored fixtures for validation, compilation, visual checks, and scoring tests; they are not exported from Rhino.

#### Batch Generator Commands

Validate canonical batch JSON:

```bash
pixi run npm exec tsx -- tools/generator/validate-batch.ts --input protocol/examples/minimal-batch.json
```

Compile batch JSON into static player files:

```bash
pixi run npm exec tsx -- tools/generator/compile-batch.ts --input protocol/examples/minimal-batch.json --out public/layout-task-generated
```

Export object-level rows with explicit relative and absolute columns:

```bash
pixi run npm exec tsx -- tools/scoring/export-object-states.ts --input results.txt --scoring public/layout-task-generated/scoring/scoring-reference.json --output object-states.csv
```

The object-state CSV uses explicit observed, target, and error columns for both scoring models, including `relative_dx_steps`, `relative_dy_steps`, `relative_rotation_steps`, `absolute_x`, `absolute_y`, and `absolute_rotation_deg`.

JSON is the safest default and remains recommended for shared data-only config. For project-maintainer-authored tasks, a JS module config is also supported:

```js
const LIMITED_MOVE = "move25_rotate45_limited";

export default {
  schema: "layouttask.task.v1",
  task_id: "room01",
  qid: "Q1",

  // Background / 背景图
  background: {
    asset: "room01_bg",
    x: -400,
    y: -300,
    width: 800,
    height: 600,
  },

  // Objects / 前景物体
  objects: [
    {
      id: "chair_01",
      asset: "chair_a",
      x: 100,
      y: 150,
      rotation: 0,
      behavior: {
        template: LIMITED_MOVE,
      },
    },
  ],
};
```

Then point `manifest.json` to it:

```json
{
  "qid": "Q1",
  "task_id": "room01",
  "file": "tasks/room01.config.js"
}
```

JS config is executable code, so only use it for trusted static files maintained inside this repository. Do not use JS config for participant uploads or untrusted third-party input.

## Optional Asset CDN Hook

If you later want to keep the page/config on GitHub Pages but serve heavy static assets from a CDN, `manifest.json` may define:

```json
{
  "asset_base_url": "https://cdn.example.com/layout-task/"
}
```

Behavior:

- task JSON / JS config, manifest, and behavior libraries still load from the normal site `baseUrl`
- only asset-like paths use `asset_base_url`
  - object SVG / PNG / JPG
  - background SVG / image
  - `display_image.src`

This keeps the hook minimal and avoids moving the whole config-loading pipeline onto a second origin.

Important task-level sections currently supported:

- `completion`
- `recording`
- `output`
- `data_save`
- `feedback`
- `display_image`
- `flow`
- `messages`
- `requirements.min_viewport`

### Object Behavior

Each task object uses one behavior object. The legacy string form is not supported.

Use a shared behavior template from `behaviors.json`:

```json
{
  "behavior": {
    "template": "drag25_rotate45_limited"
  }
}
```

Override part of a template for one object:

```json
{
  "behavior": {
    "template": "drag25_rotate45_limited",
    "config": {
      "movement": {
        "max_left": 1,
        "max_right": 1
      }
    }
  }
}
```

Or define the full behavior directly on the object:

```json
{
  "behavior": {
    "config": {
      "movement": { "mode": "button", "step": 25 },
      "rotation": { "step": 45, "max_cw": 2, "max_ccw": 2 },
      "free_drag": { "enabled": false }
    }
  }
}
```

### Object SVG Rendering and Selection

SVG object assets are loaded as inline SVG when possible. This lets the renderer apply the same selection treatment to chairs, tables, rotated objects, and large-coordinate fixtures without relying on browser-specific filtering of external `<image href="...svg">` elements.

Selection is implemented as a separate shadow layer behind the object:

- the real object layer always remains visible
- the selected shadow layer is shown only on hover, focus, or active selection
- the shadow layer reuses the same SVG shape with a cyan silhouette and SVG filter
- no per-object config is required for normal SVG assets

For best results, object SVGs should be self-contained and use ordinary SVG shapes such as `rect`, `circle`, `path`, `polygon`, or grouped combinations of these. Complex SVGs with their own filters, masks, clip paths, or embedded external images should be checked manually.

### Flow Modes

Tasks default to direct reconstruction: participants can interact with the stage as soon as the player opens.

```json
{
  "flow": {
    "mode": "direct_reconstruction"
  }
}
```

For memory reconstruction studies, a task can first show the configured `display_image`, hide or lock the reconstruction stage, then switch into normal interaction after a timed preview:

```json
{
  "display_image": {
    "enabled": true,
    "src": "assets/display-images/reference.jpeg"
  },
  "flow": {
    "mode": "preview_then_reconstruct",
    "config": {
      "preview_duration_sec": 10,
      "require_preview_ack": true,
      "intro_message": "Next, you have {seconds} seconds to study the image. Please remember the object positions and orientations. After the image disappears, reconstruct the scene from memory.",
      "intro_confirm_label": "Start preview",
      "stage_during_preview": "hidden",
      "show_countdown": true,
      "message_before": "Next, you have {seconds} seconds to study the image.",
      "message_after": "Please reconstruct the scene from memory."
    }
  }
}
```

`stage_during_preview` can be `hidden` or `locked`; the default is `hidden`. Preview timing starts after the display image is ready, and the result includes a `flow` block with preview/reconstruction timing. The main `start_time` and `duration_ms` still cover the whole player session.

`require_preview_ack` defaults to `true`: the player first shows an instruction dialog, replaces `{seconds}` with `preview_duration_sec`, and starts the timed preview only after the participant confirms. Set it to `false` only when the preview should begin automatically.

The reconstruction panel also shows a persistent hint block. Its text comes from `messages`, but the renderer decides which rows to show from the actual object behaviors:

- drag objects show the drag hint
- button-move objects show the arrow-move hint
- rotatable objects show the rotate hint

This keeps the task copy configurable without forcing authors to hand-write separate instructions for every behavior combination.

### World Units and Stage Fit

The SVG stage uses `world.viewBox` as the coordinate system. Background placement, object positions, grid size, and movement steps should all use the same world units:

```json
{
  "world": {
    "viewBox": { "x": 0, "y": 0, "width": 3200000, "height": 2400000 },
    "origin": { "x": 0, "y": 0 },
    "grid": { "size": 100000, "snap": true }
  },
  "background": {
    "asset": "room01_bg_x4000",
    "x": 0,
    "y": 0,
    "width": 3200000,
    "height": 2400000
  },
  "stage": {
    "fit": "contain",
    "max_height_ratio": 0.72,
    "padding": 16
  }
}
```

`stage.fit` currently supports `contain`: the browser scales the whole world to the available stage area without changing the world coordinates. This is intended for 1:1 CAD/floorplan SVGs where grid size and movement steps are defined in drawing units. The `room01_x4000_fit_test` task is a fixture for checking very large coordinate systems; it is not the default experiment task.

### Optional DataPipe Saving

The default save mode is copy-only. 被试完成后仍然复制 encoded result，适合所有纯静态部署：

```json
{
  "data_save": {
    "mode": "copy"
  }
}
```

If a study uses DataPipe + OSF, a task can additionally save from the browser to DataPipe:

```json
{
  "data_save": {
    "mode": "datapipe",
    "experiment_id": "YOUR_DATAPIPE_EXPERIMENT_ID",
    "filename_prefix": "layout-task",
    "payload_format": "json-envelope",
    "save_encoded": true,
    "save_result": true
  }
}
```

DataPipe mode requires `experiment_id`. Optional fields:

- `endpoint`: defaults to `https://pipe.jspsych.org/api/data/`
- `filename_prefix`: defaults to `layout-task`
- `payload_format`: defaults to `json-envelope`
- `save_encoded`: defaults to `true`
- `save_result`: defaults to `true`

`payload_format` controls the file content saved to OSF:

- `json-envelope`: saves a self-describing `.json` file with metadata, encoded result, and optionally the full result object
- `encoded-only`: saves only the copied `LAYOUTTASK1|...` string as `.txt`
- `csv-row`: saves one `.csv` row with `qid`, `task_id`, `session`, `hash8`, `encoding`, and `encoded`

DataPipe saving is an extra upload step, not the only fallback. If the upload fails, the locked encoded result is still copied/shown so participants can paste it back into the survey.

### Grid Origin

`world.grid.origin` can shift the snap lattice without moving the background image:

```json
{
  "world": {
    "grid": {
      "size": 25,
      "visible": false,
      "snap": true,
      "origin": {
        "x": 10,
        "y": 5
      }
    }
  }
}
```

Meaning:

```text
x grid points = 10 + n * 25
y grid points = 5 + n * 25
```

This controls where objects snap during button movement and drag. It does not auto-anchor the background SVG; background placement still comes from `background.x`, `background.y`, `background.width`, and `background.height`.

## Current Debug Encoding Policy

`public/layout-task/tasks/room01.json` currently keeps:

```json
"encoding": "plain-json"
```

This is intentional for debugging. It makes the exported payload easy to inspect directly while the project is still being hardened. Switching formal experiment tasks back to compressed output is deferred to a later phase.

## Notes

- the player is static-host friendly by design
- the result string is transport encoding, not security protection
- decoder/export tooling is part of the expected research workflow
