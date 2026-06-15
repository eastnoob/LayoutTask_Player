import { describe, expect, it } from "vitest";
import { createRuntimeConfig } from "../test-support/runtime-config";
import { getConfiguredObjectLocalRect, getRotatedVisualBounds, getStageFitStyle, getStageUiMetrics } from "./renderer";

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

  it("computes control bounds from rotated visual extents", () => {
    const bounds = getRotatedVisualBounds(getConfiguredObjectLocalRect({ width: 400, height: 240, anchor: "center" }), 90);

    expect(bounds.minX).toBeCloseTo(-120);
    expect(bounds.maxX).toBeCloseTo(120);
    expect(bounds.minY).toBeCloseTo(-200);
    expect(bounds.maxY).toBeCloseTo(200);
  });
});
