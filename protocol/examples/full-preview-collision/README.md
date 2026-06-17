# Full Preview Collision Example

This package shows one complete generated trial:

1. preview a reference `display_image`
2. hide the reconstruction stage during preview
3. show a button-controlled reconstruction scene
4. enforce object, wall, and blocked-area collision
5. preserve target/scoring metadata for analysis

In `batch.json`, `chair_01.x/y/rotation` are the reconstruction initial pose. `chair_01.target.absolute` is the correct stimulus pose, and `chair_01.target.relative` is the signed step delta from the initial pose to that target.

Validate it:

```bash
pixi run validate-batch protocol/examples/full-preview-collision/batch.json
```

Compile it to task JSON:

```bash
pixi run compile-batch protocol/examples/full-preview-collision/batch.json --out public/layout-task-generated
```

For a standalone deployed base, copy this package's `assets/` directory, the compiled files, the Player `behaviors/` directory, and Player UI icons under `assets/icons/`.
