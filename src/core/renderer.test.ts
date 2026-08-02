import { describe, expect, it } from "vitest";
import { createRuntimeConfig } from "../test-support/runtime-config";
import {
  getConfiguredObjectLocalRect,
  getObjectControlLayout,
  getObjectVisualDisplayTransform,
  getRotatedVisualBounds,
  getStageDisplayTransform,
  getStageFitStyle,
  getStageUiMetrics,
  isObjectInteractive,
} from "./renderer";

describe("LayoutTaskRenderer stage fit", () => {
  it("sets stage aspect ratio and max height from world/stage config", () => {
    const config = createRuntimeConfig({
      world: {
        viewBox: { x: 0, y: 0, width: 3200000, height: 2400000 },
        origin: { x: 0, y: 0 },
        grid: { size: 100000, visible: false, snap: true },
      },
      stage: {
        fit: "contain",
        max_height_ratio: 0.6,
        padding: 12,
        display_rotation_deg: 0,
        display_flip_y: false,
      },
    });
    expect(getStageFitStyle(config)).toEqual({
      aspectRatio: "3200000 / 2400000",
      maxHeight: "60vh",
      padding: "12px",
    });
  });

  it("scales SVG UI chrome for large world coordinates", () => {
    const config = createRuntimeConfig({
      world: {
        viewBox: { x: 0, y: 0, width: 3200000, height: 2400000 },
        origin: { x: 0, y: 0 },
        grid: { size: 100000, visible: false, snap: true },
      },
      background: {
        ...createRuntimeConfig().background,
        x: 0,
        y: 0,
        width: 3200000,
        height: 2400000,
      },
    });

    expect(getStageUiMetrics(config)).toMatchObject({
      scale: 4000,
      controlRadius: 72000,
      controlGap: 176000,
      controlIconSize: 80000,
      feedbackIconSize: 104000,
      feedbackLabelFontSize: 80000,
      feedbackLabelStrokeWidth: 16000,
    });
  });

  it("uses actual SVG screen transform when available", () => {
    const config = createRuntimeConfig({
      world: {
        viewBox: { x: 0, y: 0, width: 3200000, height: 2400000 },
        origin: { x: 0, y: 0 },
        grid: { size: 100000, visible: false, snap: true },
      },
    });
    const svg = {
      getScreenCTM: () => ({ a: 0.00025 }),
    } as unknown as SVGSVGElement;

    expect(getStageUiMetrics(config, svg)).toMatchObject({
      scale: 4000,
      feedbackLabelFontSize: 80000,
    });
  });

  it("rotates authored Rhino display stages around the world viewBox center", () => {
    const config = createRuntimeConfig({
      world: {
        viewBox: { x: -14000, y: 0, width: 14000, height: 35000 },
        origin: { x: 0, y: 0 },
        grid: { size: 500, visible: false, snap: true },
      },
      stage: {
        fit: "contain",
        max_height_ratio: 0.72,
        padding: 16,
        display_rotation_deg: 180,
      } as ReturnType<typeof createRuntimeConfig>["stage"],
    });

    expect(getStageDisplayTransform(config)).toBe("rotate(180 -7000 17500)");
  });

  it("flips Rhino display stages vertically without mirroring left and right slots", () => {
    const config = createRuntimeConfig({
      world: {
        viewBox: { x: -14000, y: 0, width: 14000, height: 35000 },
        origin: { x: 0, y: 0 },
        grid: { size: 500, visible: false, snap: true },
      },
      stage: {
        fit: "contain",
        max_height_ratio: 0.72,
        padding: 16,
        display_rotation_deg: 0,
        display_flip_y: true,
      } as ReturnType<typeof createRuntimeConfig>["stage"],
    });

    expect(getStageDisplayTransform(config)).toBe("translate(0 35000) scale(1 -1)");
  });

  it("counter-flips object visuals when the stage display is flipped", () => {
    const config = createRuntimeConfig({
      stage: {
        ...createRuntimeConfig().stage,
        display_flip_y: true,
      },
    });

    expect(getObjectVisualDisplayTransform(config)).toBe("scale(1 -1)");
  });

  it("does not transform object visuals when the stage display is not flipped", () => {
    const config = createRuntimeConfig({
      stage: {
        ...createRuntimeConfig().stage,
        display_flip_y: false,
      },
    });

    expect(getObjectVisualDisplayTransform(config)).toBeUndefined();
  });

  it("computes control bounds from rotated visual extents", () => {
    const bounds = getRotatedVisualBounds(getConfiguredObjectLocalRect({ width: 400, height: 240, anchor: "center" }), 90);

    expect(bounds.minX).toBeCloseTo(-120);
    expect(bounds.maxX).toBeCloseTo(120);
    expect(bounds.minY).toBeCloseTo(-200);
    expect(bounds.maxY).toBeCloseTo(200);
  });
});

