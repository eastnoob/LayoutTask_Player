import { describe, expect, it } from "vitest";
import {
  attachColliderSvgToTrialObjects,
  colliderSrcForObjectSrc,
  jsonValuesEqual,
  parseArgs,
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
});
