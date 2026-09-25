import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRuntimeConfig } from "../test-support/runtime-config";
import {
  getConfiguredObjectLocalRect,
  getBackgroundDisplayTransform,
  getControlButtonTransform,
  getControlHotzoneBounds,
  getLimitFeedbackTransform,
  getObjectControlLayout,
  getObjectControlRingLayout,
  getObjectVisualDisplayTransform,
  getPlayerIconUrl,
  getRotatedVisualBounds,
  getStageDisplayTransform,
  getStageFitStyle,
  getStageUiMetrics,
  getViewportCameraTransform,
  clampViewportZoom,
  DEFAULT_VIEWPORT_ZOOM,
  isObjectInteractive,
  getTrialHeaderContent,
} from "./renderer";

describe("LayoutTaskRenderer trial header", () => {
  it("uses a large trial label before the scene identifier", () => {
    expect(getTrialHeaderContent({
      tutorialMode: false,
      taskId: "scene_be84fc97a8d1",
      qid: "Q_scene_be84fc97a8d1",
      objectCount: 4,
      presentation: { trialIndex: 2, trialTotal: 25 } as never,
    })).toEqual({
      title: "Trial 2 / 25",
      meta: "scene_be84fc97a8d1 - QID: Q_scene_be84fc97a8d1 - Objects: 4",
    });
  });

  it("labels tutorial trials as Tutorial instead of giving them a formal trial number", () => {
    expect(getTrialHeaderContent({
      tutorialMode: true,
      taskId: "scene_edc634ac7856",
      qid: "Q_scene_edc634ac7856",
      objectCount: 4,
    })).toEqual({
      title: "Tutorial",
      meta: "scene_edc634ac7856 - QID: Q_scene_edc634ac7856 - Objects: 4",
    });
  });
});

describe("persistent reference display", () => {
  it("keeps the reference frame visible during reconstruction", () => {
    const source = readFileSync(new URL("./renderer.ts", import.meta.url), "utf8");

    expect(source).toContain("setDisplayImageVisible(referenceMode === \"persistent\")");
    expect(source).toContain("is-persistent-reference");
  });

  it("directs missing-submission feedback to the status prompt, not confidence controls", () => {
    const source = readFileSync(new URL("./renderer.ts", import.meta.url), "utf8");

    expect(source).toContain("const targets = [this.refs.statusElement, this.refs.confirmButton]");
    expect(source).toContain("target.classList.add(\"is-submit-attention\")");
  });
});