describe("LayoutTaskRenderer object interactivity", () => {
  it("treats objects without movement or rotation as static context", () => {
    const config = createRuntimeConfig();
    const staticObject = {
      ...config.objects[0],
      behavior: {
        movement: { mode: "none" as const },
        free_drag: { enabled: false },
      },
    };

    expect(isObjectInteractive(staticObject)).toBe(false);
  });

  it("treats button, drag, and rotation-only objects as interactive", () => {
    const config = createRuntimeConfig();
    const baseObject = config.objects[0];

    expect(isObjectInteractive(baseObject)).toBe(true);

    expect(
      isObjectInteractive({
        ...baseObject,
        behavior: {
          movement: { mode: "drag", step: 25 },
          free_drag: { enabled: true },
        },
      }),
    ).toBe(true);

    expect(
      isObjectInteractive({
        ...baseObject,
        behavior: {
          movement: { mode: "none" },
          rotation: { step: 90 },
          free_drag: { enabled: false },
        },
      }),
    ).toBe(true);
  });
});

describe("LayoutTaskRenderer control layout", () => {
  it("keeps controls closer to small objects than the legacy fixed gap", () => {
    const config = createRuntimeConfig();
    const ui = getStageUiMetrics(config);
    const bounds = { minX: -10, maxX: 10, minY: -10, maxY: 10 };

    const layout = getObjectControlLayout({
      bounds,
      ui,
    });

    expect(layout.move_right.x - bounds.maxX).toBeLessThan(ui.controlGap);
    expect(layout.move_right.x - bounds.maxX).toBeGreaterThanOrEqual(20 * ui.scale);
  });

  it("places rotation controls farther from the object than movement controls", () => {
    const config = createRuntimeConfig();
    const ui = getStageUiMetrics(config);
    const bounds = { minX: -50, maxX: 50, minY: -40, maxY: 40 };

    const layout = getObjectControlLayout({
      bounds,
      ui,
    });

    expect(bounds.minY - layout.rotate_ccw.y).toBeGreaterThan(bounds.minY - layout.move_up.y);
    expect(layout.rotate_cw.x - bounds.maxX).toBeGreaterThan(layout.move_right.x - bounds.maxX);
  });

  it("keeps directional control positions distinct near stage edges", () => {
    const config = createRuntimeConfig();
    const ui = getStageUiMetrics(config);
    const bounds = { minX: 470, maxX: 500, minY: -500, maxY: -470 };

    const layout = getObjectControlLayout({
      bounds,
      ui,
    });

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    expect(layout.move_up.x).toBe(centerX);
    expect(layout.move_up.y).toBeLessThan(bounds.minY);
    expect(layout.move_right.x).toBeGreaterThan(bounds.maxX);
    expect(layout.move_right.y).toBe(centerY);
    expect(layout.rotate_ccw.x).toBeLessThan(bounds.minX);
    expect(layout.rotate_ccw.y).toBeLessThan(bounds.minY);
    expect(layout.rotate_cw.x).toBeGreaterThan(bounds.maxX);
    expect(layout.rotate_cw.y).toBeLessThan(bounds.minY);
    expect(`${layout.move_up.x},${layout.move_up.y}`).not.toBe(`${layout.rotate_cw.x},${layout.rotate_cw.y}`);
    expect(`${layout.move_right.x},${layout.move_right.y}`).not.toBe(`${layout.rotate_cw.x},${layout.rotate_cw.y}`);
  });

  it("does not move controls away from their expected positions when far from edges", () => {
    const config = createRuntimeConfig();
    const ui = getStageUiMetrics(config);
    const bounds = { minX: -50, maxX: 50, minY: -40, maxY: 40 };

    const layout = getObjectControlLayout({
      bounds,
      ui,
    });

    expect(layout.move_up.x).toBe(0);
    expect(layout.move_down.x).toBe(0);
    expect(layout.move_left.y).toBe(0);
    expect(layout.move_right.y).toBe(0);
  });
});
