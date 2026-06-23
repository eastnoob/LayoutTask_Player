import { describe, expect, it } from "vitest";
import {
  assemble,
  attachColliderSvgToTrialObjects,
  colliderSrcForObjectSrc,
  jsonValuesEqual,
  normalizePairedSvgAssetDimensions,
  parseArgs,
  sizingWarnings,
} from "./assemble-stimuli-csv";

describe("assemble-stimuli-csv collider SVG adaptor helpers", () => {
  it("compares JSON values without depending on object key order", () => {
    expect(jsonValuesEqual({ b: 2, a: { d: 4, c: [1, 2] } }, { a: { c: [1, 2], d: 4 }, b: 2 })).toBe(
      true,
    );
    expect(jsonValuesEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(jsonValuesEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("parses collider attachment flags with _COLLISION as the default suffix", () => {
    expect(parseArgs([])).toMatchObject({
      attachColliderSvg: false,
      colliderSuffix: "_COLLISION",
    });

    expect(parseArgs(["--attach-collider-svg"])).toMatchObject({
      attachColliderSvg: true,
      colliderSuffix: "_COLLISION",
    });

    expect(parseArgs(["--attach-collider-svg", "--collider-suffix", "_COLLIDER"])).toMatchObject({
      attachColliderSvg: true,
      colliderSuffix: "_COLLIDER",
    });

    expect(parseArgs(["--attach-collider-svg", "--collider-suffix=_MASK"])).toMatchObject({
      attachColliderSvg: true,
      colliderSuffix: "_MASK",
    });
  });

  it("derives collider source paths from SVG object asset paths", () => {
    expect(colliderSrcForObjectSrc("assets/objects/m04_group.svg", "_COLLISION")).toBe(
      "assets/collision/objects/m04_group_COLLISION.svg",
    );
    expect(colliderSrcForObjectSrc("assets\\objects\\armchairAndTeatable_FIXED.svg", "_COLLISION")).toBe(
      "assets/collision/objects/armchairAndTeatable_FIXED_COLLISION.svg",
    );
    expect(colliderSrcForObjectSrc("assets/objects/m04_group.svg?cache=1#icon", "_COLLIDER")).toBe(
      "assets/collision/objects/m04_group_COLLIDER.svg",
    );
  });

  it("attaches collider SVGs only to missing or legacy box object collisions", () => {
    const trial = {
      objects: [
        { id: "missing", asset: "chair", x: 0, y: 0 },
        { id: "legacy_box", asset: "chair", x: 1, y: 0, collision: { enabled: true, padding: 3 } },
        { id: "disabled", asset: "chair", x: 2, y: 0, collision: { enabled: false, shape: "box", padding: 1 } },
        {
          id: "polygons",
          asset: "chair",
          x: 3,
          y: 0,
          collision: {
            enabled: true,
            shape: "polygons",
            polygons: [
              {
                points: [
                  { x: 0, y: 0 },
                  { x: 10, y: 0 },
                  { x: 0, y: 10 },
                ],
              },
            ],
            padding: 4,
          },
        },
        {
          id: "asset_outline",
          asset: "chair",
          x: 4,
          y: 0,
          collision: {
            enabled: true,
            shape: "asset_outline",
            source: { type: "svg", src: "assets/collision/objects/existing.svg" },
            padding: 5,
          },
        },
      ],
    };
    const objectAssets = {
      chair: { type: "svg", src: "assets\\objects\\armchairAndTeatable_FIXED.svg" },
    };

    attachColliderSvgToTrialObjects(trial, objectAssets, "_COLLISION");

    expect(trial.objects[0].collision).toEqual({
      enabled: true,
      shape: "asset_outline",
      source: {
        type: "svg",
        src: "assets/collision/objects/armchairAndTeatable_FIXED_COLLISION.svg",
      },
    });
    expect(trial.objects[1].collision).toEqual({
      enabled: true,
      padding: 3,
      shape: "asset_outline",
      source: {
        type: "svg",
        src: "assets/collision/objects/armchairAndTeatable_FIXED_COLLISION.svg",
      },
    });
    expect(trial.objects[2].collision).toEqual({ enabled: false, shape: "box", padding: 1 });
    expect(trial.objects[3].collision).toMatchObject({ shape: "polygons", padding: 4 });
    expect(trial.objects[4].collision).toEqual({
      enabled: true,
      shape: "asset_outline",
      source: { type: "svg", src: "assets/collision/objects/existing.svg" },
      padding: 5,
    });
  });

  it("preserves explicit Rhino dimensions when attaching collider SVGs without trusting SVG viewBox", () => {
    const row = {
      CombinationId: "rhino_dims",
      trial_protocol_json: JSON.stringify({
        schema: "layouttask.task.v1",
        task_id: "scene_from_runner",
        qid: "Q_FROM_RUNNER",
        world: {
          viewBox: { x: 0, y: 0, width: 35000, height: 14000 },
          origin: { x: 0, y: 0 },
          grid: { size: 500, visible: true, snap: true },
        },
        background: {
          asset: "room_scene_0001_bg",
          x: 0,
          y: 0,
          width: 35000,
          height: 14000,
        },
        objects: [
          {
            id: "scene_from_runner_m01_group",
            asset: "m01_group",
            x: 31500,
            y: 10500,
            width: 3855.502,
            height: 850,
            behavior: { template: "drag500_rotate45_limited" },
          },
        ],
      }),
      object_assets_json: JSON.stringify({
        schema: "layouttask.assets.objects.v1",
        objects: {
          m01_group: {
            type: "svg",
            src: "assets/objects/m01_group.svg",
            anchor: "center",
            default_width: 3855.502,
            default_height: 850,
          },
        },
      }),
      background_assets_json: JSON.stringify({
        schema: "layouttask.assets.backgrounds.v1",
        backgrounds: {
          room_scene_0001_bg: {
            type: "svg",
            src: "assets/backgrounds/room_scene_0001_bg.svg",
          },
        },
      }),
    };

    const { batch, objectLibrary } = assemble(
      [row],
      "sg_output_2_collider",
      "SG Output 2 Collider",
      false,
      1,
      true,
      "_COLLISION",
    );

    const trial = (batch.trials as Array<Record<string, unknown>>)[0];
    expect(trial.background).toEqual({
      asset: "room_scene_0001_bg",
      x: 0,
      y: 0,
      width: 35000,
      height: 14000,
    });
    expect(objectLibrary.objects).toMatchObject({
      m01_group: {
        default_width: 3855.502,
        default_height: 850,
      },
    });
    expect((trial.objects as Array<Record<string, unknown>>)[0]).toMatchObject({
      width: 3855.502,
      height: 850,
      collision: {
        enabled: true,
        shape: "asset_outline",
        source: {
          type: "svg",
          src: "assets/collision/objects/m01_group_COLLISION.svg",
        },
      },
    });
  });

  it("enables task-level collision when attaching collider SVGs", () => {
    const row = {
      CombinationId: "collision_switch",
      trial_protocol_json: JSON.stringify({
        schema: "layouttask.task.v1",
        task_id: "scene_from_runner",
        qid: "Q_FROM_RUNNER",
        world: {
          viewBox: { x: 0, y: 0, width: 1000, height: 1000 },
          origin: { x: 0, y: 0 },
          grid: { size: 100, visible: true, snap: true },
        },
        background: {
          asset: "room_bg",
          x: 0,
          y: 0,
          width: 1000,
          height: 1000,
        },
        collision: {
          areas: [
            {
              id: "room",
              type: "contain",
              shape: "rect",
              x: 0,
              y: 0,
              width: 1000,
              height: 1000,
            },
          ],
        },
        objects: [
          {
            id: "chair",
            asset: "chair",
            x: 500,
            y: 500,
            width: 100,
            height: 100,
            behavior: { template: "drag500_rotate45_limited" },
          },
        ],
      }),
      object_assets_json: JSON.stringify({
        schema: "layouttask.assets.objects.v1",
        objects: {
          chair: {
            type: "svg",
            src: "assets/objects/chair.svg",
            anchor: "center",
            default_width: 100,
            default_height: 100,
          },
        },
      }),
      background_assets_json: JSON.stringify({
        schema: "layouttask.assets.backgrounds.v1",
        backgrounds: {
          room_bg: {
            type: "svg",
            src: "assets/backgrounds/room.svg",
          },
        },
      }),
    };

    const { batch } = assemble([row], "collision_on", "Collision On", false, 1, true, "_COLLISION");

    const trial = (batch.trials as Array<Record<string, unknown>>)[0];
    expect(trial.collision).toEqual({
      enabled: true,
      mode: "discrete",
      areas: [
        {
          id: "room",
          type: "contain",
          shape: "rect",
          x: 0,
          y: 0,
          width: 1000,
          height: 1000,
        },
      ],
    });
  });

  it("strips explicit dimensions only when --trust-svg-viewbox behavior is explicitly requested", () => {
    const row = {
      CombinationId: "trust_viewbox",
      trial_protocol_json: JSON.stringify({
        schema: "layouttask.task.v1",
        task_id: "scene_from_runner",
        qid: "Q_FROM_RUNNER",
        world: {
          viewBox: { x: 0, y: 0, width: 35000, height: 14000 },
          origin: { x: 0, y: 0 },
          grid: { size: 500, visible: true, snap: true },
        },
        background: {
          asset: "room_scene_0001_bg",
          x: 0,
          y: 0,
          width: 35000,
          height: 14000,
        },
        objects: [
          {
            id: "scene_from_runner_m01_group",
            asset: "m01_group",
            x: 31500,
            y: 10500,
            width: 3855.502,
            height: 850,
            behavior: { template: "drag500_rotate45_limited" },
          },
        ],
      }),
      object_assets_json: JSON.stringify({
        schema: "layouttask.assets.objects.v1",
        objects: {
          m01_group: {
            type: "svg",
            src: "assets/objects/m01_group.svg",
            anchor: "center",
            default_width: 3855.502,
            default_height: 850,
          },
        },
      }),
      background_assets_json: JSON.stringify({
        schema: "layouttask.assets.backgrounds.v1",
        backgrounds: {
          room_scene_0001_bg: {
            type: "svg",
            src: "assets/backgrounds/room_scene_0001_bg.svg",
          },
        },
      }),
    };

    const { batch, objectLibrary } = assemble(
      [row],
      "svg_viewbox_size",
      "SVG ViewBox Size",
      true,
      1,
      true,
      "_COLLISION",
    );

    const trial = (batch.trials as Array<Record<string, unknown>>)[0];
    expect(trial.background).toEqual({ asset: "room_scene_0001_bg" });
    expect(objectLibrary.objects).toMatchObject({
      m01_group: {
        type: "svg",
        src: "assets/objects/m01_group.svg",
        anchor: "center",
      },
    });
    expect(objectLibrary.objects.m01_group).not.toHaveProperty("default_width");
    expect(objectLibrary.objects.m01_group).not.toHaveProperty("default_height");
    expect((trial.objects as Array<Record<string, unknown>>)[0]).toMatchObject({
      collision: {
        enabled: true,
        shape: "asset_outline",
        source: {
          type: "svg",
          src: "assets/collision/objects/m01_group_COLLISION.svg",
        },
      },
    });
    expect((trial.objects as Array<Record<string, unknown>>)[0]).not.toHaveProperty("width");
    expect((trial.objects as Array<Record<string, unknown>>)[0]).not.toHaveProperty("height");
  });

  it("warns when collider attachment is combined with trusting SVG viewBox", () => {
    expect(sizingWarnings(parseArgs(["--attach-collider-svg"]))).toEqual([]);
    expect(sizingWarnings(parseArgs(["--trust-svg-viewbox"]))).toEqual([
      "--trust-svg-viewbox removes explicit SVG dimensions. Use it only when SVG viewBox values are already task-space world units.",
    ]);
    expect(sizingWarnings(parseArgs(["--attach-collider-svg", "--trust-svg-viewbox"]))).toEqual([
      "--trust-svg-viewbox removes explicit SVG dimensions. Use it only when SVG viewBox values are already task-space world units.",
      "--attach-collider-svg does not require --trust-svg-viewbox. Rhino bbox exports should usually attach colliders while preserving explicit dimensions.",
    ]);
  });

  it("can normalize variable SVG dimensions from a paired group SVG axis scale", () => {
    const objectAssets = {
      m04_group: {
        type: "svg",
        src: "assets/objects/m04_group.svg",
        default_width: 3865.162,
        default_height: 5550,
      },
      m04_variable: {
        type: "svg",
        src: "assets/objects/m04_variable.svg",
        default_width: 3000,
        default_height: 550,
      },
      m02_group: {
        type: "svg",
        src: "assets/objects/m02_group.svg",
        default_width: 402.355,
        default_height: 1319.612,
      },
      m02_variable: {
        type: "svg",
        src: "assets/objects/m02_variable.svg",
        default_width: 402.328,
        default_height: 319.612,
      },
    };

    const updated = normalizePairedSvgAssetDimensions(objectAssets, {
      m04_group: { x: 0, y: 0, width: 1856, height: 2652 },
      m04_variable: { x: 0, y: 0, width: 1856, height: 290 },
      m02_group: { x: 0, y: 0, width: 601, height: 1208 },
      m02_variable: { x: 0, y: 0, width: 601, height: 499 },
    });

    expect(updated).toEqual(["m04_variable"]);
    expect(objectAssets.m04_variable.default_width).toBeCloseTo(3865.162);
    expect(objectAssets.m04_variable.default_height).toBeCloseTo(603.932);
    expect(objectAssets.m02_variable).toMatchObject({
      default_width: 402.328,
      default_height: 319.612,
    });
  });
});
