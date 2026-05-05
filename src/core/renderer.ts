import type { RuntimeTaskConfig } from "../types/runtime";
import type { LayoutAction } from "../types/events";
import type { CopyResult } from "./clipboard-service";
import type { StateStore } from "./state-store";
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
  backgroundElement?: SVGElement;
  displayImageFrameElement?: HTMLElement;
  displayImageElement?: HTMLImageElement;
  objectElements: Map<string, SVGElement>;
  controlElements: Map<string, SVGElement>;
  controlButtons: Map<string, Map<LayoutAction, SVGElement>>;
  feedbackLayer?: SVGElement;
  controlsLayer?: SVGElement;
  confirmButton?: HTMLButtonElement;
  copyAgainButton?: HTMLButtonElement;
  resultOutput?: HTMLTextAreaElement;
  statusElement?: HTMLElement;
  viewportWarningElement?: HTMLElement;
}

export class LayoutTaskRenderer {
  readonly refs: RendererRefs;
  private activeObjectId: string | undefined;
  private hideControlsTimer: number | undefined;
  private feedbackTimer: number | undefined;
  private viewportListenerBound = false;

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

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("layout-task-stage");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${this.options.config.taskId} layout task stage`);
    const viewBox = this.options.config.world.viewBox;
    svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.addEventListener("click", (event) => {
      if (event.target === svg || event.target === background) {
        this.options.onStageBackgroundClick?.();
      }
    });

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
      this.bindObjectPointerEvents(group, objectConfig.id);

      const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
      image.setAttribute("href", objectConfig.asset.srcResolved);
      image.setAttribute("width", String(objectConfig.width));
      image.setAttribute("height", String(objectConfig.height));

      if (objectConfig.anchor === "center") {
        image.setAttribute("x", String(-objectConfig.width / 2));
        image.setAttribute("y", String(-objectConfig.height / 2));
      } else {
        image.setAttribute("x", "0");
        image.setAttribute("y", "0");
      }

      group.append(image);
      wrapper.append(group);
      objectLayer.append(wrapper);
      controlsLayer.append(this.createControls(objectConfig.id, objectConfig.width, objectConfig.height));
      this.refs.objectElements.set(objectConfig.id, group);
      this.updateObject(objectConfig.id);
      this.updateControlsDisabled(objectConfig.id);
    }

    svg.append(controlsLayer);
    stageWrap.append(svg);

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
    this.refs.backgroundElement = background;
    this.refs.feedbackLayer = feedbackLayer;
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

    const controls = this.refs.controlElements.get(objectId);
    if (controls) {
      controls.setAttribute("transform", `translate(${state.x} ${state.y})`);
    }
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
    if (!feedbackLayer) {
      return;
    }

    const objectConfig = this.options.config.objects.find((item) => item.id === objectId);
    if (!objectConfig) {
      return;
    }

    this.clearLimitFeedback();
    const state = this.options.store.getObjectState(objectId);
    const movementStep = objectConfig.behavior.movement.step ?? this.options.config.world.grid.size;
    const movement = objectConfig.behavior.movement;
    const rotation = objectConfig.behavior.rotation;

    if (isMovementFeedbackAction(action)) {
      // For movement limits we now flash the whole reachable area, not only one edge.
      // 这样被试能直接看到“这个物体总共还能在哪些位置出现”，比一条边界线更直观。
      const rect = getMovementLimitFeedbackRect({
        origin: { x: objectConfig.x, y: objectConfig.y },
        step: movementStep,
        objectWidth: objectConfig.width,
        objectHeight: objectConfig.height,
        maxLeft: movement.max_left,
        maxRight: movement.max_right,
        maxUp: movement.max_up,
        maxDown: movement.max_down,
      });

      const area = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      area.classList.add("layout-task-limit-feedback", "is-area");
      area.setAttribute("x", String(rect.x));
      area.setAttribute("y", String(rect.y));
      area.setAttribute("width", String(rect.width));
      area.setAttribute("height", String(rect.height));
      area.setAttribute("rx", "10");
      feedbackLayer.append(area);
    } else if (isRotationFeedbackAction(action) && rotation?.step) {
      const radius = Math.max(objectConfig.width, objectConfig.height) / 2 + 28;

      // Rotation-at-limit is a warning state, not an instruction to rotate more.
      // 所以这里不用旋转箭头，改成 alert icon + halo，避免被试误读成“继续转”。
      const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      halo.classList.add("layout-task-limit-feedback", "is-rotation-halo");
      halo.setAttribute("cx", String(state.x));
      halo.setAttribute("cy", String(state.y));
      halo.setAttribute("r", String(radius));
      feedbackLayer.append(halo);

      const icon = createFeedbackIcon(this.options.config.baseUrl, "alert-circle.svg");
      icon.setAttribute("transform", `translate(${state.x - 13} ${state.y - radius - 36})`);
      feedbackLayer.append(icon);
    }

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.classList.add("layout-task-limit-label");
    label.setAttribute("x", String(state.x));
    label.setAttribute("y", String(state.y - objectConfig.height / 2 - 58));
    label.setAttribute("text-anchor", "middle");
    label.textContent = this.options.config.feedback.limit_messages[action] ?? getDefaultLimitMessage(action);
    feedbackLayer.append(label);

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

  private createControls(objectId: string, objectWidth: number, objectHeight: number): SVGElement {
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
            { action: "move_up" as const, label: "Move up", x: 0, y: -objectHeight / 2 - 30, icon: "arrow-up.svg" },
            { action: "move_down" as const, label: "Move down", x: 0, y: objectHeight / 2 + 30, icon: "arrow-down.svg" },
            { action: "move_left" as const, label: "Move left", x: -objectWidth / 2 - 30, y: 0, icon: "arrow-left.svg" },
            { action: "move_right" as const, label: "Move right", x: objectWidth / 2 + 30, y: 0, icon: "arrow-right.svg" },
          ];

    const rotationControls =
      objectConfig?.behavior.rotation?.step === undefined
        ? []
        : [
            {
              action: "rotate_ccw" as const,
              label: "Rotate counter-clockwise",
              x: -objectWidth / 2 - 30,
              y: -objectHeight / 2 - 30,
              icon: "rotate-ccw.svg",
            },
            {
              action: "rotate_cw" as const,
              label: "Rotate clockwise",
              x: objectWidth / 2 + 30,
              y: -objectHeight / 2 - 30,
              icon: "rotate-cw.svg",
            },
          ];

    const buttonMap = new Map<LayoutAction, SVGElement>();
    for (const control of [...movementControls, ...rotationControls]) {
      const button = document.createElementNS("http://www.w3.org/2000/svg", "g");
      button.classList.add("layout-task-control-button");
      button.dataset.action = control.action;
      button.setAttribute("tabindex", "0");
      button.setAttribute("role", "button");
      button.setAttribute("aria-label", `${objectId}: ${control.label}`);
      button.setAttribute("transform", `translate(${control.x} ${control.y})`);

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", "18");

      const icon = createControlIcon(this.options.config.baseUrl, control.icon);

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

    return group;
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
  }
}

function createControlIcon(baseUrl: string, iconFile: string): SVGElement {
  // Icons are served from public assets so the same files can be reused by
  // the standalone page and future jsPsych integration.
  const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
  image.classList.add("layout-task-control-icon");
  image.setAttribute("href", new URL(`assets/icons/${iconFile}`, baseUrl).toString());
  image.setAttribute("x", "-10");
  image.setAttribute("y", "-10");
  image.setAttribute("width", "20");
  image.setAttribute("height", "20");
  image.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return image;
}

function createFeedbackIcon(baseUrl: string, iconFile: string): SVGElement {
  const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
  image.classList.add("layout-task-feedback-icon");
  image.setAttribute("href", new URL(`assets/icons/${iconFile}`, baseUrl).toString());
  image.setAttribute("width", "26");
  image.setAttribute("height", "26");
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
