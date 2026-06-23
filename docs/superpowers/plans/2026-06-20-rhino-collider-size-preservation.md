# Rhino Collider Size Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Rhino collider package generation from accidentally removing explicit Rhino bbox/background dimensions when attaching collider SVGs.

**Architecture:** Keep protocol semantics unchanged: explicit JSON dimensions and SVG viewBox inference are both valid, but they must remain separate choices. `--attach-collider-svg` should only add object collider sources; `--trust-svg-viewbox` remains an explicit opt-in for datasets whose SVG viewBox is already in task-space world units. Add tests and warnings so Rhino bbox exports do not silently become SVG-viewBox-sized packages.

**Tech Stack:** TypeScript adaptor (`tsx` through Pixi), Vitest, existing batch compiler/validator, Markdown protocol docs.

---

## File Structure

- Modify `protocol/adaptor/assemble-stimuli-csv.ts`
  - Export `assemble()` for regression tests.
  - Add a small warning helper for dangerous `--trust-svg-viewbox` usage.
  - Print warnings in CLI `main()` before assembling.
- Modify `protocol/adaptor/assemble-stimuli-csv.test.ts`
  - Add end-to-end adaptor tests for preserving Rhino dimensions while attaching collider SVGs.
  - Add tests showing dimensions are stripped only when `--trust-svg-viewbox` is explicitly enabled.
  - Add tests for the warning helper.
- Modify `protocol/adaptor/assemble_protocol_batch_from_stimuli_csv.py`
  - Keep legacy Python adaptor behavior aligned by improving help text and printing the same warning.
- Modify `protocol/README.md`
  - Add a short sizing-source rule for Rhino exports.
- Modify `protocol/player-ingestion.md`
  - Add the same warning near asset sizing / collision ingestion.
- Generated verification artifact only, not committed:
  - `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_2\processing\layouttask-source-collider-preserve-size`
  - `public\layout-task-generated-sg-output-2-collider-preserve-size`

---

### Task 1: Add TypeScript Adaptor Regression Tests

**Files:**
- Modify: `protocol/adaptor/assemble-stimuli-csv.test.ts`
- Modify later in Task 2: `protocol/adaptor/assemble-stimuli-csv.ts`

- [ ] **Step 1: Write failing tests for collider attachment preserving explicit dimensions**

Add `assemble` and `sizingWarnings` to the import list:

```ts
import {
  assemble,
  attachColliderSvgToTrialObjects,
  colliderSrcForObjectSrc,
  jsonValuesEqual,
  parseArgs,
  sizingWarnings,
} from "./assemble-stimuli-csv";
```

Add this test inside `describe("assemble-stimuli-csv collider SVG adaptor helpers", () => { ... })`:

```ts
it("preserves explicit Rhino dimensions when attaching collider SVGs without trusting SVG viewBox", () => {
  const row = {
    CombinationId: "rhino_dims",
    trial_protocol_json: JSON.stringify({
      schema: "layouttask.task.v1",
      task_id: "scene_from_runner",
      qid: "Q_FROM_RUNNER",
      world: {
        viewBox: { x: 0, y: 0, width: 35000, height: 14000 },
        origin: { x: 0, y: 0 },
        grid: { size: 500, visible: true, snap: true },
      },
      background: {
        asset: "room_scene_0001_bg",
        x: 0,
        y: 0,
        width: 35000,
        height: 14000,
      },
      objects: [
        {
          id: "scene_from_runner_m01_group",
          asset: "m01_group",
          x: 31500,
          y: 10500,
          width: 3855.502,
          height: 850,
          behavior: { template: "drag500_rotate45_limited" },
        },
      ],
    }),
    object_assets_json: JSON.stringify({
      schema: "layouttask.assets.objects.v1",
      objects: {
        m01_group: {
          type: "svg",
          src: "assets/objects/m01_group.svg",
          anchor: "center",
          default_width: 3855.502,
          default_height: 850,
        },
      },
    }),
    background_assets_json: JSON.stringify({
      schema: "layouttask.assets.backgrounds.v1",
      backgrounds: {
        room_scene_0001_bg: {
          type: "svg",
          src: "assets/backgrounds/room_scene_0001_bg.svg",
        },
      },
    }),
  };

  const { batch, objectLibrary } = assemble(
    [row],
    "sg_output_2_collider",
    "SG Output 2 Collider",
    false,
    1,
    true,
    "_COLLISION",
  );

  const trial = (batch.trials as Array<Record<string, unknown>>)[0];
  expect(trial.background).toEqual({
    asset: "room_scene_0001_bg",
    x: 0,
    y: 0,
    width: 35000,
    height: 14000,
  });
  expect(objectLibrary.objects).toMatchObject({
    m01_group: {
      default_width: 3855.502,
      default_height: 850,
    },
  });
  expect((trial.objects as Array<Record<string, unknown>>)[0]).toMatchObject({
    width: 3855.502,
    height: 850,
    collision: {
      enabled: true,
      shape: "asset_outline",
      source: {
        type: "svg",
        src: "assets/collision/objects/m01_group_COLLISION.svg",
      },
    },
  });
});
```

