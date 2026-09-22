# Furniture Reference Board Implementation Plan

- [x] Replace the reference-board item contract with `name`, `allAnimation`, `variableAnimation`, and `relationSvg`.
- [x] Restrict the configured board to the four real stimuli: `m01`, `m03`, `m04`, and `m05`.
- [x] Render natural-language titles and two independent GIF panes per card.
- [x] Keep the full relation SVG below the GIF panes and compact the 2x2 board to the first viewport.
- [x] Add Rhino capture mode selection for `all` or `variable`, always including `GEOMETRY`.
- [x] Capture eight rendered frames per mode from copied working models and compose eight looping GIFs.
- [x] Verify targeted tests, browser output, asset dimensions, layer counts, and production build.

## Capture Source

Source models are read from:

`D:\PROJECTS\RhinoGH\IsPictureEnoughPurify\stimuli\funitures\group_instance_semantic_replaced_20260724`

Working copies and generated review frames are kept outside the Player source tree. The Player only receives the final GIFs and relation SVGs under `public/experiment/layout-task/assets/tutorial-reference/`.
