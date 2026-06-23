# LayoutTask Compile Workflow

This is the current best-practice path from a Rhino/StimuliGenerator run folder to a static LayoutTask webpage.

## Default Setup

Use explicit Rhino bbox dimensions as the default. Do not use `--trust-svg-viewbox` unless the SVG root `viewBox` is already in task-space world units.

Recommended default:

| Item | Current default |
| --- | --- |
| Source data | `<run>\data.csv` |
| Source images | `<run>\assets\images` |
| Processing package | `<run>\processing\layouttask-source-collider-preserve-size` |
| Public package | `public\<package-name>` |
| Object display size | bbox-derived `default_width/default_height` |
| Background placement | bbox/world `x/y/width/height` |
| Movement mode | button arrows |
| Collision | object collider SVGs plus task-level `collision.enabled=true` |
| ViewBox sizing | off by default |

## Commands

Set paths:

```powershell
$src = "D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_2"
$pkg = "$src\processing\layouttask-source-collider-preserve-size"
$public = "public\layout-task-generated-sg-output-2-collider-preserve-size"
```

Assemble:

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

Copy preview images when `display_image.src` uses `assets/images/...`:

```powershell
if (!(Test-Path "$pkg\assets\images")) {
  New-Item -ItemType Directory -Force "$pkg\assets\images" | Out-Null
}
Copy-Item -LiteralPath "$src\assets\images" -Destination "$pkg\assets" -Recurse -Force
```

Validate, compile, build, serve:

```powershell
pixi run validate-batch "$pkg\batch.json"
pixi run compile-batch "$pkg\batch.json" --out "$public"
npm run build
pixi run serve-local
```

`compile-batch` should report:

```text
Copied static directories: assets, behaviors, assets/icons
```

## Parameter Defaults

| Parameter | Best default | Meaning |
| --- | --- | --- |
| `--csv` | `$src\data.csv` | StimuliGenerator CSV source. |
| `--out` | `$pkg` | Intermediate LayoutTask source package. |
| `--experiment-id` | stable run ID | Used in manifest, scoring reference, and output metadata. |
| `--title` | human-readable run title | Display/debug label. |
| `--attach-collider-svg` | enabled | Adds same-stem `_COLLISION.svg` object colliders and enables task collision. |
| `--normalize-paired-svg-dimensions` | enabled for current Rhino SVGs | Fixes paired `*_group` / `*_variable` size mismatches using SVG viewBox axis scale. |
| `--asset-root` | `$pkg` | Folder used to read SVG files for dimension normalization. |
| `--trust-svg-viewbox` | disabled | Only enable when SVG viewBox values are already world units. |
| `compile-batch --out` | `$public` | Static package served by `?base=/.../`. |

## Required Package Layout

```text
$pkg/
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

Collider convention:

```text
assets/objects/m04_variable.svg
assets/collision/objects/m04_variable_COLLISION.svg
```

## URL

```text
http://127.0.0.1:5173/?base=/layout-task-generated-sg-output-2-collider-preserve-size/&task=scene_afa7ff5e4ecd&q=Q_scene_afa7ff5e4ecd
```

Rules:

- `base` is the generated folder under `public/`, with leading and trailing slash.
- `task` is from `manifest.json`.
- `q` is the matching `qid`.

## Quick Checks

```powershell
$base = "http://127.0.0.1:5173/layout-task-generated-sg-output-2-collider-preserve-size/"
Invoke-RestMethod ($base + "manifest.json")
Invoke-WebRequest ($base + "assets/icons/arrow-right.svg") -Method Head
Invoke-WebRequest ($base + "assets/images/stimulus/afa7ff5e4ecd_perspective_stimulus_1920x1080.png") -Method Head
```

Expected: requests return `200`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `Unexpected token '<'` | Wrong `base`, missing `manifest.json`, or package not compiled into `public/`. |
| Icons missing | Rerun `compile-batch`; output should include `assets/icons`. |
| Preview image missing | Copy `$src\assets\images` into `$pkg\assets` before compiling. |
| Furniture size wrong | Confirm `--normalize-paired-svg-dimensions --asset-root "$pkg"` was used. |
| Collision not blocking | Confirm task collision is enabled, both objects have collision enabled, and collider SVGs exist. |

For the current short-bookcase check, `assets/objects.json` should contain approximately:

```json
{
  "m04_variable": {
    "default_width": 3865.162,
    "default_height": 603.932
  }
}
```

## Release Checklist

1. `pixi run validate-batch "$pkg\batch.json"`
2. `pixi run compile-batch "$pkg\batch.json" --out "$public"`
3. `npm run build`
4. Open one task URL.
5. Confirm preview image, background, object sizes, icons, controls, and collision.
6. Submit one result and confirm the encoded output can be decoded/scored.
