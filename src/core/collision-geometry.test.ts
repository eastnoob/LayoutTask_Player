import { describe, expect, it } from "vitest";
import {
  areaToPolygon,
  createObjectCollisionPolygon,
  createObjectCollisionPolygons,
  doPolygonsIntersect,
  evaluateCollision,
  isPolygonInsidePolygon,
  viewBoxToPolygon,
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

function expectPolygonToBeCloseTo(actual: Array<{ x: number; y: number }>, expected: Array<{ x: number; y: number }>) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index].x);
    expect(point.y).toBeCloseTo(expected[index].y);
  });
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

  it("creates rotated centered object polygons in world units", () => {
    const polygon = createObjectCollisionPolygon(
      createObject({ x: 100, y: 200, width: 100, height: 50 }),
      { x: 100, y: 200, r: 90 },
    );

    expectPolygonToBeCloseTo(polygon, [
      { x: 125, y: 150 },
      { x: 125, y: 250 },
      { x: 75, y: 250 },
      { x: 75, y: 150 },
    ]);
  });

  it("creates centered local collision polygons in world units", () => {
    const polygons = createObjectCollisionPolygons(
      createObject({
        x: 100,
        y: 200,
        width: 100,
        height: 50,
        collision: {
          enabled: true,
          shape: "polygons",
          padding: 0,
          polygons: [
            {
              points: [
                { x: 60, y: 10 },
                { x: 80, y: 10 },
                { x: 60, y: 30 },
              ],
            },
          ],
        },
      }),
      { x: 100, y: 200, r: 90 },
    );

    expect(polygons).toHaveLength(1);
    expectPolygonToBeCloseTo(polygons[0], [
      { x: 115, y: 210 },
      { x: 115, y: 230 },
      { x: 95, y: 210 },
    ]);
  });

  it("creates top-left local collision polygons in world units", () => {
    const polygons = createObjectCollisionPolygons(
      createObject({
        x: 100,
        y: 200,
        width: 100,
        height: 50,
        anchor: "top_left",
        collision: {
          enabled: true,
          shape: "polygons",
          padding: 0,
          polygons: [
            {
              points: [
                { x: 10, y: 20 },
                { x: 30, y: 20 },
                { x: 10, y: 40 },
              ],
            },
          ],
        },
      }),
      { x: 100, y: 200, r: 90 },
    );

    expect(polygons).toHaveLength(1);
    expectPolygonToBeCloseTo(polygons[0], [
      { x: 80, y: 210 },
      { x: 80, y: 230 },
      { x: 60, y: 210 },
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

  it("blocks rotated candidate poses that overlap block areas", () => {
    const moving = createObject({ x: 100, y: 100, width: 100, height: 40 });
    const result = evaluateCollision({
      movingObject: moving,
      candidatePose: { x: 100, y: 100, r: 90 },
      objects: [moving],
      areas: [
        {
          id: "low_block",
          type: "block",
          shape: "rect",
          x: 90,
          y: 140,
          width: 20,
          height: 20,
        },
      ],
      worldViewBox: { x: 0, y: 0, width: 300, height: 300 },
    });

    expect(result).toEqual({ ok: false, reason: "blocked_area", areaId: "low_block" });
  });

  it("honors polygon contain areas", () => {
    const moving = createObject({ x: 100, y: 100, width: 20, height: 20 });
    const diamondRoom = {
      id: "diamond_room",
      type: "contain" as const,
      shape: "polygon" as const,
      points: [
        { x: 100, y: 0 },
        { x: 200, y: 100 },
        { x: 100, y: 200 },
        { x: 0, y: 100 },
      ],
    };

    expect(
      evaluateCollision({
        movingObject: moving,
        candidatePose: { x: 100, y: 100, r: 0 },
        objects: [moving],
        areas: [diamondRoom],
        worldViewBox: { x: 0, y: 0, width: 300, height: 300 },
      }),
    ).toEqual({ ok: true });
    expect(
      evaluateCollision({
        movingObject: moving,
        candidatePose: { x: 20, y: 20, r: 0 },
        objects: [moving],
        areas: [diamondRoom],
        worldViewBox: { x: 0, y: 0, width: 300, height: 300 },
      }),
    ).toEqual({ ok: false, reason: "outside_contain", areaId: "diamond_room" });
  });

  it("honors polygon block areas", () => {
    const moving = createObject({ x: 100, y: 100, width: 50, height: 50 });
    const result = evaluateCollision({
      movingObject: moving,
      candidatePose: { x: 100, y: 100, r: 0 },
      objects: [moving],
      areas: [
        {
          id: "triangle_block",
          type: "block",
          shape: "polygon",
          points: [
            { x: 90, y: 90 },
            { x: 120, y: 90 },
            { x: 90, y: 120 },
          ],
        },
      ],
      worldViewBox: { x: 0, y: 0, width: 300, height: 300 },
    });

    expect(result).toEqual({ ok: false, reason: "blocked_area", areaId: "triangle_block" });
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

  it("blocks candidate poses that newly overlap another object in the same group", () => {
    const moving = createObject({
      id: "chair_variable_01",
      group_id: "chair_group",
      x: -25,
      y: 50,
      width: 50,
      height: 50,
    });
    const context = createObject({
      id: "chair_group_01",
      group_id: "chair_group",
      x: 50,
      y: 50,
      width: 50,
      height: 50,
    });
    const other = createObject({
      id: "table_01",
      group_id: "table_group",
      x: 200,
      y: 50,
      width: 50,
      height: 50,
    });

    expect(
      evaluateCollision({
        movingObject: moving,
        candidatePose: { x: 75, y: 50, r: 0 },
        objects: [moving, context, other],
        areas: [],
        worldViewBox: { x: 0, y: 0, width: 300, height: 300 },
      }),
    ).toEqual({ ok: false, reason: "object", objectId: "chair_group_01" });
  });

  it("allows same-group poses that are already overlapping so the object can move out", () => {
    const moving = createObject({
      id: "chair_variable_01",
      group_id: "chair_group",
      x: 50,
      y: 50,
      width: 50,
      height: 50,
    });
    const context = createObject({
      id: "chair_group_01",
      group_id: "chair_group",
      x: 50,
      y: 50,
      width: 50,
      height: 50,
    });
    const other = createObject({
      id: "table_01",
      group_id: "table_group",
      x: 200,
      y: 50,
      width: 50,
      height: 50,
    });

    expect(
      evaluateCollision({
        movingObject: moving,
        candidatePose: { x: 75, y: 50, r: 0 },
        objects: [moving, context, other],
        objectPoses: { chair_variable_01: { x: 50, y: 50, r: 0 } },
        areas: [],
        worldViewBox: { x: 0, y: 0, width: 300, height: 300 },
      }),
    ).toEqual({ ok: true });
  });

  it("blocks when any moving local polygon overlaps another collision-enabled object", () => {
    const moving = createObject({
      id: "chair_01",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      collision: {
        enabled: true,
        shape: "polygons",
        padding: 0,
        polygons: [
          {
            points: [
              { x: 0, y: 0 },
              { x: 20, y: 0 },
              { x: 20, y: 20 },
              { x: 0, y: 20 },
            ],
          },
          {
            points: [
              { x: 80, y: 80 },
              { x: 100, y: 80 },
              { x: 100, y: 100 },
              { x: 80, y: 100 },
            ],
          },
        ],
      },
    });
    const table = createObject({ id: "table_01", x: 140, y: 140, width: 20, height: 20 });

    const result = evaluateCollision({
      movingObject: moving,
      candidatePose: { x: 100, y: 100, r: 0 },
      objects: [moving, table],
      areas: [],
      worldViewBox: { x: 0, y: 0, width: 300, height: 300 },
    });

    expect(result).toEqual({ ok: false, reason: "object", objectId: "table_01" });
  });

  it("allows bbox overlap when the actual moving local polygon does not overlap", () => {
    const moving = createObject({
      id: "chair_01",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      collision: {
        enabled: true,
        shape: "polygons",
        padding: 0,
        polygons: [
          {
            points: [
              { x: 0, y: 0 },
              { x: 20, y: 0 },
              { x: 20, y: 20 },
              { x: 0, y: 20 },
            ],
          },
        ],
      },
    });
    const table = createObject({ id: "table_01", x: 140, y: 140, width: 20, height: 20 });

    const result = evaluateCollision({
      movingObject: moving,
      candidatePose: { x: 100, y: 100, r: 0 },
      objects: [moving, table],
      areas: [],
      worldViewBox: { x: 0, y: 0, width: 300, height: 300 },
    });

    expect(result).toEqual({ ok: true });
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

  it("uses the world viewBox as default containment when no contain areas exist", () => {
    const moving = createObject({ x: 50, y: 50, width: 50, height: 50 });
    const worldViewBox = { x: 0, y: 0, width: 100, height: 100 };

    expect(viewBoxToPolygon(worldViewBox)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
    expect(
      evaluateCollision({
        movingObject: moving,
        candidatePose: { x: 50, y: 50, r: 0 },
        objects: [moving],
        areas: [],
        worldViewBox,
      }),
    ).toEqual({ ok: true });
    expect(
      evaluateCollision({
        movingObject: moving,
        candidatePose: { x: 90, y: 50, r: 0 },
        objects: [moving],
        areas: [],
        worldViewBox,
      }),
    ).toEqual({ ok: false, reason: "outside_contain", areaId: "__world_viewBox" });
  });
});
