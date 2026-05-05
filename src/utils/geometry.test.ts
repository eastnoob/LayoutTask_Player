import { describe, expect, it } from "vitest";
import { getMovementLimitFeedbackRect, getRotationLimitFeedbackArc, normalizeRotation } from "./geometry";

describe("normalizeRotation", () => {
  it("normalizes values above 360", () => {
    expect(normalizeRotation(405)).toBe(45);
  });

  it("normalizes negative values", () => {
    expect(normalizeRotation(-45)).toBe(315);
  });
});

describe("getMovementLimitFeedbackRect", () => {
  it("returns the full reachable area for a movement-limited object", () => {
    const rect = getMovementLimitFeedbackRect({
      origin: { x: 100, y: 200 },
      step: 25,
      objectWidth: 50,
      objectHeight: 50,
      maxLeft: 2,
      maxRight: 3,
      maxUp: 1,
      maxDown: 2,
    });

    expect(rect).toEqual({
      x: 25,
      y: 150,
      width: 175,
      height: 125,
    });
  });

  it("changes the whole area when limits and object size change", () => {
    const rect = getMovementLimitFeedbackRect({
      origin: { x: 0, y: 0 },
      step: 40,
      objectWidth: 80,
      objectHeight: 50,
      maxLeft: 1,
      maxRight: 2,
      maxUp: 3,
      maxDown: 1,
    });

    expect(rect).toEqual({
      x: -80,
      y: -145,
      width: 200,
      height: 210,
    });
  });
});

describe("getRotationLimitFeedbackArc", () => {
  it("still computes clockwise rotation limit geometry", () => {
    const arc = getRotationLimitFeedbackArc("rotate_cw", {
      center: { x: 0, y: 0 },
      radius: 80,
      initialRotation: 0,
      step: 45,
      maxCw: 2,
      maxCcw: 2,
    });

    expect(arc.limitAngle).toBe(90);
    expect(arc.path).toContain("A 80 80 0 0 1");
    expect(Math.round(arc.markerX)).toBe(0);
    expect(Math.round(arc.markerY)).toBe(80);
  });

  it("still computes counter-clockwise rotation limit geometry", () => {
    const arc = getRotationLimitFeedbackArc("rotate_ccw", {
      center: { x: 10, y: -10 },
      radius: 60,
      initialRotation: 0,
      step: 30,
      maxCw: 1,
      maxCcw: 3,
    });

    expect(arc.limitAngle).toBe(270);
    expect(arc.path).toContain("A 60 60 0 0 0");
    expect(Math.round(arc.markerX)).toBe(10);
    expect(Math.round(arc.markerY)).toBe(-70);
  });
});
