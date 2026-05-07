import type { RuntimeTaskConfig } from "../types/runtime";
import type { LayoutAction } from "../types/events";
import type { CopyResult } from "./clipboard-service";
import type { StateStore } from "./state-store";
import type { MovementLimitFeedbackRect } from "../utils/geometry";
import { getMovementLimitFeedbackRect } from "../utils/geometry";
import { getViewportWarningState } from "./viewport-requirements";

export interface RendererPointer {
  clientX: number;
  clientY: number;
  pointerId: number;
  worldX: number;
  worldY: number;
}

// Renderer owns DOM/SVG creation only.
// 它不决定实验规则，只把 runtime config + current store state 映射成界面。
export interface RendererRefs {
  root: HTMLElement;
  svg?: SVGSVGElement;
  stageWrapElement?: HTMLElement;
  backgroundElement?: SVGElement;
  displayImageFrameElement?: HTMLElement;
  displayImageElement?: HTMLImageElement;
  objectElements: Map<string, SVGElement>;
  objectVisualElements: Map<string, SVGElement>;
  controlElements: Map<string, SVGElement>;
  controlButtons: Map<string, Map<LayoutAction, SVGElement>>;
  feedbackLayer?: SVGElement;
  feedbackOverlayElement?: HTMLElement;
  controlsLayer?: SVGElement;
  confirmButton?: HTMLButtonElement;
  copyAgainButton?: HTMLButtonElement;
  resultOutput?: HTMLTextAreaElement;
  statusElement?: HTMLElement;
  viewportWarningElement?: HTMLElement;
}

interface LocalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface VisualBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export class LayoutTaskRenderer {
  readonly refs: RendererRefs;
  private activeObjectId: string | undefined;
  private hideControlsTimer: number | undefined;
  private feedbackTimer: number | undefined;
  private viewportListenerBound = false;
  private readonly debugShadowEnabled =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug_shadow") === "1";

  constructor(
    private readonly options: {
      root: HTMLElement;
      config: RuntimeTaskConfig;
      store: StateStore;
      onAction?: (objectId: string, action: LayoutAction, event: MouseEvent | KeyboardEvent) => void;
      onObjectSelect?: (objectId: string) => void;
      onStageBackgroundClick?: () => void;
      onDragStart?: (objectId: string, pointer: RendererPointer) => void;
      onDragMove?: (objectId: string, pointer: RendererPointer) => void;
      onDragEnd?: (objectId: string, pointer: RendererPointer) => void;
      onDragCancel?: (objectId: string, pointer: RendererPointer) => void;
      onConfirm?: () => void;
      onCopyAgain?: () => void;
    },
  ) {
    this.refs = {
      root: options.root,
      objectElements: new Map<string, SVGElement>(),
      objectVisualElements: new Map<string, SVGElement>(),
      controlElements: new Map<string, SVGElement>(),
      controlButtons: new Map<string, Map<LayoutAction, SVGElement>>(),
    };
  }

  mount(): RendererRefs {
    this.renderAll();
    return this.refs;
  }

