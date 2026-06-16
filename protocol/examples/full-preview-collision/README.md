# Full Preview Collision Example

This package shows one complete generated trial:

1. preview a reference `display_image`
2. hide the reconstruction stage during preview
3. show a button-controlled reconstruction scene
4. enforce object, wall, and blocked-area collision
5. preserve target/scoring metadata for analysis

Validate it:

```bash
pixi run validate-batch protocol/examples/full-preview-collision/batch.json
```

Compile it to task JSON:

```bash
pixi run compile-batch protocol/examples/full-preview-collision/batch.json --out public/layout-task-generated
```

For a standalone deployed base, copy this package's `assets/` directory, the compiled files, the Player `behaviors/` directory, and Player UI icons under `assets/icons/`.
