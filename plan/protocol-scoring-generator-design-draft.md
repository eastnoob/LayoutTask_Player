# Protocol, Scoring, and Batch Generator Design Draft

Date: 2026-06-16
Status: Implemented on branch `feature/protocol-scoring-generator`
Implementation plan: `docs/superpowers/plans/2026-06-16-protocol-scoring-generator.md`
Branch: `feature/protocol-scoring-generator`

## 1. Purpose

This document proposes the next design layer for Layout Task Player:

- a language-neutral protocol kit for external stimulus generators such as Rhino;
- a Rhino-facing protocol kit with complete field dictionaries, naming conventions, asset package templates, and export checklists, but no Rhino scripts in v1;
- a canonical JSON batch protocol for generating many task files;
- a light parser/compiler pipeline that converts batch JSON into the current runtime `manifest.json + tasks/*.json`;
- a scoring/export model that preserves both relative operation counts and absolute final poses.

The key goal is to keep the browser player simple and static while moving batch expansion, validation, and scoring references into offline tooling.

## 2. Current Baseline

Already implemented:

- `manifest.json` driven task loading;
- task-level `world`, `background`, `objects`, `behavior`, `flow`, `stage`, `display_image`, and `data_save`;
- object behavior templates with `behavior.template` and `behavior.config`;
- world-unit rendering and `stage.fit = "contain"`;
- SVG object rendering, selection highlight, drag/button/rotation interaction;
- `direct_reconstruction` and `preview_then_reconstruct` flow modes;
- encoded result export, decoder tools, and optional DataPipe upload.

Open design areas:

- explicit object role semantics, such as `fixed` and `variable`;
- target/reference state for scoring;
- CSV export columns that clearly distinguish relative and absolute values;
- batch generation from an upstream source such as Rhino;
- protocol documentation that external tools can follow without importing TypeScript;
- Rhino-facing dictionaries/templates that are complete enough for a Rhino-side exporter to be written later, while this project tests the protocol with self-authored mock batch JSON fixtures.

## 3. Design Decisions So Far

### 3.1 Canonical Data Format

The canonical external format should be standard JSON.

JSON5 should not be the default protocol because this project benefits more from strict parsing, schema validation, and broad tool compatibility than from handwritten convenience features such as comments and trailing commas.

Optional future import adapters may accept CSV, Excel, or JSON5, but they should normalize into canonical JSON before validation and compilation.

### 3.2 Scoring Source Data

The result/export layer should preserve both:

- relative operation counts;
- absolute final world poses.

The player and compiler should not force one scoring interpretation. Analysts can choose the source that best matches a study.

Column labels must be explicit, for example:

- `relative_dx_steps`
- `relative_dy_steps`
- `relative_rotation_steps`
- `absolute_x`
- `absolute_y`
- `absolute_rotation_deg`

### 3.3 Rhino Integration

Rhino should not manually generate player task files field by field.

Development should also not depend on Rhino being installed or available. In v1, Rhino is treated as a future producer of valid batch JSON, not as a runtime or test dependency.

Recommended relationship:

```text
Rhino / Grasshopper / Rhino Python / Rhino C#
  -> emits canonical batch JSON
  -> protocol schema validates it
  -> Layout Task compiler generates runtime tasks and manifest
  -> Player runs static tasks
  -> decoder/export/scorer emits analysis tables
```

This avoids coupling Rhino directly to every runtime detail.

The Rhino-facing deliverable should be documentation and data-contract assets, not scripts:

- field dictionary for every Rhino-relevant batch field;
- coordinate/unit convention guide;
- object naming and ID convention guide;
- asset package layout template;
- background/display-image/object SVG registration template;
- export checklist for verifying that Rhino output is compiler-ready.

No Rhino Python, Rhino C#, Grasshopper component, or Rhino plugin should be required for the first implementation.

Automated tests should use self-authored mock batch JSON fixtures that simulate Rhino output.

## 4. Protocol Kit

The protocol kit is a small set of files maintained in this TypeScript project, but usable from any language.

Suggested structure:

```text
protocol/
  README.md
  rhino.md
  schemas/
    layouttask.batch.schema.json
    layouttask.task.schema.json
    layouttask.result.schema.json
  examples/
    minimal-batch.json
    scoring-example.json
  templates/
    rhino-batch-template.json
    rhino-asset-package-template.md
    rhino-export-checklist.md

src/types/
  batch.ts
  config.ts
  result.ts

src/protocol/
  constants.ts
```

Responsibilities:

- JSON Schema is the language-neutral validation contract.
- TypeScript types are the internal development contract.
- Constants define controlled vocabularies used by schemas, compiler, and docs.
- Examples prove the protocol with small self-authored fixtures.
- Rhino templates and dictionaries define what a future Rhino-side exporter must emit, without adding Rhino as a test or runtime dependency.

Rhino-facing files:

```text
protocol/rhino.md
  Human-readable field dictionary and conventions for Rhino exporters.

protocol/templates/rhino-batch-template.json
  A fill-in JSON template showing the expected shape of Rhino output.

protocol/templates/rhino-asset-package-template.md
  Folder layout and naming rules for display images, background SVGs, and furniture SVGs.

protocol/templates/rhino-export-checklist.md
  Pre-compile checklist for units, origins, IDs, asset paths, roles, and targets.
```

Controlled vocabularies:

```ts
export const OBJECT_ROLES = ["fixed", "variable"] as const;
export const ANCHORS = ["center", "top_left"] as const;
export const MOVEMENT_MODES = ["none", "button", "drag"] as const;
export const FLOW_MODES = ["direct_reconstruction", "preview_then_reconstruct"] as const;
export const PREVIEW_STAGE_MODES = ["hidden", "locked"] as const;
export const STAGE_FITS = ["contain"] as const;
```

## 5. Batch JSON Protocol

Batch JSON is an authoring-side protocol. It is allowed to be more convenient than runtime task JSON, but it must compile into the existing runtime files.

Draft TypeScript shape:

```ts
export interface BatchConfig {
  schema: "layouttask.batch.v1";
  experiment_id: string;
  title?: string;
  config_version?: string;
  output_dir?: string;
  shared: BatchSharedConfig;
  trials: BatchTrialConfig[];
}

export interface BatchSharedConfig {
  asset_library?: string;
  background_library?: string;
  behavior_library?: string;
  world?: WorldConfig;
  stage?: StageConfig;
  completion?: CompletionConfig;
  recording?: RecordingConfig;
  output?: OutputConfig;
  data_save?: DataSaveConfig;
  flow?: FlowConfig;
  messages?: MessagesConfig;
  requirements?: RequirementsConfig;
}

export interface BatchTrialConfig {
  qid: string;
  task_id: string;
  title?: string;
  display_image?: DisplayImageConfig;
  world?: WorldConfig;
  background: TaskBackgroundConfig;
  objects: BatchObjectConfig[];
  flow?: FlowConfig;
  stage?: StageConfig;
  scoring?: ScoringConfig;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface BatchObjectConfig extends TaskObjectConfig {
  role?: "fixed" | "variable";
  group_id?: string;
  initial_state_label?: string;
  target?: ObjectTargetState;
  scoring?: ObjectScoringConfig;
}
```

Notes:

- `shared` reduces repetition across thousands of trials.
- Trial-level fields override `shared`.
- Object-level `target` and `scoring` are authoring/scoring data. They do not need to be fully exposed to the player UI.
- The compiler can emit target/scoring references into a separate scoring file or embed safe metadata in task files, depending on privacy and deployment needs.

## 6. Scoring Protocol

Scoring should support both relative and absolute references.

Draft TypeScript shape:

```ts
export interface ScoringConfig {
  enabled?: boolean;
  include_objects?: string[];
  default_tolerance?: ScoringTolerance;
  objects?: Record<string, ObjectScoringConfig>;
}

export interface ObjectTargetState {
  relative?: RelativeTargetState;
  absolute?: AbsoluteTargetState;
}

export interface RelativeTargetState {
  dx_steps: number;
  dy_steps: number;
  rotation_steps: number;
}

export interface AbsoluteTargetState {
  x: number;
  y: number;
  rotation_deg: number;
}

export interface ObjectScoringConfig {
  enabled?: boolean;
  target?: ObjectTargetState;
  tolerance?: ScoringTolerance;
  labels?: Record<string, string>;
}

export interface ScoringTolerance {
  dx_steps?: number;
  dy_steps?: number;
  rotation_steps?: number;
  distance_world?: number;
  x_world?: number;
  y_world?: number;
  rotation_deg?: number;
}
```