  renderAll(): void {
    this.options.root.replaceChildren();
    this.refs.objectElements.clear();
    this.refs.objectVisualElements.clear();
    this.refs.controlElements.clear();
    this.refs.controlButtons.clear();
    this.clearLimitFeedback();

    // The shell contains the SVG stage and a persistent side panel.
    // 右侧面板常驻，避免把确认/复制这类关键动作塞进易误触的画布区域。
    const shell = document.createElement("section");
    shell.className = "layout-task-shell";

    const header = document.createElement("header");
    header.className = "layout-task-header";

    const eyebrow = document.createElement("p");
    eyebrow.className = "layout-task-eyebrow";
    eyebrow.textContent = "Layout Task";

    const title = document.createElement("h1");
    title.textContent = this.options.config.title ?? this.options.config.taskId;

    const meta = document.createElement("p");
    meta.className = "layout-task-meta";
    meta.textContent = `QID: ${this.options.config.qid} - Objects: ${this.options.config.objects.length}`;

    const viewportWarning = document.createElement("p");
    viewportWarning.className = "layout-task-viewport-warning";
    viewportWarning.hidden = true;

    header.append(eyebrow, title, meta, viewportWarning);

    const workspace = document.createElement("main");
    workspace.className = "layout-task-workspace";

    const displayImageFrame = this.createDisplayImageFrame();

    const stageWrap = document.createElement("div");
    stageWrap.className = "layout-task-stage-wrap";
    const stageFitStyle = getStageFitStyle(this.options.config);
    stageWrap.style.padding = stageFitStyle.padding;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("layout-task-stage");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${this.options.config.taskId} layout task stage`);
    const viewBox = this.options.config.world.viewBox;
    svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    // Stage CSS follows the world viewBox ratio. SVG viewBox remains the source of truth,
    // so floorplan, grid, objects, and drag coordinates scale together on each viewport.
    svg.style.aspectRatio = stageFitStyle.aspectRatio;
    svg.style.maxHeight = stageFitStyle.maxHeight;
    svg.addEventListener("click", (event) => {
      if (event.target === svg || event.target === background) {
        this.options.onStageBackgroundClick?.();
      }
    });

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.append(defs);

    const background = document.createElementNS("http://www.w3.org/2000/svg", "image");
    background.setAttribute("href", this.options.config.background.asset.srcResolved);
    background.setAttribute("x", String(this.options.config.background.x));
    background.setAttribute("y", String(this.options.config.background.y));
    background.setAttribute("width", String(this.options.config.background.width));
    background.setAttribute("height", String(this.options.config.background.height));
    background.classList.add("layout-task-background");
    svg.append(background);

    const objectLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    objectLayer.classList.add("layout-task-object-layer");
    svg.append(objectLayer);

    const feedbackLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    feedbackLayer.classList.add("layout-task-feedback-layer");
    svg.append(feedbackLayer);

    const feedbackOverlay = document.createElement("div");
    feedbackOverlay.className = "layout-task-feedback-overlay";

    const controlsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    controlsLayer.classList.add("layout-task-controls-layer");
    // Controls live in a dedicated overlay layer so they are easier to target.
    // 控制层和对象层分开，后续 drag / feedback 都更好接。
    for (const objectConfig of this.options.config.objects) {
      const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
      wrapper.classList.add("layout-task-object-wrapper");
      wrapper.dataset.objectId = objectConfig.id;

      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.classList.add("layout-task-object");
      group.classList.toggle("is-draggable", objectConfig.behavior.movement.mode === "drag");
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", `${objectConfig.id} edit mode`);
      group.addEventListener("click", (event) => {
        event.stopPropagation();
        this.options.onObjectSelect?.(objectConfig.id);
      });
      group.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        this.options.onObjectSelect?.(objectConfig.id);
      });
      group.addEventListener("pointerenter", () => {
        this.setObjectVisualHighlight(objectConfig.id, true);
      });
      group.addEventListener("pointerleave", () => {
        this.setObjectVisualHighlight(objectConfig.id, this.activeObjectId === objectConfig.id);
      });
      group.addEventListener("focus", () => {
        this.setObjectVisualHighlight(objectConfig.id, true);
      });
      group.addEventListener("blur", () => {
        this.setObjectVisualHighlight(objectConfig.id, this.activeObjectId === objectConfig.id);
      });
      this.bindObjectPointerEvents(group, objectConfig.id);

      const visual = this.createObjectVisual(
        objectConfig.id,
        objectConfig.asset.srcResolved,
        objectConfig.width,
        objectConfig.height,
        objectConfig.anchor,
        objectConfig.asset.inlineSvgText,
        defs,
      );
      group.append(visual);
      wrapper.append(group);
      objectLayer.append(wrapper);
      controlsLayer.append(this.createControls(objectConfig.id));
      this.refs.objectElements.set(objectConfig.id, group);
      this.refs.objectVisualElements.set(objectConfig.id, visual);
      this.updateObject(objectConfig.id);
      this.updateControlsDisabled(objectConfig.id);
    }

    svg.append(controlsLayer);
    stageWrap.append(svg, feedbackOverlay);

    const panel = document.createElement("aside");
    panel.className = "layout-task-panel";

    const panelTitle = document.createElement("h2");
    panelTitle.textContent = "Object Controls";

    const instruction = document.createElement("p");
    instruction.textContent = this.options.config.messages.instruction_edit_mode;

    const confirmButton = document.createElement("button");
    confirmButton.className = "layout-task-primary-button";
    confirmButton.type = "button";
    confirmButton.textContent = "Confirm and copy result";
    confirmButton.addEventListener("click", () => this.options.onConfirm?.());

    const status = document.createElement("p");
    status.className = "layout-task-status";
    status.textContent = this.options.config.messages.status_ready;

    const output = document.createElement("textarea");
    output.className = "layout-task-output";
    output.readOnly = true;
    output.hidden = true;

    const copyAgainButton = document.createElement("button");
    copyAgainButton.className = "layout-task-secondary-button";
    copyAgainButton.type = "button";
    copyAgainButton.textContent = "Copy again";
    copyAgainButton.hidden = true;
    copyAgainButton.addEventListener("click", () => this.options.onCopyAgain?.());

    panel.append(panelTitle, instruction, confirmButton, status, output, copyAgainButton);
    workspace.append(stageWrap, panel);
    shell.append(header, workspace);
    if (displayImageFrame) {
      shell.insertBefore(displayImageFrame, workspace);
    }
    this.options.root.append(shell);

    this.refs.svg = svg;
    this.refs.stageWrapElement = stageWrap;
    this.refs.backgroundElement = background;
    this.refs.feedbackLayer = feedbackLayer;
    this.refs.feedbackOverlayElement = feedbackOverlay;
    this.refs.controlsLayer = controlsLayer;
    this.refs.confirmButton = confirmButton;
    this.refs.statusElement = status;
    this.refs.resultOutput = output;
    this.refs.copyAgainButton = copyAgainButton;
    this.refs.viewportWarningElement = viewportWarning;

    this.updateViewportWarning();
    this.bindViewportWarning();
  }

  private createDisplayImageFrame(): HTMLElement | undefined {
    const displayImage = this.options.config.displayImage;
    if (!displayImage?.enabled) {
      this.refs.displayImageFrameElement = undefined;
      this.refs.displayImageElement = undefined;
      return undefined;
    }

    // This frame is independent from SVG world coordinates.
    // 它只负责展示参考图，并随浏览器宽度自然缩放，不参与物体交互。
    const frame = document.createElement("section");
    frame.className = "layout-task-display-image-frame";

    const image = document.createElement("img");
    image.className = "layout-task-display-image";
    image.src = displayImage.srcResolved;
    image.alt = displayImage.alt;
    image.decoding = "async";

    frame.append(image);
    this.refs.displayImageFrameElement = frame;
    this.refs.displayImageElement = image;
    return frame;
  }

  updateObject(objectId: string): void {
    const element = this.refs.objectElements.get(objectId);
    if (!element) {
      return;
    }

    const state = this.options.store.getObjectState(objectId);
    // SVG world coordinates are the single source of visual position.
    // object image stays local to its group; group transform 才是真实 pose。
    element.setAttribute("transform", `translate(${state.x} ${state.y}) rotate(${state.r})`);
    element.classList.toggle("is-active", this.activeObjectId === objectId);
    this.setObjectVisualHighlight(objectId, this.activeObjectId === objectId);

    const controls = this.refs.controlElements.get(objectId);
    if (controls) {
      controls.setAttribute("transform", `translate(${state.x} ${state.y})`);
    }
    this.updateControlsLayout(objectId);
  }

  updateControlsDisabled(objectId: string): void {
    const buttons = this.refs.controlButtons.get(objectId);
    if (!buttons) {
      return;
    }

    for (const [action, button] of buttons.entries()) {
      const canApply = this.options.store.canApplyAction(objectId, action);
      button.classList.toggle("is-disabled", !canApply.ok);
      button.setAttribute("aria-disabled", String(!canApply.ok));
    }
  }

  setDragging(objectId: string, dragging: boolean): void {
    const element = this.refs.objectElements.get(objectId);
    element?.classList.toggle("is-dragging", dragging);
  }

  setStatus(message: string): void {
    if (this.refs.statusElement) {
      this.refs.statusElement.textContent = message;
    }
  }

  showLimitFeedback(objectId: string, action: LayoutAction): void {
    if (!isFeedbackAction(action)) {
      return;
    }

    const feedbackLayer = this.refs.feedbackLayer;
    const feedbackOverlay = this.refs.feedbackOverlayElement;
    if (!feedbackLayer || !feedbackOverlay) {
      return;
    }

    const objectConfig = this.options.config.objects.find((item) => item.id === objectId);
    if (!objectConfig) {
      return;
    }

    this.clearLimitFeedback();
    const state = this.options.store.getObjectState(objectId);
    const ui = getStageUiMetrics(this.options.config, this.refs.svg);
    const movementStep = objectConfig.behavior.movement.step ?? this.options.config.world.grid.size;
    const movement = objectConfig.behavior.movement;
    const rotation = objectConfig.behavior.rotation;
    if (isMovementFeedbackAction(action)) {
      // For movement limits we now flash the whole reachable area, not only one edge.
      // 这样被试能直接看到“这个物体总共还能在哪些位置出现”，比一条边界线更直观。
      const rect = this.getMovementFeedbackRect(objectId, movementStep, movement);

      const area = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      area.classList.add("layout-task-limit-feedback", "is-area");
      area.setAttribute("x", String(rect.x));
      area.setAttribute("y", String(rect.y));
      area.setAttribute("width", String(rect.width));
      area.setAttribute("height", String(rect.height));
      area.setAttribute("rx", String(ui.feedbackRectRadius));
      area.style.strokeWidth = `${ui.feedbackStrokeWidth}px`;
      area.style.strokeDasharray = `${ui.feedbackDashLength}px ${ui.feedbackDashGap}px`;
      feedbackLayer.append(area);
    } else if (isRotationFeedbackAction(action) && rotation?.step) {
      const bounds = this.getObjectVisualBounds(objectId);
      const radius = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2 + ui.rotationHaloGap;

      // Rotation-at-limit is a warning state, not an instruction to rotate more.
      // 所以这里不用旋转箭头，改成 alert icon + halo，避免被试误读成“继续转”。
      const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      halo.classList.add("layout-task-limit-feedback", "is-rotation-halo");
      halo.setAttribute("cx", String(state.x));
      halo.setAttribute("cy", String(state.y));
      halo.setAttribute("r", String(radius));
      halo.style.strokeWidth = `${ui.feedbackHaloStrokeWidth}px`;
      halo.style.strokeDasharray = `${ui.feedbackDashLength}px ${ui.feedbackDashGap}px`;
      feedbackLayer.append(halo);
    }

    const badge = document.createElement("div");
    badge.className = "layout-task-limit-feedback-badge";

    const icon = document.createElement("img");
    icon.className = "layout-task-feedback-icon";
    icon.src = new URL(`assets/icons/alert-circle.svg`, this.options.config.baseUrl).toString();
    icon.alt = "";

    const label = document.createElement("span");
    label.className = "layout-task-limit-label";
    label.textContent = this.options.config.feedback.limit_messages[action] ?? getDefaultLimitMessage(action);

    badge.append(icon, label);
    feedbackOverlay.append(badge);

    this.feedbackTimer = window.setTimeout(() => {
      this.clearLimitFeedback();
    }, 900);
  }

  setLocked(locked: boolean): void {
    // Locked mode is visual and behavioral: hide active controls and disable confirm.
    // 真正能不能操作仍由 StateStore / InteractionController 兜底。
    this.options.root.classList.toggle("layout-task-locked", locked);
    if (locked) {
      this.clearLimitFeedback();
      this.clearActiveObject();
    }

    for (const objectElement of this.refs.objectElements.values()) {
      objectElement.classList.toggle("is-locked", locked);
    }

    for (const controlElement of this.refs.controlElements.values()) {
      controlElement.classList.toggle("is-locked", locked);
    }

    if (this.refs.confirmButton) {
      this.refs.confirmButton.disabled = locked;
    }
  }

  showCompletion(outputText: string, copyResult: CopyResult): void {
    // Completion screen keeps the encoded text visible as a manual fallback.
    // 剪贴板失败时，被试仍然可以手动复制同一份 locked payload。
    this.setStatus(
      copyResult.ok
        ? "Locked and copied. Return to the survey and paste the encoded result."
        : "Locked. Automatic copy failed; copy the encoded result below manually.",
    );

    if (this.refs.resultOutput) {
      this.refs.resultOutput.hidden = false;
      this.refs.resultOutput.value = outputText;
    }

    if (this.refs.copyAgainButton) {
      this.refs.copyAgainButton.hidden = false;
    }
  }

  destroy(): void {
    this.clearHideTimer();
    this.clearLimitFeedback();
    this.unbindViewportWarning();
    this.options.root.innerHTML = "";
  }

  clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const svg = this.refs.svg;
    if (!svg) {
      return { x: clientX, y: clientY };
    }

    const matrix = svg.getScreenCTM();
    if (!matrix) {
      return { x: clientX, y: clientY };
    }

    // SVGPoint keeps this conversion browser-native and respects viewBox/preserveAspectRatio.
    // 后续若有缩放或响应式布局，也不需要手写比例换算。
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  private createControls(objectId: string): SVGElement {
    const objectConfig = this.options.config.objects.find((item) => item.id === objectId);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("layout-task-controls");
    group.dataset.objectId = objectId;

    // Drag objects do not show movement arrows; rotation controls are still allowed.
    // 拖拽只替代平移方式，不影响旋转按钮。
    const movementControls =
      objectConfig?.behavior.movement.mode === "drag"
        ? []
        : [
            { action: "move_up" as const, label: "Move up", icon: "arrow-up.svg" },
            { action: "move_down" as const, label: "Move down", icon: "arrow-down.svg" },
            { action: "move_left" as const, label: "Move left", icon: "arrow-left.svg" },
            { action: "move_right" as const, label: "Move right", icon: "arrow-right.svg" },
          ];

    const rotationControls =
      objectConfig?.behavior.rotation?.step === undefined
        ? []
        : [
            {
              action: "rotate_ccw" as const,
              label: "Rotate counter-clockwise",
              icon: "rotate-ccw.svg",
            },
            {
              action: "rotate_cw" as const,
              label: "Rotate clockwise",
              icon: "rotate-cw.svg",
            },
          ];

    const ui = getStageUiMetrics(this.options.config, this.refs.svg);
    const buttonMap = new Map<LayoutAction, SVGElement>();
    for (const control of [...movementControls, ...rotationControls]) {
      const button = document.createElementNS("http://www.w3.org/2000/svg", "g");
      button.classList.add("layout-task-control-button");
      button.dataset.action = control.action;
      button.setAttribute("tabindex", "0");
      button.setAttribute("role", "button");
      button.setAttribute("aria-label", `${objectId}: ${control.label}`);

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", String(ui.controlRadius));

      const icon = createControlIcon(this.options.config.baseUrl, control.icon, ui.controlIconSize);

      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.options.onAction?.(objectId, control.action, event);
      });

      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        this.options.onAction?.(objectId, control.action, event);
      });

      button.append(circle, icon);
      group.append(button);
      buttonMap.set(control.action, button);
    }

    this.refs.controlElements.set(objectId, group);
    this.refs.controlButtons.set(objectId, buttonMap);
    this.updateControlsLayout(objectId);

    return group;
  }

  private updateControlsLayout(objectId: string): void {
    const buttons = this.refs.controlButtons.get(objectId);
    if (!buttons) {
      return;
    }

    const bounds = this.getObjectVisualBounds(objectId);
    const ui = getStageUiMetrics(this.options.config, this.refs.svg);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    const positions: Partial<Record<LayoutAction, { x: number; y: number }>> = {
      move_up: { x: centerX, y: bounds.minY - ui.controlGap },
      move_down: { x: centerX, y: bounds.maxY + ui.controlGap },
      move_left: { x: bounds.minX - ui.controlGap, y: centerY },
      move_right: { x: bounds.maxX + ui.controlGap, y: centerY },
      rotate_ccw: { x: bounds.minX - ui.controlGap, y: bounds.minY - ui.controlGap },
      rotate_cw: { x: bounds.maxX + ui.controlGap, y: bounds.minY - ui.controlGap },
    };

    for (const [action, button] of buttons.entries()) {
      const position = positions[action];
      if (!position) {
        continue;
      }
      button.setAttribute("transform", `translate(${position.x} ${position.y})`);
    }
  }

  private getMovementFeedbackRect(
    objectId: string,
    step: number,
    movement: {
      max_left?: number;
      max_right?: number;
      max_up?: number;
      max_down?: number;
    },
  ): MovementLimitFeedbackRect {
    const objectConfig = this.options.config.objects.find((item) => item.id === objectId);
    if (!objectConfig) {
      return getMovementLimitFeedbackRect({ origin: { x: 0, y: 0 }, step });
    }

    const bounds = this.getObjectVisualBounds(objectId);
    const leftSteps = movement.max_left ?? 0;
    const rightSteps = movement.max_right ?? 0;
    const upSteps = movement.max_up ?? 0;
    const downSteps = movement.max_down ?? 0;

    const minCenterX = objectConfig.x - leftSteps * step;
    const maxCenterX = objectConfig.x + rightSteps * step;
    const minCenterY = objectConfig.y - upSteps * step;
    const maxCenterY = objectConfig.y + downSteps * step;

    return {
      x: minCenterX + bounds.minX,
      y: minCenterY + bounds.minY,
      width: Math.max(maxCenterX - minCenterX, step) + (bounds.maxX - bounds.minX),
      height: Math.max(maxCenterY - minCenterY, step) + (bounds.maxY - bounds.minY),
    };
  }

  private getObjectVisualBounds(objectId: string): VisualBounds {
    const objectConfig = this.options.config.objects.find((item) => item.id === objectId);
    const state = this.options.store.getObjectState(objectId);
    const visual = this.refs.objectVisualElements.get(objectId);
    const bbox = visual ? getSvgBBoxSafe(visual) : undefined;

    return getRotatedVisualBounds(
      bbox?.width && bbox?.height
        ? bbox
        : getConfiguredObjectLocalRect({
            width: objectConfig?.width ?? 0,
            height: objectConfig?.height ?? 0,
            anchor: objectConfig?.anchor ?? "center",
          }),
      state.r,
    );
  }

  private createObjectVisual(
    objectId: string,
    src: string,
    width: number,
    height: number,
    anchor: string,
    inlineSvgText?: string,
    defs?: SVGDefsElement,
  ): SVGElement {
    const visual = document.createElementNS("http://www.w3.org/2000/svg", "g");
    visual.classList.add("layout-task-object-visual");
    const shadowLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    shadowLayer.classList.add("layout-task-object-selected-shadow");
    if (defs && inlineSvgText) {
      const filterId = `layout-task-selected-shadow-${escapeSvgId(objectId)}`;
      defs.append(this.createSelectedShadowFilter(filterId, width, height, anchor));
      shadowLayer.dataset.selectedShadowFilter = filterId;
      shadowLayer.setAttribute("filter", `url(#${filterId})`);

      const shadowShape = this.createInlineObjectSvgElement(inlineSvgText, width, height, anchor, {
        forceFill: "#0e7490",
        opacity: "0.92",
      });
      shadowLayer.append(shadowShape);
    }

    const image = inlineSvgText
      ? this.createInlineObjectSvgElement(inlineSvgText, width, height, anchor)
      : this.createObjectImageElement(src, width, height, anchor);
    image.classList.add("layout-task-object-image");

    visual.append(shadowLayer, image);
    return visual;
  }

