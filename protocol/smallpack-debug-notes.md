# SmallPack 260727 Debug Notes

## Current Status

- Source package: `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_260727_smallPack`
- CSV is structurally usable by the existing adaptor.
- Current package has 10 accepted trials.
- Referenced background, object, image, and collision assets are present.
- `assemble-stimuli-csv`, `validate-batch`, `compile-batch`, and `validate-runtime-package` can pass.

## What Worked

The correct workflow is the existing Player ingestion chain:

```powershell
pixi run assemble-stimuli-csv -- --csv <data.csv> --out <source-dir> --experiment-id smallpack_260727 --attach-collider-svg
pixi run validate-batch <source-dir>\batch.json
pixi run compile-batch <source-dir>\batch.json --out <public-base>
Copy-Item <smallpack>\assets <public-base>\assets -Recurse -Force
Copy-Item <source-dir>\assets\*.json <public-base>\assets\ -Force
Copy-Item <source-dir>\behaviors <public-base>\behaviors -Recurse -Force
pixi run validate-runtime-package --base <public-base> --check-targets
pixi run build
```

When using `vite preview`, assets must be present before `pixi run build`, because preview serves `dist/`, not live `public/`.

Required initial-state semantics:

- Furniture-group placement and rotation are part of the displayed reconstruction
  start. If a group is placed at 45 or 90 degrees, both the context/group object
  and the variable object's explicit `initial` pose should already include that
  placed group transform.
- Variable-object task movement and self-rotation are not pre-applied to the
  displayed start. They remain in `target.relative` as signed answer steps for
  scoring and user interaction.
- In short: bake group pose into runtime `x/y/rotation`; keep variable answer
  offsets in `target.relative`.
- On the Rhino/GH side, `SceneSampler.points` must receive the five visible
  placement points in the same order as `PointPositionLabels.points`. The
  visible numeric labels define `point_id`/`point_index`; point parameter
  nicknames or left/right/top/bottom sorting are not authoritative. Current
  authoritative order is:
  `P01=(-3500,31500)`, `P02=(-3500,17500)`, `P03=(-7000,24500)`,
  `P04=(-10500,31500)`, `P05=(-10500,17500)`. Reordering before
  `SceneSampler` changes the meaning of every generated placement even when the
  coordinates themselves look valid.

2026-08-01 live GH check/fix:

- Before fix, `SceneSampler.points` was connected to Merge
  `b4192869-043c-4c99-99d2-0e860fabc694` and received
  `(-10500,31500)`, `(-3500,31500)`, `(-7000,24500)`,
  `(-10500,17500)`, `(-3500,17500)`.
- `PointPositionLabels.points` was connected to Point
  `1fc29a95-00d3-4f2b-8b2c-25cdee1d179b` and received the authoritative
  visible label order:
  `(-3500,31500)`, `(-3500,17500)`, `(-7000,24500)`,
  `(-10500,31500)`, `(-10500,17500)`.
- The live GH canvas was rewired so `SceneSampler.points` uses that same Point
  source; verification printed `match=True`.
- Existing `sg_output_260727_smallPack/data.csv` still contains the old point
  semantics until SG Runner is run again. Recompiling that old CSV will preserve
  the old P04/P05 mismatch.

## Confirmed Problems

### 1. `--trust-svg-viewbox` Was Wrong For This Package

The CSV background placement is:

```json
{ "x": -14000, "y": 0, "width": 14000, "height": 35000 }
```

The background SVG root is:

```xml
viewBox="0 0 9934 14044"
```

That SVG viewBox is not world coordinates. Using `--trust-svg-viewbox` strips the correct CSV placement and makes the Player infer placement from the SVG canvas, which puts the green floor in the wrong place.

### 2. Background SVG Contains Its Own Local Canvas

Even when CSV placement is preserved, the green floor is not necessarily the full SVG root. The visible floor is inside a larger SVG canvas with transforms. This means the Player is placing the exported SVG canvas correctly, but the exported canvas itself may include unwanted padding/rotation/offset.

### 3. Object SVGs Are Not 1:1 Geometry SVGs

Current object SVGs contain embedded raster `<image>` data and local pixel viewBoxes such as:

```xml
viewBox="0 0 601 1208"
```

Runtime object size comes from `metric_object_assets_json.default_width/default_height`, not from SVG viewBox. This is allowed, but it means object appearance depends on the Rhino/exported dimension metadata being correct.

Example:

```json
"m02_group": {
  "default_width": 402.336,
  "default_height": 808.021
}
```

If furniture appears too small or in the wrong place, the likely source is the generator/export coordinate contract: object anchor coordinates, SVG canvas bounds, and asset dimensions are not all using the same intended room coordinate frame.

