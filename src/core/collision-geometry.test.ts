import { describe, expect, it } from "vitest";
import {
  areaToPolygon,
  createObjectCollisionPolygon,
  doPolygonsIntersect,
  evaluateCollision,
  isPolygonInsidePolygon,
} from "./collision-geometry";
import type { RuntimeTaskObject } from "../types/runtime";

function createObject(overrides: Partial<RuntimeTaskObject>): RuntimeTaskObject {
  return {
    id: "chair_01",
    assetId: "chair_a",
    asset: {
      type: "svg",
      src: "assets/objects/chair.svg",
      srcResolved: "http://example.test/assets/objects/chair.svg",
      default_width: 100,
      default_height: 50,
      anchor: "center",
    },
    x: 0,
    y: 0,
    rotation: 0,
    width: 100,
    height: 50,
    anchor: "center",
    behavior: {
      movement: { mode: "button", step: 25, max_left: 10, max_right: 10, max_up: 10, max_down: 10 },
      rotation: { step: 45, max_cw: 8, max_ccw: 8 },
      free_drag: { enabled: false },
    },
    collision: { enabled: true, shape: "box", padding: 0 },
    ...overrides,
  };
}

describe("collision geometry", () => {
  it("converts rect areas to polygons", () => {
    expect(
      areaToPolygon({
        id: "block",
        type: "block",
        shape: "rect",
        x: 10,
        y: 20,
        width: 30,
        height: 40,
      }),
    ).toEqual([
      { x: 10, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 60 },
      { x: 10, y: 60 },
    ]);
  });

  it("creates centered object polygons in world units", () => {
    const polygon = createObjectCollisionPolygon(
      createObject({ x: 100, y: 200, width: 100, height: 50 }),
      { x: 100, y: 200, r: 0 },
    );

    expect(polygon).toEqual([
      { x: 50, y: 175 },
      { x: 150, y: 175 },
      { x: 150, y: 225 },
      { x: 50, y: 225 },
    ]);
  });

  it("creates padded top-left object polygons in world units", () => {
    const polygon = createObjectCollisionPolygon(
      createObject({
        x: 100,
        y: 200,
        width: 100,
        height: 50,
        anchor: "top_left",
        collision: { enabled: true, shape: "box", padding: 5 },
      }),
      { x: 100, y: 200, r: 0 },
    );

    expect(polygon).toEqual([
      { x: 95, y: 195 },
      { x: 205, y: 195 },
      { x: 205, y: 255 },
      { x: 95, y: 255 },
    ]);
  });

  it("detects polygon intersection while allowing edge contact", () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const touching = [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
    ];
    const overlapping = [
      { x: 9, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 9, y: 10 },
    ];

    expect(doPolygonsIntersect(a, touching)).toBe(false);
    expect(doPolygonsIntersect(a, overlapping)).toBe(true);
  });

  it("checks that object vertices stay inside a contain polygon", () => {
    const room = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 300 },
      { x: 0, y: 300 },
    ];
    const inside = [
      { x: 50, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
      { x: 50, y: 100 },
    ];
    const outside = [
      { x: -10, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
      { x: -10, y: 100 },
    ];

    expect(isPolygonInsidePolygon(inside, room)).toBe(true);
    expect(isPolygonInsidePolygon(outside, room)).toBe(false);
  });

  it("blocks candidate poses outside contain areas", () => {
    const moving = createObject({ x: 50, y: 50, width: 100, height: 100 });
    const result = evaluateCollision({
      movingObject: moving,
      candidatePose: { x: -10, y: 50, r: 0 },
      objects: [moving],
      areas: [
        {
          id: "room",
          type: "contain",
          shape: "rect",
          x: 0,
          y: 0,
          width: 300,
          height: 300,
        },
      ],
      worldViewBox: { x: 0, y: 0, width: 300, height: 300 },
    });

    expect(result).toEqual({ ok: false, reason: "outside_contain", areaId: "room" });
  });

  it("blocks candidate poses that overlap block areas", () => {
    const moving = createObject({ x: 50, y: 50, width: 50, height: 50 });
    const result = evaluateCollision({
      movingObject: moving,
      candidatePose: { x: 100, y: 100, r: 0 },
      objects: [moving],
      areas: [
        {
          id: "pillar",
          type: "block",
          shape: "rect",
          x: 90,
          y: 90,
          width: 30,
          height: 30,
        },
      ],
      worldViewBox: { x: 0, y: 0, width: 300, height: 300 },
    });

    expect(result).toEqual({ ok: false, reason: "blocked_area", areaId: "pillar" });
  });

  it("blocks candidate poses that overlap another collision-enabled object", () => {
    const moving = createObject({ id: "chair_01", x: 50, y: 50, width: 50, height: 50 });
    const table = createObject({ id: "table_01", x: 100, y: 50, width: 50, height: 50 });
    const result = evaluateCollision({
      movingObject: moving,
      candidatePose: { x: 100, y: 50, r: 0 },
      objects: [moving, table],
      areas: [],
      worldViewBox: { x: 0, y: 0, width: 300, height: 300 },
    });

    expect(result).toEqual({ ok: false, reason: "object", objectId: "table_01" });
  });

  it("allows candidate poses for collision-disabled moving objects", () => {
    const moving = createObject({
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      collision: { enabled: false, shape: "box", padding: 0 },
    });
    const result = evaluateCollision({
      movingObject: moving,
      candidatePose: { x: -1000, y: -1000, r: 0 },
      objects: [moving],
      areas: [
        {
          id: "room",
          type: "contain",
          shape: "rect",
          x: 0,
          y: 0,
          width: 300,
          height: 300,
        },
      ],
      worldViewBox: { x: 0, y: 0, width: 300, height: 300 },
    });

    expect(result).toEqual({ ok: true });
  });
});