  private createObjectImageElement(src: string, width: number, height: number, anchor: string): SVGImageElement {
    const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
    image.setAttribute("href", src);
    image.setAttribute("width", String(width));
    image.setAttribute("height", String(height));

    if (anchor === "center") {
      image.setAttribute("x", String(-width / 2));
      image.setAttribute("y", String(-height / 2));
    } else {
      image.setAttribute("x", "0");
      image.setAttribute("y", "0");
    }

    return image;
  }

  private createInlineObjectSvgElement(
    svgText: string,
    width: number,
    height: number,
    anchor: string,
    options: { forceFill?: string; opacity?: string } = {},
  ): SVGElement {
    const parser = new DOMParser();
    const parsedDocument = parser.parseFromString(svgText, "image/svg+xml");
    const sourceSvg = parsedDocument.documentElement;
    if (sourceSvg.nodeName.toLowerCase() !== "svg" || sourceSvg.querySelector("parsererror")) {
      return this.createObjectImageElement("", width, height, anchor);
    }

    const viewBox = parseSvgViewBox(sourceSvg.getAttribute("viewBox"));
    const x = anchor === "center" ? -width / 2 : 0;
    const y = anchor === "center" ? -height / 2 : 0;
    const scaleX = width / viewBox.width;
    const scaleY = height / viewBox.height;

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute(
      "transform",
      `translate(${x} ${y}) scale(${scaleX} ${scaleY}) translate(${-viewBox.x} ${-viewBox.y})`,
    );

    for (const child of Array.from(sourceSvg.childNodes)) {
      if (child.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }
      const imported = document.importNode(child, true) as SVGElement;
      if (options.forceFill) {
        applyInlineSvgShadowStyle(imported, options.forceFill);
      }
      group.append(imported);
    }
    if (options.opacity) {
      group.setAttribute("opacity", options.opacity);
    }

    return group;
  }

