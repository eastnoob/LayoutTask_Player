import type { z } from "zod";
import type { ObjectTargetState } from "../types/batch";
import { describe, expect, it } from "vitest";
import { batchSchema, objectTargetSchema, scoringReferenceSchema } from "./batch.schema";

type AssertExtends<Actual extends Expected, Expected> = [Actual] extends [Expected] ? true : never;

export const objectTargetSchemaMatchesObjectTargetState: AssertExtends<
  z.infer<typeof objectTargetSchema>,
  ObjectTargetState
> = true;

describe("objectTargetSchema", () => {
  it("infers object targets as ObjectTargetState", () => {
    expect(objectTargetSchemaMatchesObjectTargetState).toBe(true);
  });
});

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

  it("accepts shared world.unit metadata", () => {
    const batch = cloneMinimalBatch();
    batch.shared.world.unit = "mm";

    expect(batchSchema.parse(batch).shared.world?.unit).toBe("mm");
  });

  it("treats object x/y/rotation as reconstruction initial pose and target.relative as correct answer", () => {
    // Instance pose is the starting state; target.relative is the authored answer key.
    const batch = cloneMinimalBatch();
    batch.trials[0].objects[0] = {
      ...batch.trials[0].objects[0],
      x: 100,
      y: 150,
      rotation: 0,
      target: {
        relative: { dx_steps: 1, dy_steps: -2, rotation_steps: 1 },
        absolute: { x: 125, y: 100, rotation_deg: 45 },
      },
    };

    const object = batchSchema.parse(batch).trials[0].objects[0];

    expect(object.x).toBe(100);
    expect(object.y).toBe(150);
    expect(object.rotation).toBe(0);
    expect(object.target).toEqual({
      relative: { dx_steps: 1, dy_steps: -2, rotation_steps: 1 },
      absolute: { x: 125, y: 100, rotation_deg: 45 },
    });
  });

  it("accepts relative-only object targets as the canonical answer", () => {
    // Relative targets are the canonical authored scoring surface.
    const batch = cloneMinimalBatch();
    batch.trials[0].objects[0].target = {
      relative: { dx_steps: -1, dy_steps: 2, rotation_steps: -2 },
    };

    expect(batchSchema.parse(batch).trials[0].objects[0].target).toEqual({
      relative: { dx_steps: -1, dy_steps: 2, rotation_steps: -2 },
    });
  });

  it("rejects absolute-only object targets in authored batch config", () => {
    const batch = cloneMinimalBatch();
    batch.trials[0].objects[0].target = {
      absolute: { x: 125, y: 100, rotation_deg: 45 },
    };

    expect(() => batchSchema.parse(batch)).toThrow();
  });

  it("rejects empty target object", () => {
    const batch = cloneMinimalBatch();
    batch.trials[0].objects[0].target = {};

    expect(() => batchSchema.parse(batch)).toThrow();
  });

  it("rejects duplicate task IDs", () => {
    const batch = cloneMinimalBatch();
    batch.trials.push({
      ...structuredClone(batch.trials[0]),
      qid: "Q002",
    });

    expect(() => batchSchema.parse(batch)).toThrow("duplicate task_id");
  });

  it.each(["../sibling_task", "nested/task", "bad:name", "", "   "])(
    "rejects task IDs that are not filename-safe: %s",
    (taskId) => {
      const batch = cloneMinimalBatch();
      batch.trials[0].task_id = taskId;

      expect(() => batchSchema.parse(batch)).toThrow();
    },
  );

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

  it("rejects trial-level preview flow without display_image", () => {
    const batch = cloneMinimalBatch();
    batch.trials[0].flow = { mode: "preview_then_reconstruct" };

    expect(() => batchSchema.parse(batch)).toThrow(
      "preview_then_reconstruct requires trial.display_image.enabled=true",
    );
  });

  it("rejects shared preview flow without trial display_image", () => {
    // Shared preview mode still depends on each trial carrying a real display image.
    const batch = cloneMinimalBatch();
    batch.shared.flow = { mode: "preview_then_reconstruct" };

    expect(() => batchSchema.parse(batch)).toThrow(
      "preview_then_reconstruct requires trial.display_image.enabled=true",
    );
  });

  it("accepts preview flow with display_image enabled", () => {
    const batch = cloneMinimalBatch();
    batch.shared.flow = { mode: "preview_then_reconstruct" };
    batch.trials[0].display_image = { src: "assets/display-images/room01.jpeg" };

    expect(batchSchema.parse(batch).trials[0].display_image).toMatchObject({
      enabled: true,
      src: "assets/display-images/room01.jpeg",
    });
  });

  it("preserves trial collision and object collision config", () => {
    const batch = cloneMinimalBatch();
    batch.trials[0].collision = {
      enabled: true,
      mode: "discrete",
      source: { type: "svg", src: "assets/collision/room_generated_001_collision.svg" },
      areas: [
        {
          id: "room_walkable",
          type: "contain",
          shape: "rect",
          x: -400,
          y: -300,
          width: 800,
          height: 600,
        },
      ],
    };
    batch.trials[0].objects[0].collision = { enabled: true, shape: "box", padding: 5 };

    const parsed = batchSchema.parse(batch);

    expect(parsed.trials[0].collision).toEqual(batch.trials[0].collision);
    expect(parsed.trials[0].objects[0].collision).toEqual({ enabled: true, shape: "box", padding: 5 });
  });

  it("accepts collider SVG collision declarations in batch objects", () => {
    const batch = cloneMinimalBatch();
    batch.trials[0].objects[0].collision = {
      enabled: true,
      shape: "asset_outline",
      source: {
        type: "svg",
        src: "assets/collision/objects/chair_COLLIDER.svg",
      },
    };

    expect(batchSchema.parse(batch).trials[0].objects[0].collision).toMatchObject({
      shape: "asset_outline",
    });
  });

  it("accepts polygon collision declarations in batch objects", () => {
    const batch = cloneMinimalBatch();
    batch.trials[0].objects[0].collision = {
      enabled: true,
      shape: "polygons",
      polygons: [
        {
          id: "seat",
          points: [
            { x: -50, y: -25 },
            { x: 50, y: -25 },
            { x: 50, y: 25 },
            { x: -50, y: 25 },
          ],
        },
      ],
    };

    expect(batchSchema.parse(batch).trials[0].objects[0].collision).toMatchObject({
      shape: "polygons",
    });
  });

  it("rejects empty scoring object keys", () => {
    const batch = cloneMinimalBatch();
    batch.trials[0].scoring = {
      objects: {
        "": {
          target: {
            relative: { dx_steps: 1, dy_steps: -2, rotation_steps: 1 },
          },
        },
      },
    };

    expect(() => batchSchema.parse(batch)).toThrow();
  });
});

