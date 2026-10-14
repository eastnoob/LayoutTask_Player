import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createRuntimeConfig } from "../test-support/runtime-config";
import {
  LayoutTaskRenderer,
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
  getTutorialViewingDirectionGeometry,
  scrollTutorialStageIntoView,
  getStageUiMetrics,
  getViewportCameraTransform,
  clampViewportZoom,
  getMagnifierLensGeometry,
  DEFAULT_VIEWPORT_ZOOM,
  isObjectInteractive,
  getTrialHeaderContent,
} from "./renderer";
import { StateStore } from "./state-store";
import { ConfidenceController } from "./confidence-controller";
import { InteractionController } from "./interaction-controller";
import { TutorialController } from "./tutorial-controller";
import { MagnifierController } from "./magnifier-controller";

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
  it("keeps the default camera transform when viewport controls are observation-only", () => {
    const dom = installRendererDom();
    const config = createRuntimeConfig({ objects: [] });
    const renderer = new LayoutTaskRenderer({
      root: new TestElement("main") as unknown as HTMLElement,
      config,
      store: new StateStore(config),
    });

    try {
      const refs = renderer.mount();

      expect(refs.cameraLayer?.getAttribute("transform")).toBe(
        getViewportCameraTransform(config, DEFAULT_VIEWPORT_ZOOM, { x: 0, y: 0 }),
      );
    } finally {
      renderer.destroy();
      dom.restore();
    }
  });

  it.each(["en-US", "zh-CN"] as const)("counts pending objects through edits and clears their glow after the first successful Save (%s)", (locale) => {
    const base = createRuntimeConfig();
    const config = createRuntimeConfig({
      objects: [{
        ...base.objects[0],
        role: "variable",
        group_id: "chair_group",
        behavior: {
          ...base.objects[0].behavior,
          movement: { ...base.objects[0].behavior.movement, mode: "drag" },
          free_drag: { enabled: true, snap: true },
        },
        asset: { ...base.objects[0].asset, inlineSvgText: undefined },
      }],
    });
    const dom = installRendererDom();
    const root = new TestElement("main");
    const store = new StateStore(config);
    const confidenceController = new ConfidenceController({ config, required: true, scale: [1, 2] });
    let controller: InteractionController;
    const renderer = new LayoutTaskRenderer({
      root: root as unknown as HTMLElement,
      config,
      store,
      locale,
      confidence: {
        scale: [1, 2],
        labels: { "1": "low", "2": "high" },
        onChoose: (dimension, value) => confidenceController.choose(dimension, value),
        onSave: () => controller.saveActiveConfidence(),
      },
      isObjectFirstSaveComplete: (objectId) => {
        const groupId = config.objects.find((object) => object.id === objectId)?.group_id ?? objectId;
        return confidenceController.getFinalConfidence()[groupId] !== undefined;
      },
      onObjectSelect: (objectId) => controller.selectObject(objectId),
      onAction: (objectId, action) => controller.requestAction({ objectId, action }),
      onDragStart: (objectId, pointer) => controller.requestDragStart({ objectId, pointer }),
      onDragMove: (objectId, pointer) => controller.requestDragMove({ objectId, pointer }),
      onDragEnd: (objectId, pointer) => controller.requestDragEnd({ objectId, pointer }),
      onDragCancel: (objectId, pointer) => controller.requestDragCancel({ objectId, pointer }),
    });
    controller = new InteractionController({
      config,
      store,
      renderer,
      recorder: { recordEvent: vi.fn((event) => ({ ...event, i: 0, t: 0 })) },
      confidence: {
        canEnterObjectEdit: (objectId) => confidenceController.canEnterObjectEdit(objectId),
        enterObjectEdit: (objectId) => confidenceController.enterObjectEdit(objectId),
        canLeaveActiveGroup: () => confidenceController.canLeaveActiveGroup(),
        saveActiveGroup: () => confidenceController.saveActiveGroup(),
      },
    });

    try {
      const refs = renderer.mount();
      controller.bind();
      const objectId = "chair_01";
      const visual = refs.objectVisualElements.get(objectId)! as unknown as TestElement;
      const object = refs.objectElements.get(objectId)! as unknown as TestElement;

      expect(refs.confirmButton?.textContent).toBe(locale === "zh-CN" ? "Confirm · 剩余 1/1" : "Confirm · 1/1 left");
      expect(visual.classList.contains("is-pending")).toBe(true);
      object.dispatch("click", { stopPropagation: vi.fn() });
      controller.saveActiveConfidence();
      expect(refs.confirmButton?.textContent).toBe(locale === "zh-CN" ? "Confirm · 剩余 1/1" : "Confirm · 1/1 left");
      expect(visual.classList.contains("is-pending")).toBe(true);

      const rotateButton = refs.controlButtons.get(objectId)!.get("rotate_cw")! as unknown as TestElement;
      rotateButton.dispatch("click", { stopPropagation: vi.fn() });
      expect(visual.classList.contains("is-pending")).toBe(true);

      object.dispatch("pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
      object.dispatch("pointermove", { pointerId: 1, clientX: 25, clientY: 0 });
      object.dispatch("pointerup", { pointerId: 1, clientX: 25, clientY: 0 });
      expect(visual.classList.contains("is-pending")).toBe(true);

      const confidence = refs.confidenceElement! as unknown as TestElement;
      const confidenceButtons = confidence.querySelectorAll(".layout-task-confidence-button");
      confidenceButtons[0].click();
      confidenceButtons[2].click();
      expect(visual.classList.contains("is-pending")).toBe(true);
      expect(refs.confirmButton?.textContent).toBe(locale === "zh-CN" ? "Confirm · 剩余 1/1" : "Confirm · 1/1 left");

      confidence.querySelector(".layout-task-confidence-save")!.click();
      expect(visual.classList.contains("is-pending")).toBe(false);
      expect(refs.confirmButton?.textContent).toBe("Confirm ★");

      object.dispatch("click", { stopPropagation: vi.fn() });
      expect(visual.classList.contains("is-pending")).toBe(false);
      expect(refs.confirmButton?.textContent).toBe("Confirm ★");
    } finally {
      renderer.destroy();
      dom.restore();
    }
  });

  it("counts required furniture groups once and ignores fixed objects", () => {
    const base = createRuntimeConfig().objects[0];
    const config = createRuntimeConfig({ objects: [
      { ...base, id: "chair", group_id: "chairs", role: "variable" as const },
      { ...base, id: "second_chair", group_id: "chairs", role: "variable" as const },
      { ...base, id: "table", group_id: "table", role: "variable" as const },
      { ...base, id: "fixed_chair", group_id: "fixed", role: "fixed" as const },
    ].map((object) => ({ ...object, asset: { ...object.asset, inlineSvgText: undefined } })) });
    const dom = installRendererDom();
    const confidence = new ConfidenceController({ config, required: true, scale: [1, 2] });
    const renderer = new LayoutTaskRenderer({ root: new TestElement("main") as unknown as HTMLElement,
      config, store: new StateStore(config),
      confidence: { scale: [1, 2], labels: {}, onChoose: (dimension, value) => confidence.choose(dimension, value), onSave: () => confidence.saveActiveGroup() },
      isObjectFirstSaveComplete: (id) => confidence.getFinalConfidence()[config.objects.find((object) => object.id === id)!.group_id!] !== undefined });
    try {
      const refs = renderer.mount();
      expect(refs.confirmButton?.textContent).toBe("Confirm · 2/2 left");
      for (const [id, expected] of [["chair", "Confirm · 1/2 left"], ["second_chair", "Confirm · 1/2 left"], ["table", "Confirm ★"]]) {
        confidence.enterObjectEdit(id);
        confidence.choose("position", 1); confidence.choose("rotation", 2);
        confidence.saveActiveGroup();
        renderer.clearActiveObject();
        expect(refs.confirmButton?.textContent).toBe(expected);
      }
      expect(refs.confirmButton?.getAttribute("aria-label")).toBe("Confirm: all furniture groups have been saved");
    } finally { renderer.destroy(); dom.restore(); }
  });

  it("remeasures pending glow when the tutorial returns from a hidden board and after resize", () => {
    const dom = installRendererDom();
    const bounds = vi.spyOn(TestElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 0, height: 0, left: 0, top: 0, bottom: 0 });
    const base = createRuntimeConfig();
    const config = createRuntimeConfig({ objects: base.objects.map(object => ({ ...object, role: "variable" as const, asset: { ...object.asset, inlineSvgText: undefined } })) });
    const renderer = new LayoutTaskRenderer({ root: new TestElement("main") as unknown as HTMLElement,
      config, store: new StateStore(config), isObjectFirstSaveComplete: () => false });
    try {
      const refs = renderer.mount();
      const svg = refs.svg as unknown as TestElement;
      const camera = refs.cameraLayer as unknown as TestElement;
      const filter = svg.querySelector(".layout-task-pending-glow-filter")!;
      expect(filter).not.toBeNull();
      const blur = () => Number(filter.querySelector("feDropShadow")!.getAttribute("stdDeviation"));
      const resize = vi.mocked(window.addEventListener).mock.calls.find(([name]) => name === "resize")![1] as () => void;
      vi.spyOn(svg, "getScreenCTM").mockReturnValue({ a: 1, inverse: () => ({ a: 1 }) });
      vi.spyOn(camera, "getScreenCTM").mockReturnValue({ a: 0.026, inverse: () => ({ a: 1 / 0.026 }) });
      expect(blur()).toBe(0);
      expect((refs.objectVisualElements.get("chair_01")! as unknown as TestElement).style["--layout-task-pending-glow-filter"]).toBeUndefined();
      bounds.mockReturnValue({ width: 800, height: 600, left: 0, top: 0, bottom: 600 });
      renderer.showTutorialStep({ id: "view_direction", anchor: "viewport-tools", task: "Confirm the viewing direction.", message: "The board is now closed." });
      expect(blur()).toBeCloseTo(153.8461538);
      expect((refs.objectVisualElements.get("chair_01")! as unknown as TestElement).style["--layout-task-pending-glow-filter"]).toBe("url(#layout-task-pending-glow-chair_01)");
      vi.mocked(camera.getScreenCTM).mockReturnValue({ a: 0.013, inverse: () => ({ a: 1 / 0.013 }) });
      resize();
      expect(blur()).toBeCloseTo(307.6923077);
      expect(Number(filter.getAttribute("width"))).toBeGreaterThan(config.objects[0].width + 2000);
    } finally { bounds.mockRestore(); renderer.destroy(); dom.restore(); }
  });

  it("clears the previous task's root locks on teardown", () => {
    const dom = installRendererDom();
    const root = new TestElement("main");
    root.classList.add("layout-task-locked", "layout-task-tutorial-interaction-locked", "jspsych-content");
    const renderer = new LayoutTaskRenderer({ root: root as unknown as HTMLElement,
      config: createRuntimeConfig(), store: new StateStore(createRuntimeConfig()) });
    try {
      renderer.destroy();
      expect(root.classList.contains("layout-task-locked")).toBe(false);
      expect(root.classList.contains("layout-task-tutorial-interaction-locked")).toBe(false);
      expect(root.classList.contains("jspsych-content")).toBe(true);
    } finally { dom.restore(); }
  });

  it("starts a new trial on a reused root without inherited tutorial locks", () => {
    const dom = installRendererDom();
    const root = new TestElement("main");
    root.classList.add("layout-task-locked", "layout-task-tutorial-interaction-locked", "jspsych-content");
    const config = createRuntimeConfig({ objects: [] });
    const renderer = new LayoutTaskRenderer({ root: root as unknown as HTMLElement, config, store: new StateStore(config) });
    try {
      renderer.mount();
      expect(root.classList.contains("layout-task-locked")).toBe(false);
      expect(root.classList.contains("layout-task-tutorial-interaction-locked")).toBe(false);
      expect(root.classList.contains("jspsych-content")).toBe(true);
    } finally { renderer.destroy(); dom.restore(); }
  });

  it("renders approved yellow-object emphasis and suppresses the generic edit instruction", () => {
    const source = readFileSync(new URL("./renderer.ts", import.meta.url), "utf8");

    expect(source).toContain('renderTutorialMarkup(taskElement, task);');
    expect(source).toContain("yellow objects?");
    expect(source).toContain("[[warning]]");
    expect(source).toContain("layout-task-tutorial-warning");
    expect(source).toContain('instruction.hidden = true;');
    expect(source).toContain('instruction.textContent = "";');
  });

  it("keeps the reference frame visible during reconstruction", () => {
    const source = readFileSync(new URL("./renderer.ts", import.meta.url), "utf8");

    expect(source).toContain("setDisplayImageVisible(referenceMode === \"persistent\")");
    expect(source).toContain("is-persistent-reference");
  });

  it("renders each tutorial task as the first independent paragraph", () => {
    const source = readFileSync(new URL("./renderer.ts", import.meta.url), "utf8");

    expect(source).toContain('const taskElement = document.createElement("p");');
    expect(source).toContain('taskElement.className = "layout-task-tutorial-task";');
    expect(source).toContain('renderTutorialMessage(message, step.task, step.message);');
    expect(source).toContain("messageContainer.append(taskElement, body);");
  });

  it("keeps tutorial task styling readable on narrow Safari viewports", () => {
    const css = readFileSync(new URL("../styles/layout-task.css", import.meta.url), "utf8");

    expect(css).toContain(".layout-task-tutorial-task {");
    expect(css).toContain(".layout-task-tutorial-warning {");
    expect(css).toContain("-webkit-overflow-scrolling: touch;");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).toContain(".layout-task-tutorial-task {");
  });

  it("directs missing-submission feedback to the status prompt, not confidence controls", () => {
    const source = readFileSync(new URL("./renderer.ts", import.meta.url), "utf8");

    expect(source).toContain("const targets = [this.refs.statusElement, this.refs.confirmButton]");
    expect(source).toContain("target.classList.add(\"is-submit-attention\")");
  });

  it("provides Chinese confidence copy for the Chinese player", () => {
    const source = readFileSync(new URL("./renderer.ts", import.meta.url), "utf8");

    expect(source).toContain('locale?: "en-US" | "zh-CN"');
    expect(source).toContain("选择这个家具组的置信度");
  });

  it("provides a Chinese developer shortcut label for the Chinese player", () => {
    const source = readFileSync(new URL("./renderer.ts", import.meta.url), "utf8");

    expect(source).toContain('chinese ? "开发者：填写默认结果"');
    expect(source).toContain('"Developer: fill default result"');
    expect(source).toContain('"通过正常交互流程填写默认位置、旋转和置信度"');
    expect(source).toContain('"Fill default poses and confidence through the normal interaction flow"');
  });
});