  private createSelectedShadowFilter(filterId: string, width: number, height: number, anchor: string): SVGElement {
    const ui = getStageUiMetrics(this.options.config, this.refs.svg);
    const margin = 24 * ui.scale;
    const x = anchor === "center" ? -width / 2 - margin : -margin;
    const y = anchor === "center" ? -height / 2 - margin : -margin;
    const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.setAttribute("id", filterId);
    filter.setAttribute("x", String(x));
    filter.setAttribute("y", String(y));
    filter.setAttribute("width", String(width + margin * 2));
    filter.setAttribute("height", String(height + margin * 2));
    filter.setAttribute("filterUnits", "userSpaceOnUse");
    filter.setAttribute("color-interpolation-filters", "sRGB");

    const blueBlur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
    blueBlur.setAttribute("in", "SourceAlpha");
    blueBlur.setAttribute("stdDeviation", String(3 * ui.scale));
    blueBlur.setAttribute("result", "blueBlur");

    const blueFlood = document.createElementNS("http://www.w3.org/2000/svg", "feFlood");
    blueFlood.setAttribute("flood-color", "#0e7490");
    blueFlood.setAttribute("flood-opacity", "0.9");
    blueFlood.setAttribute("result", "blueColor");

    const blueGlow = document.createElementNS("http://www.w3.org/2000/svg", "feComposite");
    blueGlow.setAttribute("in", "blueColor");
    blueGlow.setAttribute("in2", "blueBlur");
    blueGlow.setAttribute("operator", "in");
    blueGlow.setAttribute("result", "blueGlow");

    const baseBlur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
    baseBlur.setAttribute("in", "SourceAlpha");
    baseBlur.setAttribute("stdDeviation", String(4 * ui.scale));
    baseBlur.setAttribute("result", "baseBlur");

    const baseOffset = document.createElementNS("http://www.w3.org/2000/svg", "feOffset");
    baseOffset.setAttribute("in", "baseBlur");
    baseOffset.setAttribute("dx", "0");
    baseOffset.setAttribute("dy", String(4 * ui.scale));
    baseOffset.setAttribute("result", "baseOffset");

    const baseFlood = document.createElementNS("http://www.w3.org/2000/svg", "feFlood");
    baseFlood.setAttribute("flood-color", "#0f172a");
    baseFlood.setAttribute("flood-opacity", "0.22");
    baseFlood.setAttribute("result", "baseColor");

    const baseShadow = document.createElementNS("http://www.w3.org/2000/svg", "feComposite");
    baseShadow.setAttribute("in", "baseColor");
    baseShadow.setAttribute("in2", "baseOffset");
    baseShadow.setAttribute("operator", "in");
    baseShadow.setAttribute("result", "baseShadow");

    const merge = document.createElementNS("http://www.w3.org/2000/svg", "feMerge");
    const blueNode = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    blueNode.setAttribute("in", "blueGlow");
    const baseNode = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    baseNode.setAttribute("in", "baseShadow");
    const sourceNode = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    sourceNode.setAttribute("in", "SourceGraphic");
    merge.append(blueNode, baseNode, sourceNode);

    filter.append(blueBlur, blueFlood, blueGlow, baseBlur, baseOffset, baseFlood, baseShadow, merge);
    if (this.debugShadowEnabled) {
      console.info("[layout-task][shadow-filter]", {
        filterId,
        width,
        height,
        anchor,
        uiScale: ui.scale,
        margin,
        filterRect: {
          x,
          y,
          width: width + margin * 2,
          height: height + margin * 2,
        },
      });
    }
    return filter;
  }

