# Rhino Export Checklist

- [ ] Every trial has a unique `task_id`.
- [ ] Every trial has a unique `qid`.
- [ ] Every object ID is unique within its trial.
- [ ] `world.viewBox` covers the full reconstruction area.
- [ ] `grid.size` uses the same unit as object coordinates.
- [ ] Background SVG and background placement use the same world units.
- [ ] Object SVG assets are registered in `objects.json`.
- [ ] Background assets are registered in `backgrounds.json`.
- [ ] Variable objects have `role: "variable"`.
- [ ] Fixed objects have `role: "fixed"` or movement behavior set to `none`.
- [ ] Scored variable objects include relative and absolute targets when available.
- [ ] Run `validate-batch` before compiling.
