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
      behavior: LIMITED_MOVE,
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
- `messages`
- `requirements.min_viewport`

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