Recommended scoring output columns:

```text
experiment_id
task_id
qid
session
object_id
object_role
object_group_id

relative_dx_steps
relative_dy_steps
relative_rotation_steps
target_relative_dx_steps
target_relative_dy_steps
target_relative_rotation_steps
error_relative_dx_steps
error_relative_dy_steps
error_relative_rotation_steps

absolute_x
absolute_y
absolute_rotation_deg
target_absolute_x
target_absolute_y
target_absolute_rotation_deg
error_absolute_x
error_absolute_y
error_absolute_distance
error_absolute_rotation_deg
```

The scorer can calculate errors when targets are present. If no target is present, export still includes observed relative/absolute values and leaves target/error fields blank.

## 7. Compiler / Parser Pipeline

The compiler pipeline is intentionally small:

```text
batch.json
  -> parse JSON
  -> validate with layouttask.batch.schema.json
  -> normalize defaults and shared values
  -> resolve asset/background/behavior references
  -> compile each trial to runtime TaskConfig
  -> write tasks/*.json
  -> write manifest.json
  -> write scoring-reference.json
  -> write generation-report.json
```

Suggested commands:

```text
pixi run npm exec tsx tools/generator/validate-batch.ts --input batch.json
pixi run npm exec tsx tools/generator/compile-batch.ts --input batch.json --out public/layout-task
pixi run npm exec tsx tools/scoring/export-scored-trials.ts --results results.txt --scoring scoring-reference.json --out scored.csv
```

Compiler outputs:

```text
public/layout-task/
  manifest.json
  tasks/
    generated_trial_001.json
    generated_trial_002.json
  scoring/
    scoring-reference.json
  generation-report.json
```

Runtime player continues to load only `manifest.json` and task files.

Development fixtures:

```text
protocol/examples/minimal-batch.json
protocol/examples/scoring-example.json
src/test-support/batch-config.ts
```

These fixtures should be hand-authored inside this repository. They simulate the shape of Rhino output, but they do not require Rhino.

## 8. Minimal Batch JSON Example

```json
{
  "schema": "layouttask.batch.v1",
  "experiment_id": "floorplan_coherence_v1",
  "title": "Furniture reconstruction batch",
  "shared": {
    "asset_library": "assets/objects.json",
    "background_library": "assets/backgrounds.json",
    "behavior_library": "behaviors/behaviors.json",
    "world": {
      "viewBox": { "x": -500, "y": -500, "width": 1000, "height": 1000 },
      "origin": { "x": 0, "y": 0 },
      "grid": {
        "size": 25,
        "visible": true,
        "snap": true,
        "origin": { "x": 0, "y": 0 }
      }
    },
    "stage": {
      "fit": "contain",
      "max_height_ratio": 0.72,
      "padding": 16
    },
    "flow": {
      "mode": "direct_reconstruction"
    }
  },
  "trials": [
    {
      "qid": "Q001",
      "task_id": "room_generated_001",
      "display_image": {
        "enabled": true,
        "src": "assets/display-images/room_001.jpeg",
        "alt": "Room memory stimulus"
      },
      "background": {
        "asset": "room01_bg",
        "x": -400,
        "y": -300,
        "width": 800,
        "height": 600
      },
      "objects": [
        {
          "id": "sofa_fixed_01",
          "role": "fixed",
          "asset": "table_a",
          "x": -100,
          "y": 50,
          "rotation": 0,
          "behavior": {
            "config": {
              "movement": { "mode": "none" },
              "free_drag": { "enabled": false }
            }
          }
        },
        {
          "id": "chair_variable_01",
          "role": "variable",
          "group_id": "chairs",
          "asset": "chair_a",
          "x": 100,
          "y": 150,
          "rotation": 0,
          "behavior": {
            "template": "drag25_rotate45_limited"
          },
          "target": {
            "relative": {
              "dx_steps": 1,
              "dy_steps": -2,
              "rotation_steps": 1
            },
            "absolute": {
              "x": 125,
              "y": 100,
              "rotation_deg": 45
            }
          },
          "scoring": {
            "enabled": true,
            "tolerance": {
              "dx_steps": 0,
              "dy_steps": 0,
              "rotation_steps": 0,
              "distance_world": 12.5,
              "rotation_deg": 5
            }
          }
        }
      ],
      "metadata": {
        "source": "rhino",
        "condition": "A"
      }
    }
  ]
}
```