  private setObjectVisualHighlight(objectId: string, highlighted: boolean): void {
    const visual = this.refs.objectVisualElements.get(objectId);
    if (!visual) {
      return;
    }
    const shadowLayer = visual.querySelector<SVGElement>(".layout-task-object-selected-shadow");

    if (highlighted) {
      shadowLayer?.classList.add("is-visible");
    } else {
      shadowLayer?.classList.remove("is-visible");
    }

    if (this.debugShadowEnabled) {
      const element = this.refs.objectElements.get(objectId);
      const objectConfig = this.options.config.objects.find((item) => item.id === objectId);
      const bbox = getSvgBBoxSafe(visual);
      const visualTransform = visual.getAttribute("transform");
      const elementTransform = element?.getAttribute("transform");
      console.info("[layout-task][shadow-highlight]", {
        objectId,
        highlighted,
        rotation: this.options.store.getObjectState(objectId).r,
        configuredRotation: objectConfig?.rotation ?? 0,
        visualFilter: visual.getAttribute("filter"),
        shadowVisible: shadowLayer?.classList.contains("is-visible") ?? false,
        shadowFilter: shadowLayer?.getAttribute("filter") ?? null,
        visualFilterId: shadowLayer?.dataset.selectedShadowFilter,
        elementTransform,
        visualTransform,
        bbox,
      });
    }
  }