- [ ] **Step 2: Write failing test proving viewBox stripping remains explicit opt-in**

Add this test below the previous one:

```ts
it("strips explicit dimensions only when --trust-svg-viewbox behavior is explicitly requested", () => {
  const row = {
    CombinationId: "trust_viewbox",
    trial_protocol_json: JSON.stringify({
      schema: "layouttask.task.v1",
      task_id: "scene_from_runner",
      qid: "Q_FROM_RUNNER",
      world: {
        viewBox: { x: 0, y: 0, width: 35000, height: 14000 },
        origin: { x: 0, y: 0 },
        grid: { size: 500, visible: true, snap: true },
      },
      background: {
        asset: "room_scene_0001_bg",
        x: 0,
        y: 0,
        width: 35000,
        height: 14000,
      },
      objects: [
        {
          id: "scene_from_runner_m01_group",
          asset: "m01_group",
          x: 31500,
          y: 10500,
          width: 3855.502,
          height: 850,
          behavior: { template: "drag500_rotate45_limited" },
        },
      ],
    }),
    object_assets_json: JSON.stringify({
      schema: "layouttask.assets.objects.v1",
      objects: {
        m01_group: {
          type: "svg",
          src: "assets/objects/m01_group.svg",
          anchor: "center",
          default_width: 3855.502,
          default_height: 850,
        },
      },
    }),
    background_assets_json: JSON.stringify({
      schema: "layouttask.assets.backgrounds.v1",
      backgrounds: {
        room_scene_0001_bg: {
          type: "svg",
          src: "assets/backgrounds/room_scene_0001_bg.svg",
        },
      },
    }),
  };

  const { batch, objectLibrary } = assemble(
    [row],
    "svg_viewbox_size",
    "SVG ViewBox Size",
    true,
    1,
    true,
    "_COLLISION",
  );

  const trial = (batch.trials as Array<Record<string, unknown>>)[0];
  expect(trial.background).toEqual({ asset: "room_scene_0001_bg" });
  expect(objectLibrary.objects).toMatchObject({
    m01_group: {
      type: "svg",
      src: "assets/objects/m01_group.svg",
      anchor: "center",
    },
  });
  expect(objectLibrary.objects.m01_group).not.toHaveProperty("default_width");
  expect(objectLibrary.objects.m01_group).not.toHaveProperty("default_height");
  expect((trial.objects as Array<Record<string, unknown>>)[0]).toMatchObject({
    collision: {
      enabled: true,
      shape: "asset_outline",
      source: {
        type: "svg",
        src: "assets/collision/objects/m01_group_COLLISION.svg",
      },
    },
  });
  expect((trial.objects as Array<Record<string, unknown>>)[0]).not.toHaveProperty("width");
  expect((trial.objects as Array<Record<string, unknown>>)[0]).not.toHaveProperty("height");
});
```

- [ ] **Step 3: Write failing warning helper test**

Add this test:

```ts
it("warns when collider attachment is combined with trusting SVG viewBox", () => {
  expect(sizingWarnings(parseArgs(["--attach-collider-svg"]))).toEqual([]);
  expect(sizingWarnings(parseArgs(["--trust-svg-viewbox"]))).toEqual([
    "--trust-svg-viewbox removes explicit SVG dimensions. Use it only when SVG viewBox values are already task-space world units.",
  ]);
  expect(sizingWarnings(parseArgs(["--attach-collider-svg", "--trust-svg-viewbox"]))).toEqual([
    "--trust-svg-viewbox removes explicit SVG dimensions. Use it only when SVG viewBox values are already task-space world units.",
    "--attach-collider-svg does not require --trust-svg-viewbox. Rhino bbox exports should usually attach colliders while preserving explicit dimensions.",
  ]);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run:

```powershell
npm run test -- protocol/adaptor/assemble-stimuli-csv.test.ts
```

Expected before implementation:

```text
FAIL protocol/adaptor/assemble-stimuli-csv.test.ts
assemble is not exported
sizingWarnings is not exported
```

---

### Task 2: Implement TypeScript Adaptor Safeguards

**Files:**
- Modify: `protocol/adaptor/assemble-stimuli-csv.ts`

- [ ] **Step 1: Export `assemble`**

Change the function declaration:

```ts
export function assemble(
  rows: CsvRow[],
  experimentId: string,
  title: string,
  trustSvgViewBox: boolean,
  svgViewBoxScale: number,
  attachColliderSvg: boolean,
  colliderSuffix: string,
): {
  batch: JsonObject;
  objectLibrary: JsonObject;
  backgroundLibrary: JsonObject;
  behaviorLibrary: JsonObject;
} {
```

- [ ] **Step 2: Add warning helper**

Place this helper after `parseArgs()`:

```ts
export function sizingWarnings(args: Pick<CliArgs, "trustSvgViewBox" | "attachColliderSvg">): string[] {
  const warnings: string[] = [];

  if (args.trustSvgViewBox) {
    warnings.push(
      "--trust-svg-viewbox removes explicit SVG dimensions. Use it only when SVG viewBox values are already task-space world units.",
    );
  }

  if (args.trustSvgViewBox && args.attachColliderSvg) {
    warnings.push(
      "--attach-collider-svg does not require --trust-svg-viewbox. Rhino bbox exports should usually attach colliders while preserving explicit dimensions.",
    );
  }

  return warnings;
}
```

- [ ] **Step 3: Print warnings in CLI `main()`**

After required-argument validation in `main()`, before reading the CSV, add:

```ts
    for (const warning of sizingWarnings(args)) {
      console.warn(`Warning: ${warning}`);
    }
```

The block should sit inside the `try` section, immediately before:

```ts
    const raw = await readFile(args.csv, "utf8");
```

- [ ] **Step 4: Update usage text**

Replace the `usage` constant with:

```ts
const usage = `Usage: tsx protocol/adaptor/assemble-stimuli-csv.ts --csv <file> --out <dir> --experiment-id <id> [--title <title>] [--trust-svg-viewbox] [--svg-viewbox-scale <number>] [--attach-collider-svg] [--collider-suffix <suffix>]

Notes:
  --attach-collider-svg only attaches object collider sources.
  --trust-svg-viewbox removes explicit SVG dimensions; use it only when SVG viewBox values are already task-space world units.`;
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm run test -- protocol/adaptor/assemble-stimuli-csv.test.ts
```

Expected:

```text
PASS protocol/adaptor/assemble-stimuli-csv.test.ts
```

---

### Task 3: Add Legacy Python Adaptor Warning Parity

**Files:**
- Modify: `protocol/adaptor/assemble_protocol_batch_from_stimuli_csv.py`

- [ ] **Step 1: Improve `--trust-svg-viewbox` help text**

Replace the existing help text for `--trust-svg-viewbox` with:

```py
        help=(
            "Omit SVG object/background dimensions so the Player infers absolute size from SVG viewBox. "
            "Use only when SVG viewBox values are already task-space world units."
        ),
```

- [ ] **Step 2: Add warning helper**

Place this function after `parse_args()`:

```py
def sizing_warnings(args):
    warnings = []
    if args.trust_svg_viewbox:
        warnings.append(
            "--trust-svg-viewbox removes explicit SVG dimensions. Use it only when SVG viewBox values are already task-space world units."
        )
    if args.trust_svg_viewbox and args.attach_collider_svg:
        warnings.append(
            "--attach-collider-svg does not require --trust-svg-viewbox. Rhino bbox exports should usually attach colliders while preserving explicit dimensions."
        )
    return warnings
```

- [ ] **Step 3: Print warnings in Python `main()`**

In `main()`, after:

```py
    args = parse_args()
```

add:

```py
    for warning in sizing_warnings(args):
        print(f"Warning: {warning}")
```

- [ ] **Step 4: Smoke-check Python help**

Run:

```powershell
python protocol/adaptor/assemble_protocol_batch_from_stimuli_csv.py --help
```

Expected:

```text
--trust-svg-viewbox
Use only when SVG viewBox values are already task-space world units.
```

If the local shell does not have `python`, run:

```powershell
pixi run python protocol/adaptor/assemble_protocol_batch_from_stimuli_csv.py --help
```

---

### Task 4: Document Rhino Sizing Rule

**Files:**
- Modify: `protocol/README.md`
- Modify: `protocol/player-ingestion.md`

- [ ] **Step 1: Update `protocol/README.md`**

Add this paragraph near the asset sizing / Rhino adaptor discussion:

```md
For Rhino/CAD exports, do not omit explicit dimensions unless the exported SVG
`viewBox` is already in the same task-space world units as `world.viewBox`.
The common Rhino pipeline should preserve `background.x/y/width/height` and
object `default_width/default_height` from bbox data. Collider SVG sidecars can
share the visual SVG's local viewBox, but attaching colliders does not require
trusting SVG viewBox for display size.
```

- [ ] **Step 2: Update `protocol/player-ingestion.md`**

Add this note after the existing sizing rules:

```md
Rhino/CAD packages should normally use explicit bbox-derived dimensions. Use
SVG viewBox inference only when the SVG root viewBox itself is authored in world
units. `asset_outline` collider SVGs are mapped from their own viewBox into the
object's final rendered size; they do not require removing explicit object or
background dimensions.
```

- [ ] **Step 3: Inspect docs for duplicated or contradictory wording**

Run:

```powershell
rg -n "trust-svg-viewbox|viewBox inference|default_width|asset_outline|bbox" protocol/README.md protocol/player-ingestion.md protocol/rhino.md
```

Expected:

```text
The docs consistently say Rhino bbox exports should preserve explicit dimensions unless SVG viewBox is world-unit sized.
```

---

### Task 5: Regenerate a Preserve-Size Collider Package

**Files / directories:**
- Read: `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_2\data.csv`
- Read/copy assets from: `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_2\processing\layouttask-source-collider`
- Create local processing output: `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_2\processing\layouttask-source-collider-preserve-size`
- Create browser output: `public\layout-task-generated-sg-output-2-collider-preserve-size`

- [ ] **Step 1: Create preserve-size processing directory by copying existing collider assets**

Run:

```powershell
$src = "D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_2\processing\layouttask-source-collider"
$dst = "D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_2\processing\layouttask-source-collider-preserve-size"
if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Recurse -Force }
Copy-Item -LiteralPath $src -Destination $dst -Recurse
```

Expected:

```text
The preserve-size directory exists and contains assets/backgrounds, assets/objects, assets/collision, assets/icons, and assets/images.
```

- [ ] **Step 2: Reassemble JSON without `--trust-svg-viewbox`**

Run:

```powershell
pixi run assemble-stimuli-csv `
  --csv "D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_2\data.csv" `
  --out "D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_2\processing\layouttask-source-collider-preserve-size" `
  --experiment-id sg_output_2_collider `
  --title "SG Output 2 Collider" `
  --attach-collider-svg
```

