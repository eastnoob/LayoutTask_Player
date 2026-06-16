import { describe, expect, it } from "vitest";
import { batchSchema } from "./batch.schema";

const minimalBatch = {
  schema: "layouttask.batch.v1",
  experiment_id: "floorplan_coherence_v1",
  shared: {
    asset_library: "assets/objects.json",
    background_library: "assets/backgrounds.json",
    behavior_library: "behaviors/behaviors.json",
    world: {
      viewBox: { x: -500, y: -500, width: 1000, height: 1000 },
      origin: { x: 0, y: 0 },
      grid: { size: 25, visible: true, snap: true },
    },
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
          asset: "chair_a",
          x: 100,
          y: 150,
          rotation: 0,
          behavior: { template: "drag25_rotate45_limited" },
          target: {
            relative: { dx_steps: 1, dy_steps: -2, rotation_steps: 1 },
            absolute: { x: 125, y: 100, rotation_deg: 45 },
          },
        },
      ],
    },
  ],
};

const cloneMinimalBatch = (): any => structuredClone(minimalBatch);

describe("batchSchema", () => {
  it("accepts a minimal batch with both relative and absolute scoring targets", () => {
    const parsed = batchSchema.parse(cloneMinimalBatch());

    expect(parsed.schema).toBe("layouttask.batch.v1");
    expect(parsed.trials[0].objects[0].target).toEqual({
      relative: { dx_steps: 1, dy_steps: -2, rotation_steps: 1 },
      absolute: { x: 125, y: 100, rotation_deg: 45 },
    });
  });

  it("accepts a target with only relative", () => {
    const batch = cloneMinimalBatch();
    batch.trials[0].objects[0].target = {
      relative: { dx_steps: 1, dy_steps: -2, rotation_steps: 1 },
    };

    expect(batchSchema.parse(batch).trials[0].objects[0].target).toEqual({
      relative: { dx_steps: 1, dy_steps: -2, rotation_steps: 1 },
    });
  });

  it("accepts a target with only absolute", () => {
    const batch = cloneMinimalBatch();
    batch.trials[0].objects[0].target = {
      absolute: { x: 125, y: 100, rotation_deg: 45 },
    };

    expect(batchSchema.parse(batch).trials[0].objects[0].target).toEqual({
      absolute: { x: 125, y: 100, rotation_deg: 45 },
    });
  });

  it("rejects empty target object", () => {
    const batch = cloneMinimalBatch();
    batch.trials[0].objects[0].target = {};

    expect(() => batchSchema.parse(batch)).toThrow("target requires relative or absolute");
  });

  it("rejects duplicate task IDs", () => {
    const batch = cloneMinimalBatch();
    batch.trials.push({
      ...structuredClone(batch.trials[0]),
      qid: "Q002",
    });

    expect(() => batchSchema.parse(batch)).toThrow("duplicate task_id");
  });

  it("rejects duplicate object IDs within a trial", () => {
    const batch = cloneMinimalBatch();
    batch.trials[0].objects.push(structuredClone(batch.trials[0].objects[0]));

    expect(() => batchSchema.parse(batch)).toThrow("duplicate object id");
  });

  it("rejects invalid object roles", () => {
    const batch = cloneMinimalBatch();
    batch.trials[0].objects[0].role = "anchor";

    expect(() => batchSchema.parse(batch)).toThrow();
  });

  it("rejects a batch where neither trial.world nor shared.world exists", () => {
    const batch = cloneMinimalBatch();
    delete batch.shared.world;

    expect(() => batchSchema.parse(batch)).toThrow("trial.world or shared.world is required");
  });
});
