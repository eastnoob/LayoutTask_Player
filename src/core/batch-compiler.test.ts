import { describe, expect, it } from "vitest";
import { compileBatch } from "./batch-compiler";
import type { BatchConfig } from "../types/batch";

const sharedWorld = {
  viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
  origin: { x: 0, y: 0 },
  grid: { size: 25, visible: true, snap: true },
};

const createBatch = (): BatchConfig => ({
  schema: "layouttask.batch.v1",
  experiment_id: "floorplan_coherence_v1",
  title: "Generated batch",
  config_version: "2026-06-16",
  shared: {
    asset_library: "assets/objects.json",
    background_library: "assets/backgrounds.json",
    behavior_library: "behaviors/behaviors.json",
    world: sharedWorld,
    completion: { double_confirm: false },
    recording: { record_events: false },
    output: { encoding: "plain-json" },
    data_save: { mode: "copy" },
    flow: { mode: "direct_reconstruction" },
    stage: { fit: "contain", max_height_ratio: 0.72, padding: 16 },
    messages: { status_ready: "Ready." },
    requirements: { min_viewport: { width: 800, height: 600 } },
  },
  trials: [
    {
      qid: "Q001",
      task_id: "room_generated_001",
      background: { asset: "room01_bg", x: -400, y: -300, width: 800, height: 600 },
      objects: [
        {
          id: "chair_variable_01",
          role: "variable",
          group_id: "chairs",
          initial_state_label: "chair initial",
          asset: "chair_a",
          x: 100,
          y: 150,
          rotation: 0,
          behavior: { template: "drag25_rotate45_limited" },
          target: {
            relative: { dx_steps: 1, dy_steps: -2, rotation_steps: 1 },
            absolute: { x: 125, y: 100, rotation_deg: 45 },
          },
          scoring: {
            enabled: true,
            tolerance: { distance_world: 12.5, rotation_deg: 5 },
            labels: { item: "chair" },
          },
        },
        {
          id: "rug_unannotated_01",
          asset: "table_a",
          x: -200,
          y: -100,
          rotation: 0,
          behavior: { config: { movement: { mode: "none" }, free_drag: { enabled: false } } },
        },
      ],
      metadata: { condition: "A" },
    },
  ],
});