describe("LayoutTaskRenderer stage fit", () => {
  it("uses a 30 percent default zoom", () => {
    expect(DEFAULT_VIEWPORT_ZOOM).toBe(1.3);
  });

  it("clamps viewport zoom to the supported range", () => {
    expect(clampViewportZoom(0.1)).toBe(0.75);
    expect(clampViewportZoom(1.5)).toBe(1.5);
    expect(clampViewportZoom(4)).toBe(3);
  });

  it("builds a camera transform without changing the world viewBox", () => {
    const config = createRuntimeConfig();
    expect(getViewportCameraTransform(config, 2, { x: 100, y: -50 })).toBe(
      "translate(100 -50) scale(2) translate(0 0)",
    );
  });

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
        background_flip_y: false,
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

  it("can flip only the background artwork around its configured bounds", () => {
    const config = createRuntimeConfig({
      background: {
        ...createRuntimeConfig().background,
        y: -200,
        height: 42400,
      },
      stage: {
        ...createRuntimeConfig().stage,
        background_flip_y: true,
      },
    });

    expect(getBackgroundDisplayTransform(config)).toBe("translate(0 42000) scale(1 -1)");
  });

  it("resolves player UI icons from the app assets instead of the task package base", () => {
    expect(getPlayerIconUrl("arrow-up.svg", "http://example.test/?base=/layout-task-smallpack/")).toBe(
      "http://example.test/layout-task/assets/icons/arrow-up.svg",
    );
    expect(getPlayerIconUrl("rotate-cw.svg", "http://example.test/experiment/")).toBe(
      "http://example.test/experiment/layout-task/assets/icons/rotate-cw.svg",
    );
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
  it("keeps control hotzones inert until their object is active", () => {
    const css = readFileSync("src/styles/layout-task.css", "utf8").replace(/\r\n/g, "\n");

    expect(css).toContain(".layout-task-controls-hotzone {\n  fill: transparent;\n  pointer-events: none;");
    expect(css).toContain(".layout-task-controls.is-active .layout-task-controls-hotzone {\n  pointer-events: all;");
  });

  it("uses the active control hotzone hover to show and hide controls", () => {
    const renderer = readFileSync("src/core/renderer.ts", "utf8");

    expect(renderer).toContain('group.addEventListener("pointerenter", () => {');
    expect(renderer).toContain('group.addEventListener("pointerleave", () => {');
    expect(renderer).toContain("scheduleActiveControlsHide");
    expect(renderer).toContain("Leaving the object never exits edit mode.");
  });

  it("adds viewport zoom controls and reserves right-drag for panning", () => {
    const renderer = readFileSync("src/core/renderer.ts", "utf8");

    expect(renderer).toContain('this.createViewportButton("+", "Zoom in"');
    expect(renderer).toContain('this.createViewportButton("−", "Zoom out"');
    expect(renderer).toContain('this.createViewportButton("↺", "Reset view"');
    expect(renderer).toContain("event.button !== 2");
    expect(renderer).toContain("preventDefault()");
  });

  it("keeps control geometry tied to compiled asset dimensions", () => {
    const renderer = readFileSync("src/core/renderer.ts", "utf8");

    expect(renderer).toContain("Use the compiled asset dimensions as the stable control-frame geometry.");
    expect(renderer).toContain("getConfiguredObjectLocalRect({");
    expect(renderer).not.toContain("Prefer measured SVG bounds when available");
  });

  it("recalculates controls after the SVG is attached", () => {
    const renderer = readFileSync("src/core/renderer.ts", "utf8");

    expect(renderer).toContain("The SVG must be attached before measuring screen scale.");
    expect(renderer).toContain("for (const objectConfig of this.options.config.objects) {");
    expect(renderer).toContain("this.updateControlsLayout(objectConfig.id);");
  });

  it("resynchronizes controls after the preview image leaves the layout", () => {
    const renderer = readFileSync("src/core/renderer.ts", "utf8");

    expect(renderer).toContain("this.scheduleControlsLayoutSync();");
    expect(renderer).toContain("Hiding the reference image can change the workspace layout.");
    expect(renderer).toContain("window.requestAnimationFrame(update)");
  });

  it("highlights required confidence until a rating is chosen", () => {
    const renderer = readFileSync("src/core/renderer.ts", "utf8");
    const css = readFileSync("src/styles/layout-task.css", "utf8");

    expect(renderer).toContain('this.refs.confidenceElement.classList.add("is-required");');
    expect(renderer).toContain('this.refs.confidenceElement?.classList.remove("is-required");');
    expect(css).toContain(".layout-task-confidence.is-required");
  });

  it("uses an explicit confidence save action and a concise confirm label", () => {
    const renderer = readFileSync("src/core/renderer.ts", "utf8");
    const messages = readFileSync("src/core/messages.ts", "utf8");

    expect(renderer).toContain('confirmButton.textContent = "Confirm";');
    expect(renderer).toContain('saveButton.textContent = "Save";');
    expect(renderer).toContain("saveButton.disabled = true;");
    expect(renderer).toContain("confidence.onSave();");
    expect(messages).toContain("Choose a confidence rating, then select Save to finish editing this furniture group.");
  });

  it("places every control button on one circle around the object center", () => {
    const config = createRuntimeConfig();
    const ui = getStageUiMetrics(config);
    const bounds = { minX: -10, maxX: 10, minY: -10, maxY: 10 };

    const layout = getObjectControlLayout({
      bounds,
      ui,
    });
    const ring = getObjectControlRingLayout(bounds, ui);

    for (const point of Object.values(layout)) {
      expect(Math.hypot(point.x - ring.centerX, point.y - ring.centerY)).toBeCloseTo(ring.radius, 6);
    }
  });

  it("keeps the control ring outside the object's visual bounds", () => {
    const config = createRuntimeConfig();
    const ui = getStageUiMetrics(config);
    const bounds = { minX: -50, maxX: 50, minY: -40, maxY: 40 };

    const ring = getObjectControlRingLayout(bounds, ui);
    expect(ring.radius).toBe(ui.controlRingRadius);
    expect(ring.radius).toBeGreaterThan(0);
  });

  it("uses one control-ring radius for differently sized objects", () => {
    const config = createRuntimeConfig();
    const ui = getStageUiMetrics(config);
    const smallRing = getObjectControlRingLayout({ minX: -50, maxX: 50, minY: -40, maxY: 40 }, ui);
    const largeRing = getObjectControlRingLayout({ minX: -500, maxX: 500, minY: -400, maxY: 400 }, ui);

    expect(largeRing.radius).toBe(smallRing.radius);
  });

  it("rotates all controls around the object center by the initial local axis", () => {
    const config = createRuntimeConfig();
    const ui = getStageUiMetrics(config);
    const bounds = { minX: -50, maxX: 50, minY: -40, maxY: 40 };
    const unrotated = getObjectControlLayout({ bounds, ui });
    const rotated = getObjectControlLayout({ bounds, ui, movementRotationDeg: 45 });
    const rightDistance = unrotated.move_right.x;
    const upDistance = -unrotated.move_up.y;
    const rotateCwDistanceX = unrotated.rotate_cw.x;
    const rotateCwDistanceY = unrotated.rotate_cw.y;

    expect(rotated.move_right.x).toBeCloseTo(rightDistance / Math.sqrt(2), 6);
    expect(rotated.move_right.y).toBeCloseTo(rightDistance / Math.sqrt(2), 6);
    expect(rotated.move_up.x).toBeCloseTo(upDistance / Math.sqrt(2), 6);
    expect(rotated.move_up.y).toBeCloseTo(-upDistance / Math.sqrt(2), 6);
    expect(rotated.rotate_cw.x).toBeCloseTo((rotateCwDistanceX - rotateCwDistanceY) / Math.sqrt(2), 6);
    expect(rotated.rotate_cw.y).toBeCloseTo((rotateCwDistanceX + rotateCwDistanceY) / Math.sqrt(2), 6);
  });

  it("rotates every control button icon by the local axis angle", () => {
    expect(getControlButtonTransform("move_right", { x: 10, y: 20 }, 45)).toBe("translate(10 20) rotate(45)");
    expect(getControlButtonTransform("rotate_cw", { x: 10, y: 20 }, 45)).toBe("translate(10 20) rotate(45)");
  });

  it("uses the initial object rotation to orient control chrome", () => {
    const renderer = readFileSync("src/core/renderer.ts", "utf8");

    expect(renderer).toContain("const movementRotationDeg = objectConfig?.rotation ?? 0;");
    expect(renderer).not.toContain("const movementRotationDeg = this.options.store.getObjectState(objectId).r;");
  });

  it("rotates movement limit feedback around the reachable area center", () => {
    expect(getLimitFeedbackTransform({ x: -10, y: 20, width: 40, height: 60 }, 45)).toBe("rotate(45 10 50)");
    expect(getLimitFeedbackTransform({ x: -10, y: 20, width: 40, height: 60 }, 0)).toBeUndefined();
  });

  it("wraps all control buttons in a solid hotzone bounds", () => {
    const positions = {
      move_up: { x: 0, y: -10 },
      move_down: { x: 0, y: 10 },
      move_left: { x: -20, y: 0 },
      move_right: { x: 30, y: 0 },
      rotate_ccw: { x: -25, y: -25 },
      rotate_cw: { x: 35, y: -25 },
    };

    expect(getControlHotzoneBounds(positions, 4, 2)).toEqual({
      x: -31,
      y: -31,
      width: 72,
      height: 47,
    });
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