  activateObject(objectId: string): void {
    if (this.options.store.isLocked()) {
      return;
    }

    // Selected-object mode keeps one control cluster visible until explicit deselect.
    // 这比 hover-only 更适合 touch / tablet，也能减少相邻物体误触。
    this.clearHideTimer();
    this.clearLimitFeedback();

    this.activeObjectId = objectId;
    for (const [currentObjectId, objectElement] of this.refs.objectElements.entries()) {
      objectElement.classList.toggle("is-active", currentObjectId === objectId);
      this.setObjectVisualHighlight(currentObjectId, currentObjectId === objectId);
    }
    for (const [currentObjectId, controlElement] of this.refs.controlElements.entries()) {
      controlElement.classList.toggle("is-active", currentObjectId === objectId);
    }
  }

  clearActiveObject(): void {
    this.clearHideTimer();
    this.clearLimitFeedback();
    this.activeObjectId = undefined;

    for (const objectElement of this.refs.objectElements.values()) {
      objectElement.classList.remove("is-active");
    }
    for (const objectId of this.refs.objectVisualElements.keys()) {
      this.setObjectVisualHighlight(objectId, false);
    }

    for (const controlElement of this.refs.controlElements.values()) {
      controlElement.classList.remove("is-active");
    }
  }

  private bindObjectPointerEvents(element: SVGElement, objectId: string): void {
    element.addEventListener("pointerdown", (event) => {
      const pointer = this.eventToRendererPointer(event);
      this.options.onDragStart?.(objectId, pointer);
      if (element.classList.contains("is-dragging")) {
        element.setPointerCapture(event.pointerId);
      }
    });

    element.addEventListener("pointermove", (event) => {
      if (!element.hasPointerCapture(event.pointerId)) {
        return;
      }

      this.options.onDragMove?.(objectId, this.eventToRendererPointer(event));
    });

    element.addEventListener("pointerup", (event) => {
      if (!element.hasPointerCapture(event.pointerId)) {
        return;
      }

      this.options.onDragEnd?.(objectId, this.eventToRendererPointer(event));
      element.releasePointerCapture(event.pointerId);
    });

    element.addEventListener("pointercancel", (event) => {
      if (!element.hasPointerCapture(event.pointerId)) {
        return;
      }

      this.options.onDragCancel?.(objectId, this.eventToRendererPointer(event));
      element.releasePointerCapture(event.pointerId);
    });
  }

