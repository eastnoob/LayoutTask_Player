# Object Local Flip Correction Design

## Goal

Keep the smallpack room orientation and furniture positions correct while preventing each furniture asset from being vertically mirrored by the stage display transform.

## Current Failure

`stage.display_flip_y` is applied to `displayLayer`, which contains the background, object layer, feedback, and controls. The background becomes correctly oriented, but every furniture SVG is also reflected around its own centered visual origin.

The source CSV and compiled object poses are not changed by this behavior. The bug is in renderer display composition.

## Decisions

- Keep `display_flip_y: true` for the smallpack display.
- Keep the current world coordinates, initial poses, target poses, movement steps, and rotation semantics unchanged.
- Do not modify Rhino exports, CSV data, adaptor assembly, or SVG asset files.
- Counteract the parent Y reflection only on each object visual.
- Apply the compensation around the object anchor, which is currently `center`.
- Keep object position and runtime state in world coordinates.

## Runtime Behavior

The stage transform continues to map the world scene to the intended room orientation:

```svg
translate(0 35000) scale(1 -1)
```

Each object visual receives a local compensation:

```svg
scale(1 -1)
```

The combined transform preserves the object's world placement while removing the unwanted artwork mirror. The `StateStore` pose remains unchanged, and arrow actions continue to use world-axis movement.

## Implementation Scope

Modify:

- `src/core/renderer.ts`
  - Add the local visual compensation when `config.stage.display_flip_y` is enabled.
  - Apply it to the visual wrapper containing both inline SVG and image assets.
- `src/core/renderer.test.ts`
  - Add a focused test for the object visual compensation decision.

Do not modify:

- `protocol/adaptor/assemble-stimuli-csv.ts`
- `protocol/adaptor/assemble_protocol_batch_from_stimuli_csv.py`
- CSV data or Rhino exports
- `src/core/state-store.ts`
- scoring or target-coordinate logic

## Test Requirements

The regression test must verify:

1. `display_flip_y: true` requests local object visual compensation.
2. `display_flip_y: false` does not request compensation.
3. Existing stage transform tests remain unchanged.
4. Existing runtime movement and rotation tests remain unchanged.

## Validation

Run:

```powershell
npx vitest run src/core/renderer.test.ts
npm run build
pixi run validate-runtime-package --base public\layout-task-smallpack-0802-flipy-compiled --check-targets
```

Then compile a separate comparison package:

```text
public/layout-task-smallpack-0802-flipy-objectfix-compiled
```

The baseline package `layout-task-smallpack-0802-flipy-compiled` must remain untouched.

## Acceptance Criteria

- The room remains in its current correct orientation.
- Furniture group centers remain in the same displayed positions.
- Furniture artwork is no longer vertically mirrored.
- The M05 45-degree group remains visually consistent.
- Runtime arrows still move objects along world X/Y axes.
- CSV and adaptor outputs remain byte-for-byte unaffected by this change.
