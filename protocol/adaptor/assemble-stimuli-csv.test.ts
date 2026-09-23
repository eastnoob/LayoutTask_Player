import { describe, expect, it } from "vitest";
import {
  attachColliderSvgToTrialObjects,
  colliderSrcForObjectSrc,
  collisionConfigForColliderAttachment,
  jsonValuesEqual,
  mapTrialObjectYToRoomPoints,
  parseArgs,
  rebuildTrialObjectsFromSceneState,
  transformRhinoYUpTrialToSvgYDown,
  useBlankBackground,
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
      rebuildObjectsFromSceneState: false,
      mapYToRoomPoints: false,
      blankBackground: false,
      displayFlipY: false,
      backgroundFlipY: false,
      rhinoYUpToSvgYDown: false,
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

    expect(parseArgs(["--rhino-y-up-to-svg-y-down"])).toMatchObject({
      rhinoYUpToSvgYDown: true,
    });

    expect(parseArgs(["--rebuild-objects-from-scene-state"])).toMatchObject({
      rebuildObjectsFromSceneState: true,
    });

    expect(parseArgs(["--map-y-to-room-points"])).toMatchObject({
      mapYToRoomPoints: true,
    });

    expect(parseArgs(["--blank-background"])).toMatchObject({
      blankBackground: true,
    });

    expect(parseArgs(["--display-flip-y"])).toMatchObject({
      displayFlipY: true,
    });

    expect(parseArgs(["--background-flip-y"])).toMatchObject({
      backgroundFlipY: true,
    });

    expect(
      parseArgs([
        "--rhino-y-up-to-svg-y-down",
        "--rhino-y-affine-offset",
        "60996.49",
        "--rhino-y-affine-scale=-1.1419",
      ]),
    ).toMatchObject({
      rhinoYUpToSvgYDown: true,
      rhinoYAffineOffset: 60996.49,
      rhinoYAffineScale: -1.1419,
    });
  });

  it("enables task-level discrete collision when collider SVGs are attached", () => {
    expect(collisionConfigForColliderAttachment(true)).toEqual({
      enabled: true,
      mode: "discrete",
      areas: [],
    });
    expect(collisionConfigForColliderAttachment(false)).toBeUndefined();
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

  it("converts Rhino y-up authored poses into SVG y-down runtime poses", () => {
    const trial = {
      world: {
        viewBox: { x: 0, y: 0, width: 1000, height: 1000 },
        origin: { x: 0, y: 0 },
        grid: { size: 50, visible: true, snap: true },
      },
      background: { asset: "room", x: 0, y: 0, width: 1000, height: 1000 },
      objects: [
        {
          id: "chair",
          asset: "chair",
          x: 250,
          y: 900,
          rotation: 90,
          behavior: { template: "button500_rotate45_limited" },
          target: {
            relative: { dx_steps: 1, dy_steps: -2, rotation_steps: 2 },
            absolute: { x: 250, y: 800, rotation_deg: 180 },
          },
        },
      ],
    };

    transformRhinoYUpTrialToSvgYDown(trial, trial.world);

    expect(trial.objects[0]).toMatchObject({
      x: 250,
      y: 100,
      rotation: 270,
      target: {
        relative: { dx_steps: 1, dy_steps: 2, rotation_steps: -2 },
        absolute: { x: 250, y: 200, rotation_deg: 180 },
      },
    });
  });

  it("can replace a trial background with the transparent debugging background", () => {
    const trial = {
      background: { asset: "room_scene_0001_bg", x: -14000, y: 0, width: 14000, height: 42000 },
    };

    useBlankBackground(trial);

    expect(trial.background).toEqual({
      asset: "blank_background",
      x: -14000,
      y: 0,
      width: 14000,
      height: 42000,
    });
  });

  it("allows a measured y-axis affine mapping for raster-backed Rhino rooms", () => {
    const trial = {
      objects: [
        {
          id: "chair",
          asset: "chair",
          x: 250,
          y: 900,
          rotation: 90,
          behavior: { template: "button500_rotate45_limited" },
        },
      ],
    };

    transformRhinoYUpTrialToSvgYDown(
      trial,
      {
        viewBox: { x: 0, y: 0, width: 1000, height: 1000 },
        origin: { x: 0, y: 0 },
        grid: { size: 50, visible: true, snap: true },
      },
      { offset: 1200, scale: -1.25 },
    );

    expect(trial.objects[0]).toMatchObject({
      y: 75,
      rotation: 270,
    });
  });

  it("rebuilds complete runtime objects from scene-state placements", () => {
    const trial = {
      task_id: "scene_clean",
      objects: [
        {
          id: "stale_m04_variable",
          asset: "m04_variable",
          x: -2792.893,
          y: 38500,
          rotation: 0,
          behavior: { template: "button500_rotate45_limited" },
        },
      ],
    };
    const sceneState = {
      asset_dimensions: {
        M04: {
          group_asset: "m04_group",
          variable_asset: "m04_variable",
        },
      },
      placements: [
        {
          model_id: "M04",
          variable_state_label: "x+1,y-1,L+1",
          group_pose: { x: -3500, y: 38500, rotation_deg: 45 },
          variable_initial_pose: { x: -3500, y: 38500, rotation_deg: 45 },
          variable_correct_pose: { x: -2792.893, y: 38500, rotation_deg: 0 },
          variable_state: { dx_steps: 1, dy_steps: -1, rotation_steps: -1 },
        },
      ],
    };

    rebuildTrialObjectsFromSceneState(trial, sceneState);

    expect(trial.objects).toEqual([
      expect.objectContaining({
        id: "scene_clean_m04_group",
        role: "fixed",
        asset: "m04_group",
        x: -3500,
        y: 38500,
        rotation: 45,
      }),
      expect.objectContaining({
        id: "scene_clean_m04_variable",
        role: "variable",
        asset: "m04_variable",
        x: -3500,
        y: 38500,
        rotation: 45,
        target: {
          relative: { dx_steps: 1, dy_steps: -1, rotation_steps: -1, frame: "placed_group_local" },
          absolute: { x: -2792.893, y: 38500, rotation_deg: 0 },
        },
      }),
    ]);
  });

  it("maps rebuilt room y positions to the visible room point anchors", () => {
    const trial = {
      task_id: "scene_clean",
      world: {
        viewBox: { x: -14000, y: 0, width: 14000, height: 42000 },
      },
      objects: [
        {
          id: "scene_clean_m01_group",
          y: 31500,
          initial: { y: 31500 },
        },
        {
          id: "scene_clean_m01_variable",
          y: 31500,
          initial: { y: 31500 },
          target: { absolute: { y: 30500 } },
        },
      ],
    };
    const sceneState = {
      placements: [
        {
          model_id: "M01",
          point_id: "P04",
          group_pose: { x: -7000, y: 31500, rotation_deg: 0 },
          variable_initial_pose: { x: -7000, y: 31500, rotation_deg: 0 },
          variable_correct_pose: { x: -7000, y: 30500, rotation_deg: 0 },
        },
      ],
    };

    mapTrialObjectYToRoomPoints(trial, sceneState);

    const expectedP04AuthoredY = 42000 - ((((2135 + 4202) / 2) / 10476) * 42000 + 1400);
    expect(trial.objects[0].y).toBeCloseTo(expectedP04AuthoredY, 3);
    expect(trial.objects[1].target.absolute.y).toBeCloseTo(expectedP04AuthoredY - 1000, 3);
  });
});
