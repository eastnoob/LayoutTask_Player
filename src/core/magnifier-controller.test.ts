import { describe, expect, it } from "vitest";
import { MagnifierController } from "./magnifier-controller";

describe("MagnifierController", () => {
  it("starts at 2x and changes by a quarter turn within the supported range", () => {
    let now = 1_000;
    const controller = new MagnifierController({ now: () => now });

    expect(controller.getZoom()).toBe(2);
    expect(controller.enter()).toBe(true);
    expect(controller.wheel(1)).toEqual({ zoomBefore: 2, zoomAfter: 2.25 });
    expect(controller.wheel(-1)).toEqual({ zoomBefore: 2.25, zoomAfter: 2 });
    for (let index = 0; index < 10; index += 1) controller.wheel(-1);
    expect(controller.getZoom()).toBe(1.5);
    expect(controller.wheel(-1)).toBeUndefined();
    for (let index = 0; index < 20; index += 1) controller.wheel(1);
    expect(controller.getZoom()).toBe(4);
    now += 10;
    expect(controller.exit()).toBe(true);
  });

  it("counts each successful entry once and includes immediate exits", () => {
    let now = 10_000;
    const controller = new MagnifierController({ now: () => now });

    expect(controller.enter()).toBe(true);
    expect(controller.enter()).toBe(false);
    expect(controller.exit()).toBe(true);
    expect(controller.snapshot()).toEqual({ use_count: 1, total_duration_ms: 0 });
  });

  it("accumulates sessions, crops to the task window, and excludes Pause overlap", () => {
    let now = 100;
    const controller = new MagnifierController({
      now: () => now,
      pauseIntervals: () => [{ start: 140, end: 180 }],
    });

    controller.enter();
    now = 220;
    controller.exit();
    controller.enter();
    now = 260;
    const snapshot = controller.snapshot({ start: 120, end: 250 });

    expect(snapshot).toEqual({ use_count: 2, total_duration_ms: 90 });
  });

  it("exposes an active session duration without recording pointer or zoom telemetry", () => {
    let now = 500;
    const controller = new MagnifierController({ now: () => now });

    controller.enter();
    now = 575;

    expect(controller.snapshot()).toEqual({ use_count: 1, total_duration_ms: 75 });
    expect(controller).not.toHaveProperty("events");
    expect(controller).not.toHaveProperty("pointerPath");
  });
});