## 9. Generated Runtime Task Shape

The compiler should emit regular `layouttask.task.v1` files that the current player can already load.

Example generated task excerpt:

```json
{
  "schema": "layouttask.task.v1",
  "task_id": "room_generated_001",
  "qid": "Q001",
  "world": {
    "viewBox": { "x": -500, "y": -500, "width": 1000, "height": 1000 },
    "origin": { "x": 0, "y": 0 },
    "grid": { "size": 25, "visible": true, "snap": true, "origin": { "x": 0, "y": 0 } }
  },
  "background": {
    "asset": "room01_bg",
    "x": -400,
    "y": -300,
    "width": 800,
    "height": 600
  },
  "objects": [
    {
      "id": "sofa_fixed_01",
      "asset": "table_a",
      "x": -100,
      "y": 50,
      "rotation": 0,
      "behavior": {
        "config": {
          "movement": { "mode": "none" },
          "free_drag": { "enabled": false }
        }
      }
    },
    {
      "id": "chair_variable_01",
      "asset": "chair_a",
      "x": 100,
      "y": 150,
      "rotation": 0,
      "behavior": {
        "template": "drag25_rotate45_limited"
      }
    }
  ],
  "display_image": {
    "enabled": true,
    "src": "assets/display-images/room_001.jpeg",
    "alt": "Room memory stimulus"
  },
  "flow": {
    "mode": "direct_reconstruction"
  }
}
```

Target/scoring data can be emitted separately:

```json
{
  "schema": "layouttask.scoring-reference.v1",
  "experiment_id": "floorplan_coherence_v1",
  "tasks": {
    "room_generated_001": {
      "objects": {
        "chair_variable_01": {
          "role": "variable",
          "group_id": "chairs",
          "target": {
            "relative": { "dx_steps": 1, "dy_steps": -2, "rotation_steps": 1 },
            "absolute": { "x": 125, "y": 100, "rotation_deg": 45 }
          },
          "tolerance": {
            "dx_steps": 0,
            "dy_steps": 0,
            "rotation_steps": 0,
            "distance_world": 12.5,
            "rotation_deg": 5
          }
        }
      }
    }
  }
}
```

## Static Deployment Interruption Recovery

Static deployment does not prevent local recovery. A follow-up player feature should use localStorage autosave keyed by experiment, task, qid, and session. Submit confirmation prevents accidental final submission; autosave/restore prevents losing progress after refresh, crash, or black screen.

For `preview_then_reconstruct`, recommended recovery policy is:

- if preview did not finish, restarting preview is allowed;
- if reconstruction already started, restore reconstruction state and do not show the reference image again;
- final result records restore metadata.

## 10. Open Questions

1. Should `role: "fixed" | "variable"` be added to runtime task objects, or remain only in batch/scoring metadata?
2. Should scoring targets be shipped with public task files, or kept in a separate private scoring reference file?
3. Should the compiler overwrite `public/layout-task/manifest.json`, or write into a separate generated directory first?
4. Does Rhino export object positions in the same world coordinate system as the player, or should the compiler support a coordinate transform block?
5. Should the first generator support only JSON, or also include a CSV adapter immediately?

## 11. Recommendation

First implementation scope:

1. Add protocol kit files:
   - batch TypeScript types;
   - batch JSON schema;
   - protocol docs;
   - self-authored examples;
   - Rhino field dictionary and templates.
2. Add `validate-batch` and `compile-batch` tools.
3. Add `scoring-reference.json` generation.
4. Add decoder/export support that emits both relative and absolute object rows with explicit labels.
5. Add tests based on mock batch JSON fixtures, not Rhino.

Defer:

- CSV/Excel import;
- JSON5 support;
- Rhino scripts, Rhino-specific SDK, Grasshopper components, or Rhino plugins;
- browser-side scoring UI.
