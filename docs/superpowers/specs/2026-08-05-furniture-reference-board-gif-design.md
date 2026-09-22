# Furniture Reference Board Design

## Goal

Make the first tutorial page a compact reference board for the four real furniture stimuli in `group_instance_semantic_replaced_20260724`. Each card shows two independently looping rendered 3D GIFs and one full relation SVG.

## Stimuli

- `Armchairs and Coffee Table` (`m01`)
- `Dining Table and Chairs` (`m03`)
- `Bookcase` (`m04`)
- `Sofa and Coffee Table` (`m05`)

Internal IDs remain only as data and CSS hooks. They are never shown to participants.

## Card Layout

- Two-column grid with four equal cards.
- Card title uses the natural-language furniture name.
- Left media: `All Furniture` GIF, captured with `GROUP + VARIABLE + GEOMETRY` visible.
- Right media: `Movable Item` GIF, captured with `VARIABLE + GEOMETRY` visible.
- Relation SVG below the two GIFs shows the complete arrangement.
- The board remains the first tutorial screen and fits in the initial viewport.

## Capture

Use a fresh Rhino process and a copied working model for every capture. Never save source `.3dm` files. Use `Rendered` mode, eight horizontal yaw angles (`-90, -45, 0, 45, 90, 135, 180, 225`), `640x480` frames, and `700 ms` GIF delay with infinite looping.

## Assets

Each stimulus has two assets under `public/experiment/layout-task/assets/tutorial-reference/`:

```text
m01_all_spin.gif         m01_variable_spin.gif
m03_all_spin.gif         m03_variable_spin.gif
m04_all_spin.gif         m04_variable_spin.gif
m05_all_spin.gif         m05_variable_spin.gif
```

## Verification

- Schema accepts exactly four named items with both animation paths.
- Board helper renders four cards, eight GIF images, and four relation SVGs.
- Browser shows English titles, no visible `M01`-style numbering, and no clipped relation panels.
- Full tests and production build pass.