const validScoringReference = {
  schema: "layouttask.scoring-reference.v1",
  experiment_id: "floorplan_coherence_v1",
  tasks: {
    room_generated_001: {
      qid: "Q001",
      metadata: { difficulty: "easy", version: 1, active: true, note: null },
      objects: {
        chair_variable_01: {
          role: "variable",
          group_id: "chairs",
          target: {
            relative: { dx_steps: 1, dy_steps: -2, rotation_steps: 1 },
            absolute: { x: 125, y: 100, rotation_deg: 45 },
          },
          tolerance: {
            dx_steps: 1,
            dy_steps: 1,
            rotation_steps: 1,
            distance_world: 25,
            rotation_deg: 45,
          },
          labels: { target: "near table" },
        },
      },
    },
  },
};

const cloneScoringReference = (): any => structuredClone(validScoringReference);

describe("scoringReferenceSchema", () => {
  it("accepts a valid scoring reference", () => {
    const parsed = scoringReferenceSchema.parse(cloneScoringReference());

    expect(parsed.schema).toBe("layouttask.scoring-reference.v1");
    expect(parsed.tasks.room_generated_001.objects.chair_variable_01.target).toMatchObject({
      relative: { dx_steps: 1, dy_steps: -2, rotation_steps: 1 },
    });
  });

  it("rejects the wrong schema literal", () => {
    const reference = cloneScoringReference();
    reference.schema = "layouttask.batch.v1";

    expect(() => scoringReferenceSchema.parse(reference)).toThrow();
  });

  it("rejects empty target objects", () => {
    const reference = cloneScoringReference();
    reference.tasks.room_generated_001.objects.chair_variable_01.target = {};

    expect(() => scoringReferenceSchema.parse(reference)).toThrow();
  });

  it("rejects invalid object roles", () => {
    const reference = cloneScoringReference();
    reference.tasks.room_generated_001.objects.chair_variable_01.role = "anchor";

    expect(() => scoringReferenceSchema.parse(reference)).toThrow();
  });

  it("rejects negative tolerances", () => {
    const reference = cloneScoringReference();
    reference.tasks.room_generated_001.objects.chair_variable_01.tolerance.distance_world = -1;

    expect(() => scoringReferenceSchema.parse(reference)).toThrow();
  });

  it("rejects invalid metadata and labels shapes", () => {
    const referenceWithInvalidMetadata = cloneScoringReference();
    referenceWithInvalidMetadata.tasks.room_generated_001.metadata = {
      nested: { value: "not scalar" },
    };

    expect(() => scoringReferenceSchema.parse(referenceWithInvalidMetadata)).toThrow();

    const referenceWithInvalidLabels = cloneScoringReference();
    referenceWithInvalidLabels.tasks.room_generated_001.objects.chair_variable_01.labels = {
      target: 123,
    };

    expect(() => scoringReferenceSchema.parse(referenceWithInvalidLabels)).toThrow();
  });

  it("rejects empty task keys", () => {
    const reference = cloneScoringReference();
    reference.tasks = {
      "": reference.tasks.room_generated_001,
    };

    expect(() => scoringReferenceSchema.parse(reference)).toThrow();
  });

  it("rejects empty object keys", () => {
    const reference = cloneScoringReference();
    reference.tasks.room_generated_001.objects = {
      "": reference.tasks.room_generated_001.objects.chair_variable_01,
    };

    expect(() => scoringReferenceSchema.parse(reference)).toThrow();
  });
});