Expected:

```text
Assembled 13 trial(s) to D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_2\processing\layouttask-source-collider-preserve-size
batch.json written
assets/objects.json written
assets/backgrounds.json written
behaviors/behaviors.json written
```

- [ ] **Step 3: Check generated JSON preserves dimensions**

Run:

```powershell
@'
const fs = require("fs");
const root = "D:/PROJECTS/RhinoGH/IsPictureEnough/stimuli/sg_output_2/processing/layouttask-source-collider-preserve-size";
const batch = JSON.parse(fs.readFileSync(`${root}/batch.json`, "utf8"));
const objects = JSON.parse(fs.readFileSync(`${root}/assets/objects.json`, "utf8")).objects;
const trial = batch.trials[0];
console.log(JSON.stringify(trial.background, null, 2));
console.log(JSON.stringify(objects.m01_group, null, 2));
console.log(JSON.stringify(trial.objects[0].collision, null, 2));
'@ | node -
```

Expected:

```json
{
  "asset": "room_scene_0001_bg",
  "x": 0,
  "y": 0,
  "width": 35000,
  "height": 14000
}
```

Expected object asset includes:

```json
{
  "default_width": 3855.502,
  "default_height": 850
}
```

Expected collision includes:

```json
{
  "enabled": true,
  "shape": "asset_outline",
  "source": {
    "type": "svg",
    "src": "assets/collision/objects/m01_group_COLLISION.svg"
  }
}
```

