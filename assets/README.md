# Layout Task Assets

This directory is the source-of-truth asset root for Layout Task materials.

## Formal experiment compile sources

These existing folders are used by the formal experiment compile/runtime flow and
should stay isolated from tutorial-only material:

- `backgrounds/`
- `collision/`
- `objects/`

Do not put tutorial reference-board GIFs, tutorial-only SVGs, or Rhino capture
intermediate files in those folders.

## Tutorial reference board

Tutorial reference-board source assets live in:

- `tutorial-reference/models/`
- `tutorial-reference/源文件/`
- `tutorial-reference/tutorial/whole/svg/`
- `tutorial-reference/tutorial/whole/`
- `tutorial-reference/tutorial/variable/svg/`
- `tutorial-reference/tutorial/variable/`

`tutorial-reference/models/` stores the four source `.3dm` files used to
capture the current tutorial reference-board GIFs. Keep backup files such as
`.3dmbak` and capture scratch output outside this source tree.

`tutorial-reference/源文件/` stores Affinity `.af` source files for the
tutorial reference-board assets. These files are editing sources, not browser
runtime assets.

The browser cannot serve files directly from this root folder, so the active
runtime copy is kept in:

`public/experiment/layout-task/assets/tutorial-reference/`

When a tutorial reference SVG or GIF changes, update it under
`assets/tutorial-reference/` first, then sync the same relative path into the
public runtime copy.