describe("LayoutTaskRenderer stage fit", () => {
  it("shows the direction arrow after the board, then clears it immediately while retaining the practice lock", () => {
    const config = createRuntimeConfig();
    const tutorial = new TutorialController("persistent", "en-US", { referenceBoardRequired: true });
    const direction = { classList: { toggle: vi.fn() } };
    const acknowledge = { toggleAttribute: vi.fn() };
    const confirm = { disabled: false };
    const root = { classList: { toggle: vi.fn() }, querySelector: vi.fn(() => null), querySelectorAll: () => [] };
    const renderer = new LayoutTaskRenderer({ root: root as unknown as HTMLElement, config,
      store: new StateStore(config), isInteractionBlocked: () => tutorial.isInteractionBlocked() });
    Object.assign(renderer.refs, {
      tutorialViewingDirectionElement: direction, tutorialBubbleButtonElement: acknowledge, confirmButton: confirm,
      tutorialBubbleElement: { hidden: true, dataset: {} }, tutorialBubbleMessageElement: { replaceChildren: vi.fn(), append: vi.fn() },
    });
    vi.stubGlobal("document", { createElement: () => ({ append: vi.fn() }), createTextNode: (text: string) => text });
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    try {
      tutorial.handle("reconstruction_started"); renderer.showTutorialStep(tutorial.getCurrentStep());
      expect(direction.classList.toggle).toHaveBeenLastCalledWith("is-visible", false);
      expect(acknowledge.toggleAttribute).toHaveBeenLastCalledWith("hidden", true);
      expect(confirm.disabled).toBe(true);
      tutorial.handle("reference_board_completed"); renderer.showTutorialStep(tutorial.getCurrentStep());
      expect(direction.classList.toggle).toHaveBeenLastCalledWith("is-visible", true);
      expect(acknowledge.toggleAttribute).toHaveBeenLastCalledWith("hidden", false);
      tutorial.handle("view_direction_acknowledged"); renderer.showTutorialStep(tutorial.getCurrentStep());
      expect(direction.classList.toggle).toHaveBeenLastCalledWith("is-visible", false);
      expect(acknowledge.toggleAttribute).toHaveBeenLastCalledWith("hidden", true);
      expect(confirm.disabled).toBe(true);
      tutorial.handle("magnifier_entered");
      tutorial.handle("magnifier_zoom_changed", { zoomBefore: 2, zoomAfter: 2.25 });
      tutorial.handle("magnifier_exited", { exitReason: "escape" }); renderer.showTutorialStep(tutorial.getCurrentStep());
      expect(direction.classList.toggle).toHaveBeenLastCalledWith("is-visible", false);
      expect(confirm.disabled).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });

  it("keeps the Pause highlight separate from the direction arrow lifecycle", () => {
    const source = readFileSync(new URL("./renderer.ts", import.meta.url), "utf8");
    const css = readFileSync(new URL("../styles/layout-task.css", import.meta.url), "utf8");

    expect(source).toContain('this.refs.tutorialViewingDirectionElement?.classList.toggle("is-visible", step.id === "view_direction");');
    expect(source).toContain("this.setTutorialAttention(step.anchor);");
    expect(css).toContain(".layout-task-pause-button.is-tutorial-attention");
    expect(css).toContain(".layout-task-pause-button.is-tutorial-attention::after");
  });

  it("waits for layout before centering the floor plan during the viewing-direction tutorial step", () => {
    const scrollBy = vi.fn();
    const root = {
      querySelector: vi.fn(() => ({
        getBoundingClientRect: () => ({ top: 500, bottom: 700 }),
      })),
    } as unknown as HTMLElement;
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("window", { innerHeight: 600, scrollBy });
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);

    try {
      scrollTutorialStageIntoView(root, "view_direction");

      expect(root.querySelector).toHaveBeenCalledWith(".layout-task-tutorial-viewing-direction-arrow");
      expect(requestAnimationFrame).toHaveBeenCalledOnce();
      expect(scrollBy).toHaveBeenCalledWith(0, 300);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not scroll for other tutorial steps", () => {
    const scrollBy = vi.fn();
    const root = {
      querySelector: vi.fn(() => ({ getBoundingClientRect: vi.fn() })),
    } as unknown as HTMLElement;

    scrollTutorialStageIntoView(root, "select_first");

    expect(root.querySelector).not.toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("points the tutorial viewing arrow upward from the bottom center of the stage", () => {
    const config = createRuntimeConfig({
      world: {
        viewBox: { x: -100, y: 20, width: 800, height: 600 },
        origin: { x: 0, y: 0 },
        grid: { size: 10, visible: false, snap: true },
      },
    });

    expect(getTutorialViewingDirectionGeometry(config)).toEqual({
      originX: 300,
      originY: 566,
      tipX: 300,
      tipY: 440,
      wingLeftX: 276,
      wingY: 470,
      wingRightX: 324,
    });
  });

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

type TestListener = (event: Record<string, unknown>) => void;

class TestClassList {
  constructor(private readonly element: TestElement) {}

  add(...names: string[]): void {
    const values = new Set(this.element.className.split(/\s+/).filter(Boolean));
    names.forEach((name) => values.add(name));
    this.element.className = Array.from(values).join(" ");
  }

  remove(...names: string[]): void {
    const removed = new Set(names);
    this.element.className = this.element.className
      .split(/\s+/)
      .filter((name) => name && !removed.has(name))
      .join(" ");
  }

  toggle(name: string, force?: boolean): boolean {
    const present = this.contains(name);
    const next = force ?? !present;
    if (next) this.add(name);
    else this.remove(name);
    return next;
  }

  contains(name: string): boolean {
    return this.element.className.split(/\s+/).includes(name);
  }
}

class TestElement {
  readonly children: Array<TestElement | string> = [];
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly style = { setProperty: (name: string, value: string) => { this.style[name] = value; } } as
    Record<string, string> & { setProperty(name: string, value: string): void };
  readonly classList = new TestClassList(this);
  readonly listeners = new Map<string, TestListener[]>();
  readonly nodeType = 1;
  readonly nodeName: string;
  readonly tagName: string;
  readonly viewBox = { baseVal: { width: 1000, height: 1000 } };
  parentElement: TestElement | undefined;
  hidden = false;
  disabled = false;
  readOnly = false;
  value = "";
  src = "";
  alt = "";
  type = "";
  private ownText = "";
  private classValue = "";
  private capturedPointerIds = new Set<number>();

  constructor(tagName: string) {
    this.tagName = tagName;
    this.nodeName = tagName;
  }

  get className(): string {
    return this.classValue;
  }

  set className(value: string) {
    this.classValue = value;
  }

  get textContent(): string {
    return this.ownText + this.children.map((child) => typeof child === "string" ? child : child.textContent).join("");
  }

  set textContent(value: string | null) {
    this.ownText = value ?? "";
    this.children.length = 0;
  }

  set innerHTML(value: string) {
    if (value === "") this.replaceChildren();
  }

  append(...children: Array<TestElement | string>): void {
    for (const child of children) {
      if (typeof child !== "string") child.parentElement = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children: Array<TestElement | string>): void {
    this.children.length = 0;
    this.append(...children);
  }

  insertBefore(child: TestElement, reference: TestElement | null): void {
    child.parentElement = this;
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === "class") this.className = value;
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  toggleAttribute(name: string, force = this.getAttribute(name) === null): boolean {
    if (force) this.setAttribute(name, "");
    else this.attributes.delete(name);
    if (name === "hidden") this.hidden = force;
    return force;
  }

  addEventListener(type: string, listener: TestListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(type: string, listener: TestListener): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener));
  }

  dispatch(type: string, event: Record<string, unknown> = {}): void {
    const dispatched = {
      ...event,
      type,
      target: this,
      currentTarget: this,
      stopPropagation: event.stopPropagation ?? (() => undefined),
      preventDefault: event.preventDefault ?? (() => undefined),
    };
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(dispatched);
  }

  click(): void {
    if (!this.disabled) this.dispatch("click");
  }

  focus(): void { (document as unknown as TestDocument).activeElement = this; }

  contains(element: TestElement): boolean {
    return this === element || this.children.some((child) => typeof child !== "string" && child.contains(element));
  }

  setPointerCapture(pointerId: number): void {
    this.capturedPointerIds.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.capturedPointerIds.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.capturedPointerIds.delete(pointerId);
  }

  getBoundingClientRect(): { width: number; height: number; left: number; top: number; bottom: number } {
    return { width: 800, height: 600, left: 0, top: 0, bottom: 600 };
  }

  getScreenCTM(): { a: number; inverse(): { a: number } } {
    const matrix = { a: 1, inverse: () => matrix };
    return matrix;
  }

  createSVGPoint(): { x: number; y: number; matrixTransform(): { x: number; y: number } } {
    const point = { x: 0, y: 0, matrixTransform: () => point };
    return point;
  }

  querySelector<T extends TestElement = TestElement>(selector: string): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }

  querySelectorAll<T extends TestElement = TestElement>(selector: string): T[] {
    const matches: T[] = [];
    for (const child of this.children) {
      if (typeof child === "string") continue;
      if (child.matches(selector)) matches.push(child as T);
      matches.push(...child.querySelectorAll<T>(selector));
    }
    return matches;
  }

  matches(selector: string): boolean {
    if (selector === "*") return true;
    const tag = selector.match(/^[a-z]+/i)?.[0];
    if (tag && this.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    for (const className of selector.match(/\.[a-z0-9_-]+/gi) ?? []) {
      if (!this.classList.contains(className.slice(1))) return false;
    }
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) {
      const value = this.getAttribute(attribute[1]);
      if (value === null || (attribute[2] !== undefined && value !== attribute[2])) return false;
    }
    return Boolean(tag || selector.startsWith(".") || attribute);
  }

  remove(): void {
    const index = this.parentElement?.children.indexOf(this) ?? -1;
    if (index >= 0) this.parentElement?.children.splice(index, 1);
  }
}

class TestDocument {
  activeElement: TestElement | undefined;
  createElement(tagName: string): TestElement {
    return new TestElement(tagName);
  }

  createElementNS(_namespace: string, tagName: string): TestElement {
    return new TestElement(tagName);
  }

  createTextNode(value: string): string {
    return value;
  }
}

function installRendererDom(): { restore(): void } {
  const documentRef = new TestDocument();
  const windowRef = {
    location: { href: "http://example.test/", search: "" },
    innerWidth: 1200,
    innerHeight: 800,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    },
    setTimeout,
    clearTimeout,
  };
  vi.stubGlobal("document", documentRef);
  vi.stubGlobal("window", windowRef);
  vi.stubGlobal("requestAnimationFrame", windowRef.requestAnimationFrame);
  return { restore: () => vi.unstubAllGlobals() };
}

describe("LayoutTaskRenderer object interactivity", () => {
  it("guards every interactive surface while the tutorial confirmation is pending", () => {
    const renderer = readFileSync("src/core/renderer.ts", "utf8");
    const css = readFileSync("src/styles/layout-task.css", "utf8");

    expect(renderer).toContain("isInteractionBlocked?: () => boolean;");
    expect(renderer).toContain("layout-task-tutorial-interaction-locked");
    expect(renderer).toContain("if (this.options.isInteractionBlocked?.())");
    expect(css).toContain(".layout-task-tutorial-interaction-locked .layout-task-workspace");
  });

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
  function mountMagnifier() {
    const dom = installRendererDom();
    const config = createRuntimeConfig({ objects: [] });
    const controller = new MagnifierController();
    const renderer = new LayoutTaskRenderer({
      root: new TestElement("main") as unknown as HTMLElement,
      config,
      store: new StateStore(config),
      magnifier: {
        controller,
        onEnter: () => controller.enter(),
        onWheel: (direction) => controller.wheel(direction),
        onExit: () => controller.exit(),
      },
    });
    const refs = renderer.mount();
    const windowEvent = (type: string, event: Record<string, unknown>) => {
      for (const [name, handler] of vi.mocked(window.addEventListener).mock.calls) {
        if (name === type) (handler as (event: unknown) => void)(event);
      }
    };
    return { renderer, refs, controller, windowEvent, cleanup: () => { renderer.destroy(); dom.restore(); } };
  }

  it("uses outside-plan Ctrl+wheel for the magnifier and releases the listener on teardown", () => {
    const fixture = mountMagnifier();
    try {
      fixture.refs.magnifierButton!.click();
      const preventDefault = vi.fn();
      fixture.windowEvent("wheel", { target: new TestElement("img"), ctrlKey: true, deltaY: -100,
        preventDefault, stopPropagation: vi.fn() });
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(fixture.controller.getZoom()).toBe(2.25);
      const binding = vi.mocked(window.addEventListener).mock.calls.find(([type]) => type === "wheel")!;
      expect(binding[2]).toEqual({ capture: true, passive: false });
      fixture.renderer.destroy();
      expect(window.removeEventListener).toHaveBeenCalledWith("wheel", binding[1], true);
    } finally { fixture.cleanup(); }
  });

  it.each(["g", "div", "img", "button"])("zooms over %s without a held button only while the magnifier is active", (tag) => {
    const fixture = mountMagnifier();
    const event = { target: new TestElement(tag), buttons: 0, deltaY: -100,
      preventDefault: vi.fn(), stopPropagation: vi.fn() };
    try {
      fixture.windowEvent("wheel", event);
      expect(fixture.controller.getZoom()).toBe(2);
      expect(event.preventDefault).not.toHaveBeenCalled();
      fixture.refs.magnifierButton!.click();
      fixture.windowEvent("wheel", event);
      expect(fixture.controller.getZoom()).toBe(2.25);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      fixture.windowEvent("keydown", { key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() });
      fixture.windowEvent("wheel", event);
      expect(fixture.controller.getZoom()).toBe(2.25);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(fixture.refs.magnifierLensElement!.hidden).toBe(true);
    } finally { fixture.cleanup(); }
  });

  it("moves the mounted lens over the plan and applies each real wheel change once", () => {
    const fixture = mountMagnifier();
    try {
      fixture.refs.magnifierButton!.click();
      (fixture.refs.stageWrapElement as unknown as TestElement).dispatch("pointermove", { clientX: 790, clientY: 590 });
      expect(fixture.refs.magnifierLensElement!.style.left).toBe("580px");
      const preventDefault = vi.fn();
      fixture.windowEvent("wheel", { target: fixture.refs.svg, deltaY: -100, preventDefault, stopPropagation: vi.fn() });
      expect(fixture.controller.getZoom()).toBe(2.25);
      expect(fixture.refs.magnifierSceneElement!.style.getPropertyValue?.("--magnifier-scene-left")
        ?? (fixture.refs.magnifierSceneElement!.style as unknown as Record<string, string>)["--magnifier-scene-left"]).toBe("-1667.5px");
      expect(preventDefault).toHaveBeenCalledOnce();
      fixture.windowEvent("keydown", { key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() });
      expect(fixture.refs.magnifierLensElement!.hidden).toBe(true);
    } finally { fixture.cleanup(); }
  });

  it("keeps the external hint inside the viewport without changing the pointed scene", () => {
    const fixture = mountMagnifier();
    try {
      window.innerHeight = 600;
      Object.defineProperty(fixture.refs.magnifierHintElement!, "offsetHeight", { value: 48 });
      fixture.refs.magnifierButton!.click();
      (fixture.refs.stageWrapElement as unknown as TestElement).dispatch("pointermove", { clientX: 400, clientY: 590 });
      expect(fixture.refs.magnifierLensElement!.style.top).toBe("324px");
      expect(fixture.refs.magnifierSceneElement!.style.getPropertyValue?.("--magnifier-scene-top")
        ?? (fixture.refs.magnifierSceneElement!.style as unknown as Record<string, string>)["--magnifier-scene-top"]).toBe("-1070px");
    } finally { fixture.cleanup(); }
  });

  it.each(["pointer", "keyboard"])("restores the previous editing focus after %s activation and Escape", (input) => {
    const fixture = mountMagnifier();
    try {
      const previous = new TestElement("button");
      previous.className = "layout-task-confidence-button";
      (fixture.refs.root as unknown as TestElement).append(previous);
      previous.focus();
      const launcher = fixture.refs.magnifierButton as unknown as TestElement;
      if (input === "pointer") launcher.dispatch("pointerdown");
      launcher.dispatch("focus", { relatedTarget: previous });
      launcher.focus();
      launcher.click();
      fixture.windowEvent("keydown", { key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() });
      expect(document.activeElement === (previous as unknown as Element)).toBe(true);
    } finally { fixture.cleanup(); }
  });

  it("keeps the pointed floor-plan location at the clamped lens center", () => {
    const geometry = getMagnifierLensGeometry(
      { left: 10, top: 20, width: 800, height: 600 },
      { clientX: 810, clientY: 620 },
      2,
      { left: 0, top: 0, width: 900, height: 700 },
    );

    expect(geometry).toMatchObject({
      lensSize: 220,
      left: 590,
      top: 400,
      sceneWidth: 800,
      sceneHeight: 600,
      sceneLeft: -1490,
      sceneTop: -1090,
    });
    expect(geometry.sceneLeft + geometry.zoom * geometry.focusX).toBe(110);
    expect(geometry.sceneTop + geometry.zoom * geometry.focusY).toBe(110);
  });

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

  it("adds viewport zoom controls and uses an explicit hold-to-pan button", () => {
    const renderer = readFileSync("src/core/renderer.ts", "utf8");
    const css = readFileSync("src/styles/layout-task.css", "utf8").replace(/\r\n/g, "\n");

    expect(renderer).toContain('className = "layout-task-magnifier-button"');
    expect(renderer).toContain("Press ESC to exit");
    expect(renderer).toContain("按 ESC 退出放大镜");
    expect(renderer).not.toContain('this.createViewportButton("+", "Zoom in"');
    expect(renderer).not.toContain('this.createViewportButton("−", "Zoom out"');
    expect(renderer).not.toContain('this.createViewportButton("↺", "Reset view"');
    expect(renderer).not.toContain('this.createViewportButton("", "Pan view"');
    expect(renderer).toContain('tools.dataset.layoutTaskAnchor = "viewport-tools";');
    expect(css).toContain(".layout-task-magnifier-lens {");
    expect(css).toContain(".layout-task-magnifier-hint {");
    expect(css).toContain('.layout-task-tutorial-bubble[data-anchor="viewport-tools"]');
    expect(css).toContain('left: 16px;');
    expect(renderer).toContain('window.addEventListener("keydown"');
    expect(renderer).toContain("restoreMagnifierFocus");
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

    expect(renderer).toContain('confirmButton.textContent = "Confirm";');
    expect(renderer).toContain('saveButton.textContent = "Save";');
    expect(renderer).toContain("saveButton.disabled = true;");
    expect(renderer).toContain("confidence.onSave();");
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