- [ ] **Step 4: Validate the regenerated batch**

Run:

```powershell
pixi run validate-batch "D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_2\processing\layouttask-source-collider-preserve-size\batch.json"
```

Expected:

```json
{
  "valid": true,
  "experiment_id": "sg_output_2_collider",
  "trial_count": 13
}
```

- [ ] **Step 5: Compile to a new public folder**

Run:

```powershell
pixi run compile-batch `
  "D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\sg_output_2\processing\layouttask-source-collider-preserve-size\batch.json" `
  --out "public\layout-task-generated-sg-output-2-collider-preserve-size"
```

Expected:

```text
Compiled 13 task(s) to public\layout-task-generated-sg-output-2-collider-preserve-size
```

---

### Task 6: Browser Smoke Test

**Files / runtime:**
- Use local server from `pixi run serve-local`
- Browser URL:
  `http://127.0.0.1:5173/?base=/layout-task-generated-sg-output-2-collider-preserve-size/&task=scene_afa7ff5e4ecd&q=Q_scene_afa7ff5e4ecd`

- [ ] **Step 1: Start local server**

Run:

```powershell
pixi run serve-local
```

Expected:

```text
Local: http://127.0.0.1:5173/
```

If another server already occupies the port, use the existing server if it serves the current build.

- [ ] **Step 2: Open smoke URL**

Open:

```text
http://127.0.0.1:5173/?base=/layout-task-generated-sg-output-2-collider-preserve-size/&task=scene_afa7ff5e4ecd&q=Q_scene_afa7ff5e4ecd
```

Expected visual result:

- Background fills the room stage instead of appearing as a tiny top-left rectangle.
- Furniture sizes match the bbox-derived Rhino dimensions.
- Collider behavior remains enabled for objects with `asset_outline`.
- Button movement remains the default interaction mode.

---

### Task 7: Final Verification

**Files:**
- All changed files from Tasks 1-4.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm run test -- protocol/adaptor/assemble-stimuli-csv.test.ts
```

Expected:

```text
PASS protocol/adaptor/assemble-stimuli-csv.test.ts
```

- [ ] **Step 2: Run full tests**

Run:

```powershell
npm run test
```

Expected:

```text
Test Files 79 passed
Tests 676 passed
```

The exact test count may increase after new tests are added; failures must be zero.

- [ ] **Step 3: Run build**

Run:

```powershell
npm run build
```

Expected:

```text
tsc && vite build
✓ built
```

- [ ] **Step 4: Inspect git status**

Run:

```powershell
git status --short
```

Expected tracked changes:

```text
 M protocol/README.md
 M protocol/player-ingestion.md
 M protocol/adaptor/assemble-stimuli-csv.ts
 M protocol/adaptor/assemble-stimuli-csv.test.ts
 M protocol/adaptor/assemble_protocol_batch_from_stimuli_csv.py
```

Expected untracked generated directories may include:

```text
?? public/layout-task-generated-sg-output-2-collider-preserve-size/
```

Do not commit generated public/processing artifacts unless the user explicitly asks.

---

## Self-Review Checklist

- The plan does not change the protocol schema.
- The plan keeps `asset_outline` and display sizing independent.
- The plan adds regression tests for the exact bug: collider attachment must preserve Rhino bbox dimensions unless `--trust-svg-viewbox` is explicitly enabled.
- The plan updates both canonical TS adaptor and legacy Python adaptor messaging.
- The plan regenerates a new package without overwriting the existing broken package.
- The plan includes validation, build, and browser smoke verification.
