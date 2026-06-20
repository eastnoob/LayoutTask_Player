# Rhino Asset Package Template

Recommended folder layout:

```text
layout-task-source/
  batch.json
  assets/
    icons/
      arrow-up.svg
      ...
    display-images/
      room_generated_001.jpg
    backgrounds/
      room_generated_001.svg
    collision/
      room_generated_001_collision.svg
      objects/
        chair_a_COLLISION.svg
    objects/
      chair_a.svg
      table_a.svg
  assets/objects.json
  assets/backgrounds.json
  behaviors/behaviors.json
```

Rules:

- File names should be stable and lowercase.
- Each object SVG should be self-contained.
- Each background SVG should use the same coordinate convention declared in `world.viewBox`.
- For 1:1 Rhino/CAD SVG exports, prefer omitting object `default_width/default_height` and background `x/y/width/height`; the Player can infer them from SVG root `viewBox`.
- If explicit dimensions or placement are authored, keep them, trial `x/y/rotation`, optional `target.absolute`, `world.viewBox`, `grid.size`, and movement `step` in the same world units. Keep `target.relative` in the same step model as the movement and rotation behavior.
- Use `world.unit` for task-space coordinates. Use asset `intrinsic_unit` only to describe the SVG/image file's own internal coordinates.
- `batch.json` references library keys, not raw SVG paths, for `background.asset` and `objects[].asset`.
- Asset library `src` values are resolved from the Player `base` root. With the layout above, write `assets/objects/chair_a.svg`, not `objects/chair_a.svg`.
- `box` is the legacy object collision fallback.
- For precise object-object collision, put object collider SVGs in `assets/collision/objects/` with matching names such as `chair_a_COLLISION.svg`, then reference them with `collision.shape: "asset_outline"`.
- At runtime, `asset_outline` collider SVGs resolve to object-local `polygons`.
- Collider SVGs should share the visual object's local coordinate system and contain only filled vector solids. Supported shapes are `rect`, `polygon`, and closed `path`; curves in paths are flattened. Avoid `<image>`, `<use>`, masks, clip paths, filters, transforms, rounded rects, and stroke-only geometry.
- For an alternate standalone `base`, copy the Player UI icons into `assets/icons/` as well as the experiment assets.
