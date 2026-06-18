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
    objects/
      chair_a.svg
      table_a.svg
  libraries/
    objects.json
    backgrounds.json
```

Rules:

- File names should be stable and lowercase.
- Each object SVG should be self-contained.
- Each background SVG should use the same coordinate convention declared in `world.viewBox`.
- For 1:1 Rhino/CAD SVG exports, prefer omitting object `default_width/default_height` and background `x/y/width/height`; the Player can infer them from SVG root `viewBox`.
- If explicit dimensions or placement are authored, keep them, trial `x/y/rotation`, `target.absolute`, `world.viewBox`, `grid.size`, and movement `step` in the same world units.
- Use `world.unit` for task-space coordinates. Use asset `intrinsic_unit` only to describe the SVG/image file's own internal coordinates.
- `batch.json` references library keys, not raw SVG paths, for `background.asset` and `objects[].asset`.
- Asset library `src` values are resolved from the Player `base` root. With the layout above, write `assets/objects/chair_a.svg`, not `objects/chair_a.svg`.
- For an alternate standalone `base`, copy the Player UI icons into `assets/icons/` as well as the experiment assets.