describe("compileBatch", () => {
  it("creates a manifest entry and runtime task file", () => {
    const compiled = compileBatch(createBatch());

    expect(compiled.manifest).toEqual({
      schema: "layouttask.manifest.v1",
      experiment_id: "floorplan_coherence_v1",
      title: "Generated batch",
      config_version: "2026-06-16",
      asset_library: "assets/objects.json",
      background_library: "assets/backgrounds.json",
      behavior_library: "behaviors/behaviors.json",
      tasks: [{ qid: "Q001", task_id: "room_generated_001", file: "tasks/room_generated_001.json" }],
    });
    expect(compiled.tasks).toHaveLength(1);
    expect(compiled.tasks[0]).toMatchObject({
      file: "tasks/room_generated_001.json",
      config: {
        schema: "layouttask.task.v1",
        qid: "Q001",
        task_id: "room_generated_001",
        world: sharedWorld,
        background: { asset: "room01_bg", x: -400, y: -300, width: 800, height: 600 },
      },
    });
  });

  it("strips authoring-only fields from runtime task objects", () => {
    const runtimeObject = compileBatch(createBatch()).tasks[0].config.objects[0] as unknown as Record<
      string,
      unknown
    >;

    expect(runtimeObject).toEqual({
      id: "chair_variable_01",
      asset: "chair_a",
      x: 100,
      y: 150,
      rotation: 0,
      behavior: { template: "drag25_rotate45_limited" },
    });
    expect(runtimeObject).not.toHaveProperty("role");
    expect(runtimeObject).not.toHaveProperty("group_id");
    expect(runtimeObject).not.toHaveProperty("target");
    expect(runtimeObject).not.toHaveProperty("scoring");
    expect(runtimeObject).not.toHaveProperty("initial_state_label");
  });

  it("emits private scoring references with role, group_id, target, tolerance, and labels", () => {
    const compiled = compileBatch(createBatch());

    expect(compiled.scoringReference).toEqual({
      schema: "layouttask.scoring-reference.v1",
      experiment_id: "floorplan_coherence_v1",
      tasks: {
        room_generated_001: {
          qid: "Q001",
          metadata: { condition: "A" },
          objects: {
            chair_variable_01: {
              role: "variable",
              group_id: "chairs",
              target: {
                relative: { dx_steps: 1, dy_steps: -2, rotation_steps: 1 },
                absolute: { x: 125, y: 100, rotation_deg: 45 },
              },
              tolerance: { distance_world: 12.5, rotation_deg: 5 },
              labels: { item: "chair" },
            },
          },
        },
      },
    });
  });

  it("inherits shared config into each task", () => {
    const task = compileBatch(createBatch()).tasks[0].config;

    expect(task.completion).toEqual({ double_confirm: false });
    expect(task.recording).toEqual({ record_events: false });
    expect(task.output).toEqual({ encoding: "plain-json" });
    expect(task.data_save).toEqual({ mode: "copy" });
    expect(task.flow).toEqual({ mode: "direct_reconstruction" });
    expect(task.stage).toEqual({ fit: "contain", max_height_ratio: 0.72, padding: 16 });
    expect(task.messages).toEqual({ status_ready: "Ready." });
    expect(task.requirements).toEqual({ min_viewport: { width: 800, height: 600 } });
    expect(task.display_image).toBeUndefined();
  });

  it("lets trial-level config override shared config for world, flow, and stage", () => {
    const batch = createBatch();
    batch.trials[0].world = {
      viewBox: { x: 0, y: 0, width: 400, height: 300 },
      origin: { x: 10, y: 20 },
      grid: { size: 10, visible: false, snap: false },
    };
    batch.trials[0].flow = { mode: "preview_then_reconstruct", config: { preview_duration_sec: 3 } };
    batch.trials[0].stage = { fit: "contain", max_height_ratio: 0.5, padding: 4 };
    batch.trials[0].display_image = { src: "assets/display-images/room01.jpeg" };

    const task = compileBatch(batch).tasks[0].config;

    expect(task.world).toEqual(batch.trials[0].world);
    expect(task.flow).toEqual({ mode: "preview_then_reconstruct", config: { preview_duration_sec: 3 } });
    expect(task.stage).toEqual({ fit: "contain", max_height_ratio: 0.5, padding: 4 });
    expect(task.display_image).toEqual({ src: "assets/display-images/room01.jpeg" });
  });

  it("applies trial scoring default tolerance when an object has a reference but no object tolerance", () => {
    const batch = createBatch();
    delete batch.trials[0].objects[0].scoring;
    batch.trials[0].scoring = {
      default_tolerance: { distance_world: 25, rotation_deg: 10 },
    };

    const objectReference =
      compileBatch(batch).scoringReference.tasks.room_generated_001.objects.chair_variable_01;

    expect(objectReference.tolerance).toEqual({ distance_world: 25, rotation_deg: 10 });
  });

  it("includes manifest, tasks, scoring reference, and generation report in generated_files", () => {
    const report = compileBatch(createBatch()).report;

    expect(report).toEqual({
      schema: "layouttask.generation-report.v1",
      experiment_id: "floorplan_coherence_v1",
      task_count: 1,
      generated_files: [
        "manifest.json",
        "tasks/room_generated_001.json",
        "scoring/scoring-reference.json",
        "generation-report.json",
      ],
      warnings: [],
    });
  });

  it("does not emit empty scoring objects for completely unannotated objects", () => {
    const objectReferences = compileBatch(createBatch()).scoringReference.tasks.room_generated_001.objects;

    expect(objectReferences).not.toHaveProperty("rug_unannotated_01");
  });
});
