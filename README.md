# Layout Task Player

Layout Task Player is a static, browser-based spatial layout task player for research use. It can run as a standalone page or as a jsPsych plugin, and it exports one encoded result string that can later be decoded into structured trial/event data.

## What it does

- renders a layout task from static JSON config
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

1. configure a task in `public/layout-task/tasks/*.json`
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

Important task-level sections currently supported:

- `completion`
- `recording`
- `output`
- `feedback`
- `display_image`
- `messages`
- `requirements.min_viewport`

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
