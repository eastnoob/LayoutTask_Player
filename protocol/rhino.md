# Rhino Export Dictionary

## Scope

Rhino is a producer of canonical `layouttask.batch.v1` JSON. This repository does not require Rhino for development or tests.

## Required Trial Fields

- `qid`: participant-facing or survey-facing question ID.
- `task_id`: stable unique task identifier; use lowercase letters, digits, and underscores.
- `display_image.src`: reference image path relative to `public/layout-task/`.
- `background.asset`: background library key.
- `objects[].id`: unique object ID within the trial.
- `objects[].asset`: object library key.
- `objects[].x`, `objects[].y`: initial object anchor position in world units.
- `objects[].rotation`: initial clockwise rotation in degrees.
- `objects[].role`: `fixed` or `variable`.

## Coordinate Convention

All exported coordinates must be in the same world coordinate system used by `world.viewBox`. The player does not reinterpret units. If Rhino uses millimeters, then `grid.size`, object coordinates, background size, and movement steps should all use millimeters.

## Asset Convention

Register reusable furniture SVG files in `assets/objects.json`. Register per-trial or reusable background SVG files in `assets/backgrounds.json`. Use `display_image.src` for the memory stimulus image.

## Target Convention

If scoring is needed, export both:

- `target.relative.dx_steps`, `target.relative.dy_steps`, `target.relative.rotation_steps`
- `target.absolute.x`, `target.absolute.y`, `target.absolute.rotation_deg`
