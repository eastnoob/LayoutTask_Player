# Rhino Export Checklist

- [ ] Every trial has a unique `task_id`.
- [ ] Every trial has a unique `qid`.
- [ ] Every object ID is unique within its trial.
- [ ] `world.viewBox` covers the full reconstruction area.
- [ ] `grid.size` uses the same unit as object coordinates.
- [ ] Background SVG and background placement use the same world units.
- [ ] Collision `contain` and `block` geometry uses the same world units as `world.viewBox`.
- [ ] Collision SVG analysis layers contain only marked `rect` and `polygon` elements.
- [ ] Collision SVG analysis layers do not use arbitrary paths, masks, raster images, or unmarked artwork.
- [ ] Concave or complex rooms are split into convex rects/polygons before export.
- [ ] Object SVG assets are registered in `objects.json`.
- [ ] Background assets are registered in `backgrounds.json`.
- [ ] Variable objects have `role: "variable"`.
- [ ] Fixed context objects have `role: "fixed"` or movement behavior set to `none`.
- [ ] For every variable object, `x`, `y`, and `rotation` are the reconstruction initial pose, not the stimulus-correct pose.
- [ ] For every scored variable object, `target.absolute` stores the correct stimulus pose.
- [ ] For every step-based scored variable object, `target.relative` stores signed steps from the initial pose to `target.absolute`.
- [ ] Run `validate-batch` before compiling.
