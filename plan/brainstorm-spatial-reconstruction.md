# Brainstorm Note: Spatial Reconstruction Player

Date: 2026-06-16
Branch: `feature/flow-preview-reconstruct`

## Context

The pasted requirement describes a spatial reconstruction / furniture floorplan task module for a TypeScript player. The core idea is to load a shared floorplan coordinate system, render SVG furniture objects, mark some objects as variable, let participants move or rotate those variable objects, and export enough state for later scoring.

This project has already implemented a large part of that design as `Layout Task Player`.

## A. Requirement Acceptance Mapping

Implemented:

- Static task protocol with manifest, task JSON, object library, background library, behavior library, messages, and result schema.
- SVG stage based on `world.viewBox`, with background, objects, grid size, movement step, and drag behavior all using the same world units.
- Variable-like object interaction through per-object behavior config.
- Object behavior templates and object-local overrides through:
  - `behavior.template`
  - `behavior.config`
- Drag, arrow/button movement, rotation, movement limits, locked completion, and blocked-operation feedback.
- Inline SVG object rendering with selected-object shadow filter.
- `stage.fit = "contain"` for proportional screen adaptation without changing world coordinates.
- 4000x fixture task for validating very large floorplan coordinates.
- Optional flow templates:
  - `direct_reconstruction`
  - `preview_then_reconstruct`
- Preview acknowledgement modal, timed display-image preview, hidden/locked reconstruction stage, and persistent reconstruction hints.
- Encoded result export with final state, timing, display metrics, flow phase timing, and optional DataPipe upload.
- Decoder/export tools for post-experiment analysis.

Partially implemented:

- "Variable furniture" exists operationally as objects with editable behavior, but there is not yet a separate explicit `role: "fixed" | "variable"` field.
- Scoring support is indirect: results include enough state for offline scoring, but no first-class scoring config or scorer module exists yet.
- Batch task management exists through `manifest.json`, but there is not yet a dedicated stimulus/task generator CLI.
- Trial switching is dynamic through URL/manifest task loading, not pre-generated one-page-per-stimulus HTML.

Not implemented / open:

- Formal generator input protocol for upstream "scheme generation" tools.
- First-class target state / scoring reference fields.
- Built-in scoring export such as error distance, rotation error, or per-object score.
- Large-batch generation tool that creates manifest entries, task JSON, and asset references from a table.
- Explicit batch/trial metadata beyond the current manifest/task fields.

## B. Current Design Documentation Direction

The current player can be documented as a config-driven static experimental player:

1. Authoring layer:
   - `manifest.json`
   - task JSON / JS config
   - asset libraries
   - behavior templates
2. Runtime resolution layer:
   - schema validation
   - asset resolution
   - behavior template resolution and config merging
   - default injection for stage, flow, recording, and output
3. Rendering and interaction layer:
   - one SVG world coordinate system
   - background/object/grid all rendered in world units
   - screen size only affects CSS scale
   - interaction modifies object offsets/counts
4. Experiment flow layer:
   - direct reconstruction
   - preview then reconstruct
5. Result layer:
   - encoded result string
   - optional DataPipe upload
   - decoder/export scripts

Recommended docs to keep:

- `README.md` for researcher usage and config examples.
- `plan/layout-task-architecture.md` for architecture policy.
- A future protocol reference document for exact config/result interfaces.

## C. Next Development Specification Candidates

Recommended next feature group:

1. Explicit object role and scoring protocol.
   - Add `role?: "fixed" | "variable"` or `scoring.enabled`.
   - Add target/reference state fields.
   - Add scoring config for position and rotation tolerance.
   - Add offline scorer/export script.

2. Batch generator.
   - Default to a JSON batch protocol because it is easier to parse and can represent nested object, behavior, target, and asset metadata cleanly.
   - Treat CSV/Excel as optional future import adapters that convert tabular data into the canonical JSON batch protocol.
   - Generate task files and manifest entries.
   - Validate asset references and object IDs.
   - Keep output static-host friendly.

3. Protocol reference documentation.
   - Explain world units, object anchoring, behavior config, flow modes, result fields, and recommended scoring workflow.

Preferred order:

1. Protocol reference and scoring design.
2. Offline scorer.
3. Batch generator.

This order keeps the player stable while making the experimental pipeline more complete.

## Key Clarification Needed

Resolved on 2026-06-16:

- Scoring/export should preserve both relative operation counts and absolute final poses.
- Exported column names and labels must clearly distinguish the two forms.
- Analysis scripts should not force one interpretation; analysts can choose which source is appropriate for their scoring model.

Implication:

- Result payload should keep both `relative_final_state`-style fields and `absolute_final_state`-style fields, or provide decoder/export modes that emit both.
- CSV exports should use explicit names such as `relative_dx_steps`, `relative_dy_steps`, `relative_rotation_steps`, `absolute_x`, `absolute_y`, and `absolute_rotation_deg`.

## Batch Generator Direction

Resolved on 2026-06-16:

- The canonical generator input should be JSON by default.
- JSON is preferred because it is easy to parse, validates well with schema tools, and represents nested furniture/object/target/behavior structures without fragile column conventions.
- CSV/Excel can be supported later as convenience import formats, but they should normalize into the same JSON protocol before task generation.

## Rhino Integration Direction

Resolved on 2026-06-16:

- Development and automated tests should not depend on Rhino.
- v1 should still provide a complete Rhino-facing protocol kit, not just a loose example.
- The Rhino-facing kit should include field dictionaries, coordinate/unit conventions, naming rules, asset package templates, batch JSON templates, and an export checklist.
- v1 should not include Rhino Python scripts, Rhino C# scripts, Grasshopper components, or Rhino plugins.
- Tests should use self-authored mock batch JSON fixtures that simulate Rhino output.