Object SVG root viewBoxes and declared world sizes are not consistently 1:1:

```text
m01_group:    default 3847x745,  SVG viewBox 11555x2633
m01_variable: default 600x830,   SVG viewBox 1895x2578
m02_group:    default 402x808,   SVG viewBox 601x1208
m03_group:    default 2158x2000, SVG viewBox 2085x1920
m04_group:    default 2866x5517, SVG viewBox 1856x2652
m05_group:    default 1955x765,  SVG viewBox 1892x767
```

So object size cannot be fixed globally by always trusting SVG viewBox or always
trusting `default_width/default_height`. The exporter must decide which value is
the intended world size and make it consistent for all assets.

`M01` is especially suspicious: its declared world size is roughly one third of
its SVG viewBox size. If `M01` appears too small in trials where it is present,
the generator/exporter should first verify whether `default_width/default_height`
or SVG viewBox is the intended physical size.

### 4. Green Floor BBox vs World Floor

For `room_scene_0001_bg.svg`, the green floor is a transformed child rect inside
the SVG root. In SVG-root coordinates its bbox is approximately:

```json
{ "x": 2840.551, "y": 1795.276, "width": 4251.969, "height": 10452.756 }
```

When the full SVG root is placed at the CSV background world rectangle, that
green floor maps to approximately:

```json
{
  "x": -9996.808,
  "y": 4474.128,
  "width": 5992.306,
  "height": 26050.019
}
```

That is smaller than the intended `world.viewBox`/background floor, so furniture
whose anchors are near `x=-3500` or `y=31500` appears outside the visible green
floor.

The `layout-task-smallpack-bg-fit-demo` output proves the direction: if the SVG
root placement is expanded so that the green floor bbox maps to the intended
world floor, furniture positions line up better. This is still a diagnostic
demo, not a robust production rule, because it was inferred from a green fill.

## Working Hypothesis

The Player is now mostly doing what the package says. The remaining visual mismatch is probably upstream in the automated Rhino/GH export:

- background SVG root viewBox/artboard does not match the intended floor/world rectangle;
- object SVGs are raster snapshots in local pixel space, not direct world-unit SVG geometry;
- object `x/y` anchors may refer to slot centers, while the exported background visible floor is offset inside its SVG canvas.

## Next Checks

1. Compare Rhino floor/world bounds against:
   - `world.viewBox`
   - `trial.background.x/y/width/height`
   - background SVG root `viewBox`
   - visible floor bbox inside the background SVG
2. Compare each furniture model bbox against:
   - asset `default_width/default_height`
   - object SVG root `viewBox`
   - object `x/y` anchor
3. Decide export policy:
   - preferred: Rhino exports background SVG with root viewBox equal to world/floor bounds;
   - acceptable: keep explicit CSV background placement, but ensure the SVG canvas itself has no extra padding/offset;
   - acceptable: generator precomputes the SVG-root placement needed to align a declared floor bbox to the world floor;
   - do not use `--trust-svg-viewbox` unless the SVG root viewBox is already in world coordinates.

## Additional Finding: Object Coordinates Are Preserved By Compile

For `scene_e88186a19384`, CSV object coordinates and compiled task coordinates match exactly:

```text
m02: x=-3500,  y=31500
m03: x=-10500, y=17500
m04: x=-3500,  y=17500
m05: x=-7000,  y=24500
```

So the visible placement mismatch is not caused by `compile-batch` rewriting object
coordinates. The mismatch is already present in the authored protocol data, or in
how the background SVG/artboard is mapped to the world floor.

The adaptor now owns this fixed-background calibration for `room_scene_0001_bg`:
it maps the SVG-local green floor content box to `world.viewBox` and writes the
outer SVG placement needed by the Player. Rhino/GH can keep exporting model-space
facts and the background asset id.

## Additional Finding: Stimulus Pose vs Reconstruction Initial Pose

The current Rhino/CSV boundary now separates two meanings:

- source CSV `trial_protocol_json.objects[].x/y/rotation`: stimulus/correct pose;
- assembled batch/runtime task `objects[].x/y/rotation`: reconstruction initial pose shown by the Player;
- `scoring/scoring-reference.json` `target.relative`: correct answer used by scoring.

For `scene_e88186a19384_m02_variable`, the source CSV includes:

```json
{ "dx_steps": -2, "dy_steps": -2, "rotation_steps": 0 }
```

Before the adaptor fix, the compiled runtime task still placed both `m02_group`
and `m02_variable` at:

```json
{ "x": -3500, "y": 31500, "rotation": 0 }
```