  private eventToRendererPointer(event: PointerEvent): RendererPointer {
    const world = this.clientToWorld(event.clientX, event.clientY);
    return {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
      worldX: world.x,
      worldY: world.y,
    };
  }

  private bindViewportWarning(): void {
    if (this.viewportListenerBound || typeof window === "undefined") {
      return;
    }

    window.addEventListener("resize", this.updateViewportWarning);
    this.viewportListenerBound = true;
  }

  private unbindViewportWarning(): void {
    if (!this.viewportListenerBound || typeof window === "undefined") {
      return;
    }

    window.removeEventListener("resize", this.updateViewportWarning);
    this.viewportListenerBound = false;
  }

  private readonly updateViewportWarning = () => {
    const element = this.refs.viewportWarningElement;
    if (!element || typeof window === "undefined") {
      return;
    }

    const warning = getViewportWarningState(this.options.config, {
      width: window.innerWidth,
      height: window.innerHeight,
    });

    element.hidden = !warning.show;
    element.textContent = warning.message;
  };

  private clearHideTimer(): void {
    if (this.hideControlsTimer !== undefined) {
      window.clearTimeout(this.hideControlsTimer);
      this.hideControlsTimer = undefined;
    }
  }

  private clearLimitFeedback(): void {
    if (this.feedbackTimer !== undefined) {
      window.clearTimeout(this.feedbackTimer);
      this.feedbackTimer = undefined;
    }

    this.refs.feedbackLayer?.replaceChildren();
    this.refs.feedbackOverlayElement?.replaceChildren();
  }
}

export function getStageFitStyle(config: RuntimeTaskConfig): {
  aspectRatio: string;
  maxHeight: string;
  padding: string;
} {
  const viewBox = config.world.viewBox;
  return {
    aspectRatio: `${viewBox.width} / ${viewBox.height}`,
    maxHeight: `${config.stage.max_height_ratio * 100}vh`,
    padding: `${config.stage.padding}px`,
  };
}

