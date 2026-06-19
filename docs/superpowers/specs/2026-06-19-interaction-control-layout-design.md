# Interaction Control Layout Design

## Goal

Improve the global object interaction behavior for layout tasks so context objects do not interfere with variable objects, and object controls remain easy to use across differently sized assets and stage-edge positions.

This is a player-level interaction change. It does not change the Rhino export contract, protocol schema, adaptor output, scoring format, or collision model.

## Problems

1. Context/fixed objects can currently receive selection affordances, which can block or confuse selection of variable objects.
2. Movement and rotation controls use a fixed world-space offset, so controls can appear too far from small furniture.
3. When an object is near the stage edge, control buttons can be positioned outside the SVG viewBox and become clipped or unreachable.

## Design

### Interactive Object Rule

An object is interactive only when its configured behavior exposes at least one user action:

- button movement is enabled
- drag movement is enabled
- rotation has a configured step

Objects without any of those actions are treated as static context. Static context objects:

- remain visible
- remain part of layout, stage fitting, and collision checks
- do not receive `tabindex`, button roles, selection click handlers, keyboard selection handlers, hover highlights, focus highlights, drag handlers, or active controls
- cannot be selected through `InteractionController.selectObject`

This uses behavior as the source of truth. Protocol labels such as `fixed`, `context`, or `variable` can still help humans understand the scene, but the player decides interactivity from available actions.

### Control Placement

Controls stay in the existing SVG controls layer, but their positions become size-aware.

The renderer computes each object's visual bounds after asset placement and rotation. It then derives control gaps from the object's rendered size:

- `shortSide = min(bounds.width, bounds.height)`
- movement gap scales with `shortSide`
- rotation gap scales with `shortSide` and is slightly larger than movement gap
- both gaps are clamped to visual pixel thresholds converted to world units through the current stage UI scale

This keeps controls close enough for small furniture while preserving comfortable spacing for larger objects.

### Stage-Edge Clamping

Each control button center is clamped inside `world.viewBox` with enough padding for the control radius and a small visual margin.

If an object is near the right, left, top, bottom, or a corner edge, the relevant controls slide inward rather than leaving the visible SVG region. This preserves clickability without changing object coordinates or stage geometry.

The controls layer already renders after object layers, so the primary issue is viewBox clipping rather than stacking. The implementation should keep controls in the existing layer for this change.

## Architecture

### Renderer

`src/core/renderer.ts` owns DOM affordances and control layout.

Add small pure helpers near the existing exported renderer geometry helpers:

- `isObjectInteractive(objectConfig)`
- `getObjectControlLayout(...)`
- `clampControlPoint(...)`

The renderer will use `isObjectInteractive` while creating object groups. It will only attach interaction affordances to interactive objects.

`updateControlsLayout` will call `getObjectControlLayout` instead of applying the fixed `ui.controlGap` directly.

### Interaction Controller

`src/core/interaction-controller.ts` should gate `selectObject` with the same interactivity rule. This protects keyboard paths, programmatic calls, and future renderer changes.

Action and drag requests already pass through store-level gates. Those gates remain unchanged.

### State Store

`src/core/state-store.ts` does not need behavioral changes for this feature. It already controls whether concrete actions are allowed.

## Data Flow

1. Runtime config loads object behavior as it does today.
2. Renderer creates object DOM groups.
3. For each object, renderer checks `isObjectInteractive`.
4. Static context objects render as passive visuals.
5. Interactive objects get selection affordances and can activate controls.
6. On activation, renderer computes visual bounds and size-aware controls.
7. Control centers are clamped to the stage viewBox before being applied to DOM elements.

## Error Handling

If object bounds cannot be computed, the renderer should fall back to the configured local rect and existing UI scale. The UI should remain usable rather than throwing.

If `world.viewBox` is missing or invalid, the layout helper should skip clamping and return unclamped control positions. Current valid task configs already provide a viewBox.

## Testing

Add focused tests for pure logic and controller behavior:

- `isObjectInteractive` returns false for no movement and no rotation.
- `isObjectInteractive` returns true for button movement, drag movement, or rotation step.
- Control gap is smaller for small objects than the legacy fixed global gap, but stays above a visual minimum.
- Rotation controls are placed farther than movement controls.
- Controls near a viewBox edge are clamped inside the visible stage.
- Controls away from edges keep their expected side/corner placement.
- `InteractionController.selectObject` ignores static context objects.
- Variable objects remain selectable.

Regression checks:

- `npm run test`
- `npm run build`

Manual check when the local preview is available:

- Open the self-contained generated package.
- Confirm fixed/context objects are not selectable.
- Confirm small-object arrows are closer.
- Confirm edge controls remain visible and clickable.

## Non-Goals

- No protocol field changes.
- No Rhino adaptor changes.
- No scoring changes.
- No collision rule changes.
- No HTML overlay controls in this iteration.

## Acceptance Criteria

- Static context objects cannot steal selection from variable objects.
- Existing variable movement and rotation behavior remains unchanged.
- Controls are visually tied to object size instead of a single fixed offset.
- Controls remain reachable near all stage edges.
- The change applies globally to all task packages.