Browser DOM inspection confirms the rendered `m02_group` and `m02_variable`
centers overlap at the same screen position. This is consistent with the current
code: `StateStore` initializes from runtime `objects[].x/y/rotation`, and
`renderer.updateObject()` applies only that live state transform.

The adaptor now treats source `x/y/rotation` as the stimulus pose. When a
variable object contains an explicit `initial`, that pose is used as the
reconstruction start. This is the right representation for "the furniture group
has already been rotated/placed, and the variable part is still at that group's
default pose." The explicit `initial` must be self-consistent:
`initial + target.relative * step` must equal the stimulus pose. If `initial` is
absent, the adaptor falls back to deriving the start from `target.relative` plus
the object movement/rotation step. For the old fallback example:

```json
{ "x": -2500, "y": 32500, "rotation": 0 }
```

That means the participant can move the variable object left/up by 2 steps to
return to the stimulus pose `(-3500, 31500)`.

## Additional Finding: Current SmallPack Initial Poses Are Invalid

The current `sg_output_260727_smallPack` writes all 40 variable objects with:

```text
initial == x/y/rotation
target.relative != 0
```

Example:

```json
{
  "id": "scene_from_runner_m02_variable",
  "x": -3500,
  "y": 31500,
  "rotation": 0,
  "initial": { "x": -3500, "y": 31500, "rotation_deg": 0 },
  "target": { "relative": { "dx_steps": -2, "dy_steps": -2, "rotation_steps": 0 } }
}
```

These cannot all be true under the protocol. The adaptor now rejects this during
assembly instead of compiling a misleading page where variable parts overlap the
context/default pose.

## Additional Finding: Variable Pose Anchor Contract Is Still Underspecified

For the current `sg_output_260727_smallPack`, the compiled runtime package keeps
all 80 variable reconstruction poses exactly equal to the source CSV
`initial.x/y/rotation_deg`; `compile-batch` is not introducing the variable
offsets.

The package is internally consistent in one narrow sense: for every variable,
`initial + target.relative * 500mm` equals the CSV stimulus/correct pose, and
`variable_initial_pose.rotation_deg - group_pose.rotation_deg == 0`. Nonzero
group rotations also rotate the variable default offset, so the CSV does encode
"placed/rotated group default pose" data.

What the package does not currently declare is the pose reference point. The CSV
and asset metadata contain `anchor: "center"`, dimensions, block names, and
poses, but no explicit bbox center, block insertion point, pivot, or origin mode.
The accompanying `stimuli-generator.sqlite` does not add more pose-origin data:
`variable_bindings` is empty, and `master_rows.metrics_json` stores the same
protocol/scene/asset JSON already exported to CSV.
The Player interprets `anchor: "center"` literally: SVG/object box center is
placed at `x/y`. If Rhino exports `group_pose` or `variable_initial_pose` from a
different reference point, all variable objects will be systematically shifted.

Also check asset export: several SVG viewBox aspect ratios do not match their
declared `default_width/default_height` ratios, especially `m01_group`,
`m02_variable`, `m04_group`, and `m04_variable`. That can make visual size and
center alignment unreliable even when pose arithmetic is self-consistent.

## Additional Finding: Group Rotation Preserves Exported Default Offset

For grouped furniture, the required start state has two layers:

1. The furniture-group placement/rotation is already visible in the
   reconstruction start.
2. The variable object's own answer movement/rotation remains only in
   `target.relative`.

`scene_8106c07115ae` shows the current issue. The compiled task preserves the
CSV data:

```text
scene_8106c07115ae_m05_group     x=-9842.460  y=16836.819  rotation=45
scene_8106c07115ae_m05_variable  x=-11898.723 y=16424.183  rotation=45
target.relative                  dx_steps=-2 dy_steps=1 rotation_steps=0
```

This means Player is displaying the authored initial pose, and the variable's
own rotation answer is not being pre-applied.

For M05, the unrotated variable initial offset from the group object center is:

```text
dx=-1745.775 dy=1162.220
```

After a 45 degree group rotation, the CSV writes approximately:

```text
dx=-2056.263 dy=-412.636
```

The same result is obtained by rotating both the unrotated group pose and the
unrotated variable initial pose 45 degrees around the P05 slot center
`(-10500, 17500)`. So the pose math is self-consistent for the exported default
offset. If the visual relation is still wrong, the likely source is the exported
default relation itself: `variable_initial_pose` may not be the variable's
intended default position relative to the context/group visual, or the asset
center/size used by Player may not match the generator's pose reference. Rhino/GH
should verify the unrotated default group-variable relation before group
rotation, and ideally export the common group pivot explicitly for audit.

## 2026-08-02 Recheck: Fresh Adaptor/Compiler Run

Fresh command chain used:

```powershell
pixi run assemble-stimuli-csv -- --csv "D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_260727_smallPack\data.csv" --out ".tmp\smallpack-0802-recheck-source" --experiment-id smallpack_0802_recheck --title "SmallPack Recheck 2026-08-02" --attach-collider-svg
pixi run validate-batch .tmp\smallpack-0802-recheck-source\batch.json
pixi run compile-batch .tmp\smallpack-0802-recheck-source\batch.json --out public\layout-task-smallpack-0802-recheck-compiled
pixi run validate-runtime-package --base public\layout-task-smallpack-0802-recheck-compiled --check-targets
npm run build
```

Results:

- assemble: 20 trials.
- compile: 20 tasks.
- runtime validation: 80 variables, 0 failures.
- production build: passed.
- `public` and `dist` compiled task JSON coordinates match.

Important browser gotcha:

- URL query had `task=scene_8106c07115ae&q=Q_scene_e88186a19384`.
- `ConfigLoader` intentionally chooses `task` first, then `qid`.
- Therefore that URL displays `scene_8106c07115ae`; the mismatched `q` is ignored.
- Use matching URLs when visually checking, for example:
  `?base=/layout-task-smallpack-0802-recheck-compiled/&task=scene_8106c07115ae&q=Q_scene_8106c07115ae`.

Current remaining visual issue is not caused by compile rewriting coordinates.
For `scene_8106c07115ae`, batch and compiled task both contain:

```text
m05_group     x=-9652.549   y=17570.296  rotation=45
m05_variable  x=-11708.812  y=17157.661  rotation=45
m04_group     x=-10500      y=31500      rotation=0
m04_variable  x=-10500      y=31500      rotation=0
```

The remaining likely source is asset-local anchor/artboard consistency. Example:
`m04_group.svg` has `viewBox="0 0 1856 2652"` while its visible strip images
are `1856 x 290` placed at the top and bottom of that viewBox. The Player uses
`anchor: center` on the SVG/render box, not the visual content bbox. If an SVG
root/artboard is not the same bbox that Rhino used for pose centers, coordinates
can be correct while the visual object appears shifted.

Preferred fix policy:

- Export each object SVG root/viewBox as the same tight bbox used for
  `default_width/default_height` and pose center calculations; or
- explicitly export per-asset anchor/visual bbox offsets and let the adaptor
  write them into runtime metadata.

Do not patch this in `compile-batch`; the compiler should stay a static protocol
to runtime JSON writer and should not infer geometry from arbitrary SVG content.

## 2026-08-02 Display Orientation Fix

Current policy for Rhino smallpack packages:

- CSV/adaptor object coordinates remain in Rhino/world space.
- User actions and scoring remain in world coordinates.
- The Player may apply a visual-only stage transform via `stage.display_flip_y`.
- The smallpack CSV adaptor writes `display_flip_y: true` so the reconstruction
  view uses the expected orientation: eye/viewer side at the bottom and
  furniture above, while left/right slots stay unchanged.

This is deliberately a display-layer fix. It does not rewrite `objects[].x/y`,
`objects[].rotation`, `target.relative`, movement steps, or scoring references.

### Object-local flip correction

Follow-up check showed that the room/background orientation was correct after
`display_flip_y`, and object centers plus group rotations were also correct.
The remaining visible error was that each furniture SVG was mirrored vertically
inside its own object group.

Cause:

- `display_flip_y` applies `translate(...) scale(1 -1)` to the shared SVG
  display layer.
- That layer contains the background and object layer, so world coordinates are
  displayed in the intended Rhino orientation.
- The same parent reflection also flips the local artwork of every object SVG.

Fix:

- Keep `display_flip_y` on the display layer.
- Keep CSV, adaptor, compiler output poses, movement steps, targets, and scoring
  unchanged.
- Apply a local object-visual compensation of `scale(1 -1)` when
  `stage.display_flip_y` is enabled.

Result:

- Room/background stays in the expected orientation.
- Furniture centers and compiled group rotations stay unchanged.
- Furniture artwork is no longer vertically mirrored.
- Verified with all-zero and 45-degree smallpack scenes.

Verification run:

```powershell
npx vitest run src/core/renderer.test.ts src/core/batch-compiler.test.ts src/core/config-loader.test.ts src/schemas/config.schema.test.ts tools/generator/validate-runtime-package.test.ts
npm run build
npm test
pixi run validate-runtime-package --base public\layout-task-smallpack-0802-flipy-objectfix-compiled --check-targets
```

Observed results:

- focused tests: 109 passed
- production build: passed
- full test suite: 37 files / 336 tests passed
- runtime package: 20 tasks / 80 variables / 0 failures
