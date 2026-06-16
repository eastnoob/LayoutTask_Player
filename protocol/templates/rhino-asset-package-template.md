# Rhino Asset Package Template

Recommended folder layout:

```text
layout-task-source/
  batch.json
  assets/
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
- `batch.json` references library keys, not raw SVG paths, for `background.asset` and `objects[].asset`.