export function getStageUiMetrics(config: RuntimeTaskConfig, svg?: SVGSVGElement): {
  scale: number;
  controlGap: number;
  controlRadius: number;
  controlIconSize: number;
  rotationHaloGap: number;
  feedbackIconSize: number;
  feedbackIconGap: number;
  feedbackLabelGap: number;
  feedbackLabelFontSize: number;
  feedbackLabelStrokeWidth: number;
  feedbackRectRadius: number;
  feedbackStrokeWidth: number;
  feedbackHaloStrokeWidth: number;
  feedbackDashLength: number;
  feedbackDashGap: number;
} {
  const scale = getWorldUiScale(config, svg);
  return {
    scale,
    controlGap: 30 * scale,
    controlRadius: 18 * scale,
    controlIconSize: 20 * scale,
    rotationHaloGap: 28 * scale,
    feedbackIconSize: 26 * scale,
    feedbackIconGap: 36 * scale,
    feedbackLabelGap: 58 * scale,
    feedbackLabelFontSize: 20 * scale,
    feedbackLabelStrokeWidth: 4 * scale,
    feedbackRectRadius: 10 * scale,
    feedbackStrokeWidth: 2 * scale,
    feedbackHaloStrokeWidth: 4 * scale,
    feedbackDashLength: 10 * scale,
    feedbackDashGap: 8 * scale,
  };
}

function getWorldUiScale(config: RuntimeTaskConfig, svg?: SVGSVGElement): number {
  const screenScale = svg?.getScreenCTM()?.a;
  if (screenScale && Number.isFinite(screenScale) && screenScale > 0) {
    return 1 / screenScale;
  }

  // Fallback for tests and pre-layout rendering: approximate a classic 800x600 stage.
  // 真正显示时优先用 getScreenCTM，它反映当前窗口下 world unit 到 CSS px 的实际比例。
  const viewBox = config.world.viewBox;
  return Math.max(viewBox.width / 800, viewBox.height / 600, 1);
}

function parseSvgViewBox(value: string | null): { x: number; y: number; width: number; height: number } {
  if (!value) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part)) || parts[2] === 0 || parts[3] === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

function getSvgBBoxSafe(element: SVGElement): LocalRect | undefined {
  if (!("getBBox" in element) || typeof element.getBBox !== "function") {
    return undefined;
  }

  try {
    const bbox = element.getBBox();
    return {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
    };
  } catch {
    return undefined;
  }
}

export function getConfiguredObjectLocalRect(input: { width: number; height: number; anchor: string }): LocalRect {
  return {
    x: input.anchor === "center" ? -input.width / 2 : 0,
    y: input.anchor === "center" ? -input.height / 2 : 0,
    width: input.width,
    height: input.height,
  };
}

export function getRotatedVisualBounds(rect: LocalRect, rotation: number): VisualBounds {
  const angleRad = (rotation * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const minX = rect.x;
  const minY = rect.y;
  const maxX = rect.x + rect.width;
  const maxY = rect.y + rect.height;
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ].map((point) => ({
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  }));

  return {
    minX: Math.min(...corners.map((point) => point.x)),
    maxX: Math.max(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxY: Math.max(...corners.map((point) => point.y)),
  };
}

function applyInlineSvgShadowStyle(element: SVGElement, fill: string): void {
  element.removeAttribute("stroke");
  element.setAttribute("fill", fill);

  for (const child of Array.from(element.children)) {
    applyInlineSvgShadowStyle(child as SVGElement, fill);
  }
}

function escapeSvgId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function createControlIcon(baseUrl: string, iconFile: string, size: number): SVGElement {
  // Icons are served from public assets so the same files can be reused by
  // the standalone page and future jsPsych integration.
  const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
  image.classList.add("layout-task-control-icon");
  image.setAttribute("href", new URL(`assets/icons/${iconFile}`, baseUrl).toString());
  image.setAttribute("x", String(-size / 2));
  image.setAttribute("y", String(-size / 2));
  image.setAttribute("width", String(size));
  image.setAttribute("height", String(size));
  image.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return image;
}

function isFeedbackAction(action: LayoutAction): action is Exclude<LayoutAction, "drag_start" | "drag_move" | "drag_end"> {
  return action !== "drag_start" && action !== "drag_move" && action !== "drag_end";
}

function isMovementFeedbackAction(
  action: Exclude<LayoutAction, "drag_start" | "drag_move" | "drag_end">,
): action is "move_left" | "move_right" | "move_up" | "move_down" {
  return action === "move_left" || action === "move_right" || action === "move_up" || action === "move_down";
}

function isRotationFeedbackAction(
  action: Exclude<LayoutAction, "drag_start" | "drag_move" | "drag_end">,
): action is "rotate_cw" | "rotate_ccw" {
  return action === "rotate_cw" || action === "rotate_ccw";
}

function getDefaultLimitMessage(action: Exclude<LayoutAction, "drag_start" | "drag_move" | "drag_end">): string {
  switch (action) {
    case "move_left":
      return "You cannot move further left.";
    case "move_right":
      return "You cannot move further right.";
    case "move_up":
      return "You cannot move further up.";
    case "move_down":
      return "You cannot move further down.";
    case "rotate_cw":
      return "You cannot rotate further clockwise.";
    case "rotate_ccw":
      return "You cannot rotate further counter-clockwise.";
  }
}
