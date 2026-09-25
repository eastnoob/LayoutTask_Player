import type { RuntimeTaskConfig, RuntimeTaskObject } from "../types/runtime";
import type { ReferenceMode } from "../types/config";
import type { PreviewStageMode } from "../types/config";
import type { ConfidenceDimension } from "../types/result";
import type { ReferencePresentation } from "../types/schedule";
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
  cameraLayer?: SVGElement;
  stageWrapElement?: HTMLElement;
  backgroundElement?: SVGElement;
  displayImageFrameElement?: HTMLElement;
  displayImageElement?: HTMLImageElement;
  workspaceElement?: HTMLElement;
  panelInstructionElement?: HTMLElement;
  reconstructionHintElement?: HTMLElement;
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
  flowMessageElement?: HTMLElement;
  flowCountdownElement?: HTMLElement;
  flowModalElement?: HTMLElement;
  flowModalMessageElement?: HTMLElement;
  flowModalButtonElement?: HTMLButtonElement;
  confidenceElement?: HTMLElement;
  tutorialBubbleElement?: HTMLElement;
  tutorialBubbleMessageElement?: HTMLElement;
  savingBubbleElement?: HTMLElement;
  savingBubbleMessageElement?: HTMLElement;
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

type ControlButtonAction = Exclude<LayoutAction, "drag_start" | "drag_move" | "drag_end">;

interface ControlLayoutInput {
  bounds: VisualBounds;
  ui: ReturnType<typeof getStageUiMetrics>;
  movementRotationDeg?: number;
}

export class LayoutTaskRenderer {
  // Renderer owns DOM/SVG shape, not experiment rules.
  // It keeps browser pixels, SVG world coordinates, and control affordances in sync
  // so InteractionController / StateStore can stay focused on task behavior.
  readonly refs: RendererRefs;
  private activeObjectId: string | undefined;
  private hideControlsTimer: number | undefined;
  private feedbackTimer: number | undefined;
  private viewportListenerBound = false;
  private viewportZoom = DEFAULT_VIEWPORT_ZOOM;
  private viewportPan = { x: 0, y: 0 };
  private viewportPanPointerId: number | undefined;
  private viewportPanLast: { x: number; y: number } | undefined;
  private readonly debugShadowEnabled =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug_shadow") === "1";

  constructor(
    private readonly options: {
      root: HTMLElement;
      config: RuntimeTaskConfig;
      store: StateStore;
      tutorialMode?: boolean;
      developerMode?: boolean;
      presentation?: ReferencePresentation;
      onAction?: (objectId: string, action: LayoutAction, event: MouseEvent | KeyboardEvent) => void;
      onObjectSelect?: (objectId: string) => void;
      onStageBackgroundClick?: () => void;
      onDragStart?: (objectId: string, pointer: RendererPointer) => void;
      onDragMove?: (objectId: string, pointer: RendererPointer) => void;
      onDragEnd?: (objectId: string, pointer: RendererPointer) => void;
      onDragCancel?: (objectId: string, pointer: RendererPointer) => void;
      onConfirm?: () => void;
      onDeveloperShortcut?: () => void;
      onCopyAgain?: () => void;
      isPaused?: () => boolean;
      confidence?: {
        scale: number[];
        labels: Record<string, string>;
        onChoose(dimension: ConfidenceDimension, value: number): void;
        onSave(): void;
      };
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
    this.viewportZoom = DEFAULT_VIEWPORT_ZOOM;
    this.viewportPan = { x: 0, y: 0 };
    this.viewportPanPointerId = undefined;
    this.viewportPanLast = undefined;

    // The shell contains the SVG stage and a persistent side panel.
    // 右侧面板常驻，避免把确认/复制这类关键动作塞进易误触的画布区域。
    const shell = document.createElement("section");
    shell.className = "layout-task-shell";
    shell.dataset.layoutTaskAnchor = "shell";

    const header = document.createElement("header");
    header.className = "layout-task-header";

    const eyebrow = document.createElement("p");
    eyebrow.className = "layout-task-eyebrow";
    eyebrow.textContent = "Layout Task";

    const headerContent = getTrialHeaderContent({
      tutorialMode: this.options.tutorialMode,
      taskId: this.options.config.taskId,
      qid: this.options.config.qid,
      objectCount: this.options.config.objects.length,
      presentation: this.options.presentation,
    });

    const title = document.createElement("h1");
    title.className = this.options.tutorialMode ? "layout-task-trial-label is-tutorial" : "layout-task-trial-label";
    title.textContent = headerContent.title;

    const meta = document.createElement("p");
    meta.className = "layout-task-meta";
    meta.textContent = headerContent.meta;

    const viewportWarning = document.createElement("p");
    viewportWarning.className = "layout-task-viewport-warning";
    viewportWarning.hidden = true;

    header.append(eyebrow, title, meta, viewportWarning);

    const workspace = document.createElement("main");
    workspace.className = "layout-task-workspace";
    workspace.dataset.layoutTaskAnchor = "workspace";

    const displayImageFrame = this.createDisplayImageFrame();

    const stageWrap = document.createElement("div");
    stageWrap.className = "layout-task-stage-wrap";
    stageWrap.dataset.layoutTaskAnchor = "stage";
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
      if (this.options.isPaused?.()) {
        return;
      }
      if (event.target === svg || event.target === background) {
        this.options.onStageBackgroundClick?.();
      }
    });
    svg.addEventListener("contextmenu", (event) => event.preventDefault());
    svg.addEventListener("pointerdown", this.handleViewportPointerDown);
    svg.addEventListener("pointermove", this.handleViewportPointerMove);
    svg.addEventListener("pointerup", this.handleViewportPointerUp);
    svg.addEventListener("pointercancel", this.handleViewportPointerUp);
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.append(defs);

    const cameraLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    cameraLayer.classList.add("layout-task-camera-layer");
    svg.append(cameraLayer);

    const displayLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    displayLayer.classList.add("layout-task-display-layer");
    const displayTransform = getStageDisplayTransform(this.options.config);
    if (displayTransform) {
      displayLayer.setAttribute("transform", displayTransform);
    }
    cameraLayer.append(displayLayer);

    const background = document.createElementNS("http://www.w3.org/2000/svg", "image");
    background.setAttribute("href", this.options.config.background.asset.srcResolved);
    background.setAttribute("x", String(this.options.config.background.x));
    background.setAttribute("y", String(this.options.config.background.y));
    background.setAttribute("width", String(this.options.config.background.width));
    background.setAttribute("height", String(this.options.config.background.height));
    const backgroundTransform = getBackgroundDisplayTransform(this.options.config);
    if (backgroundTransform) {
      background.setAttribute("transform", backgroundTransform);
    }
    background.classList.add("layout-task-background");
    displayLayer.append(background);

    const objectLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    objectLayer.classList.add("layout-task-object-layer");
    displayLayer.append(objectLayer);

    const feedbackLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    feedbackLayer.classList.add("layout-task-feedback-layer");
    displayLayer.append(feedbackLayer);

    const feedbackOverlay = document.createElement("div");
    feedbackOverlay.className = "layout-task-feedback-overlay";

    const controlsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    controlsLayer.classList.add("layout-task-controls-layer");
    controlsLayer.dataset.layoutTaskAnchor = "controls";
    // Object visuals and controls are separate layers.
    // Rendering controls last solves z-order/overlap targeting; their own layout
    // logic still has to keep them usable when objects sit near stage edges.
    for (const objectConfig of this.options.config.objects) {
      const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
      wrapper.classList.add("layout-task-object-wrapper");
      wrapper.dataset.objectId = objectConfig.id;

      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.classList.add("layout-task-object");
      const interactive = isObjectInteractive(objectConfig);
      group.classList.toggle("is-draggable", interactive && objectConfig.behavior.movement.mode === "drag");
      group.classList.toggle("is-static-context", !interactive);

      if (interactive) {
        // Fixed/context objects still render and collide, but only interactive
        // reconstruction targets receive selection / drag / keyboard handlers.
        group.setAttribute("tabindex", "0");
        group.setAttribute("role", "button");
        group.setAttribute("aria-label", `${objectConfig.id} edit mode`);
        group.addEventListener("click", (event) => {
          if (this.options.isPaused?.()) {
            return;
          }
          event.stopPropagation();
          this.options.onObjectSelect?.(objectConfig.id);
        });
        group.addEventListener("keydown", (event) => {
          if (this.options.isPaused?.()) {
            return;
          }
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          this.options.onObjectSelect?.(objectConfig.id);
        });
        group.addEventListener("pointerenter", () => {
          this.clearHideTimer();
          this.setActiveControlsVisible(objectConfig.id, true);
          this.setObjectVisualHighlight(objectConfig.id, true);
        });
        group.addEventListener("pointerleave", () => {
          this.scheduleActiveControlsHide(objectConfig.id);
          this.setObjectVisualHighlight(objectConfig.id, this.activeObjectId === objectConfig.id);
        });
        group.addEventListener("focus", () => {
          this.setObjectVisualHighlight(objectConfig.id, true);
        });
        group.addEventListener("blur", () => {
          this.setObjectVisualHighlight(objectConfig.id, this.activeObjectId === objectConfig.id);
        });
        this.bindObjectPointerEvents(group, objectConfig.id);
      }

      const visual = this.createObjectVisual(
        objectConfig.id,
        objectConfig.asset.srcResolved,
        objectConfig.width,
        objectConfig.height,
        objectConfig.anchor,
        objectConfig.asset.inlineSvgText,
        defs,
      );
      const visualTransform = getObjectVisualDisplayTransform(this.options.config);
      if (visualTransform) {
        visual.setAttribute("transform", visualTransform);
      }
      group.append(visual);
      wrapper.append(group);
      objectLayer.append(wrapper);
      controlsLayer.append(this.createControls(objectConfig.id));
      this.refs.objectElements.set(objectConfig.id, group);
      this.refs.objectVisualElements.set(objectConfig.id, visual);
      this.updateObject(objectConfig.id);
      this.updateControlsDisabled(objectConfig.id);
    }

    displayLayer.append(controlsLayer);
    const viewportTools = this.createViewportTools();
    stageWrap.append(svg, feedbackOverlay, viewportTools);

    // The SVG must be attached before measuring screen scale. The first pass
    // above happens during construction and may use the coarse fallback scale,
    // which would make the controls jump after the first interaction.
    for (const objectConfig of this.options.config.objects) {
      this.updateControlsLayout(objectConfig.id);
    }

    const panel = document.createElement("aside");
    panel.className = "layout-task-panel";
    panel.dataset.layoutTaskAnchor = "panel";

    const panelTitle = document.createElement("h2");
    panelTitle.textContent = "Object Controls";

    const instruction = document.createElement("p");
    instruction.textContent = this.options.config.messages.instruction_edit_mode;

    const reconstructionHint = this.createReconstructionHint();
    const confidenceControl = this.createConfidenceControl();
    confidenceControl.dataset.layoutTaskAnchor = "confidence";

    const flowMessage = document.createElement("p");
    flowMessage.className = "layout-task-flow-message";
    flowMessage.hidden = true;

    const flowCountdown = document.createElement("p");
    flowCountdown.className = "layout-task-flow-countdown";
    flowCountdown.hidden = true;

    const flowModal = document.createElement("div");
    flowModal.className = "layout-task-flow-modal";
    flowModal.hidden = true;

    const flowModalDialog = document.createElement("div");
    flowModalDialog.className = "layout-task-flow-modal-dialog";
    flowModalDialog.dataset.layoutTaskAnchor = "flow-modal";
    flowModalDialog.setAttribute("role", "dialog");
    flowModalDialog.setAttribute("aria-modal", "true");

    const flowModalMessage = document.createElement("p");
    flowModalMessage.className = "layout-task-flow-modal-message";

    const flowModalButton = document.createElement("button");
    flowModalButton.className = "layout-task-primary-button";
    flowModalButton.type = "button";

    flowModalDialog.append(flowModalMessage, flowModalButton);
    flowModal.append(flowModalDialog);

    const confirmButton = document.createElement("button");
    confirmButton.className = "layout-task-primary-button";
    confirmButton.type = "button";
    confirmButton.textContent = "Confirm";
    confirmButton.dataset.layoutTaskAnchor = "confirm";
    confirmButton.addEventListener("click", () => {
      if (!this.options.isPaused?.()) {
        this.options.onConfirm?.();
      }
    });

    const developerShortcut = this.options.developerMode ? document.createElement("button") : undefined;
    if (developerShortcut) {
      developerShortcut.type = "button";
      developerShortcut.className = "layout-task-developer-button";
      developerShortcut.textContent = "Developer: fill default result";
      developerShortcut.title = "Fill default poses and confidence through the normal interaction flow";
      developerShortcut.addEventListener("click", () => this.options.onDeveloperShortcut?.());
    }

    const status = document.createElement("p");
    status.className = "layout-task-status";
    status.textContent = this.options.config.messages.status_ready;
    status.dataset.layoutTaskAnchor = "status";

    const output = document.createElement("textarea");
    output.className = "layout-task-output";
    output.readOnly = true;
    output.hidden = true;

    const copyAgainButton = document.createElement("button");
    copyAgainButton.className = "layout-task-secondary-button";
    copyAgainButton.type = "button";
    copyAgainButton.textContent = "Copy";
    copyAgainButton.hidden = true;
    copyAgainButton.addEventListener("click", () => {
      if (!this.options.isPaused?.()) {
        this.options.onCopyAgain?.();
      }
    });

    panel.append(
      panelTitle,
      reconstructionHint,
      instruction,
      confidenceControl,
      flowMessage,
      flowCountdown,
      confirmButton,
      ...(developerShortcut ? [developerShortcut] : []),
      status,
      output,
      copyAgainButton,
    );
    workspace.append(stageWrap, panel);
    shell.append(header, workspace);
    if (displayImageFrame) {
      shell.insertBefore(displayImageFrame, workspace);
    }

    const tutorialBubble = document.createElement("div");
    tutorialBubble.className = "layout-task-tutorial-bubble";
    tutorialBubble.hidden = true;
    const tutorialMessage = document.createElement("p");
    tutorialMessage.className = "layout-task-tutorial-message";
    tutorialBubble.append(tutorialMessage);
    shell.append(tutorialBubble);

    const savingBubble = document.createElement("div");
    savingBubble.className = "layout-task-saving-bubble";
    savingBubble.hidden = true;
    const savingMessage = document.createElement("p");
    savingMessage.className = "layout-task-saving-message";
    savingBubble.append(savingMessage);
    shell.append(savingBubble);

    shell.append(flowModal);
    this.options.root.append(shell);

    this.refs.svg = svg;
    this.refs.cameraLayer = cameraLayer;
    this.updateViewportTransform();
    this.refs.workspaceElement = workspace;
    this.refs.stageWrapElement = stageWrap;
    this.refs.backgroundElement = background;
    this.refs.feedbackLayer = feedbackLayer;
    this.refs.feedbackOverlayElement = feedbackOverlay;
    this.refs.controlsLayer = controlsLayer;
    this.refs.confirmButton = confirmButton;
    this.refs.reconstructionHintElement = reconstructionHint;
    this.refs.panelInstructionElement = instruction;
    this.refs.statusElement = status;
    this.refs.flowMessageElement = flowMessage;
    this.refs.flowCountdownElement = flowCountdown;
    this.refs.flowModalElement = flowModal;
    this.refs.flowModalMessageElement = flowModalMessage;
    this.refs.flowModalButtonElement = flowModalButton;
    this.refs.confidenceElement = confidenceControl;
    this.refs.tutorialBubbleElement = tutorialBubble;
    this.refs.tutorialBubbleMessageElement = tutorialMessage;
    this.refs.savingBubbleElement = savingBubble;
    this.refs.savingBubbleMessageElement = savingMessage;
    this.refs.resultOutput = output;
    this.refs.copyAgainButton = copyAgainButton;
    this.refs.viewportWarningElement = viewportWarning;

    this.scheduleControlsLayoutSync();
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
    frame.dataset.layoutTaskAnchor = "display-image";

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

  private createConfidenceControl(): HTMLElement {
    const wrapper = document.createElement("section");
    wrapper.className = "layout-task-confidence";
    wrapper.hidden = true;

    const title = document.createElement("p");
    title.className = "layout-task-confidence-title";
    title.textContent = "Choose your confidence rating for this furniture group";

    const questions = document.createElement("div");
    questions.className = "layout-task-confidence-questions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "layout-task-confidence-save layout-task-primary-button";
    saveButton.textContent = "Save";
    saveButton.disabled = true;

    const confidence = this.options.confidence;
    if (confidence) {
      for (const dimension of ["position", "rotation"] as const) {
        const question = document.createElement("div");
        question.className = "layout-task-confidence-question";
        const label = document.createElement("p");
        label.className = "layout-task-confidence-question-label";
        label.append("How confident are you in the ");
        const emphasis = document.createElement("strong");
        emphasis.className = "layout-task-confidence-dimension";
        emphasis.textContent = dimension;
        label.append(emphasis, "?");
        question.append(label);
        const buttons = document.createElement("div");
        buttons.className = "layout-task-confidence-buttons";
        for (const value of [...confidence.scale].sort((a, b) => b - a)) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "layout-task-confidence-button";
          button.dataset.confidenceDimension = dimension;
          button.textContent = `${value} ${confidence.labels[String(value)] ?? ""}`.trim();
          button.addEventListener("click", () => {
            for (const item of buttons.querySelectorAll("button")) {
              item.classList.remove("is-selected");
            }
            button.classList.add("is-selected");
            saveButton.disabled = questions.querySelectorAll(".is-selected").length !== 2;
            confidence.onChoose(dimension, value);
            this.refs.confidenceElement?.classList.remove("is-required");
            this.setStatus(`Confidence for ${dimension} selected: ${button.textContent}`);
          });
          buttons.append(button);
        }
        question.append(buttons);
        questions.append(question);
      }

      saveButton.addEventListener("click", () => {
        confidence.onSave();
      });
    }

    wrapper.append(title, questions, saveButton);
    return wrapper;
  }

  showConfidenceForActiveGroup(): void {
    if (!this.refs.confidenceElement || !this.options.confidence) {
      return;
    }

    this.refs.confidenceElement.hidden = false;
    this.refs.confidenceElement.classList.add("is-required");
    for (const item of this.refs.confidenceElement.querySelectorAll(".layout-task-confidence-button")) {
      item.classList.remove("is-selected");
    }
    const saveButton = this.refs.confidenceElement.querySelector<HTMLButtonElement>(".layout-task-confidence-save");
    if (saveButton) {
      saveButton.disabled = true;
    }
  }

  private createViewportTools(): HTMLElement {
    const tools = document.createElement("div");
    tools.className = "layout-task-viewport-tools";

    const zoomIn = this.createViewportButton("+", "Zoom in", () => this.adjustViewportZoom(1.25));
    const zoomOut = this.createViewportButton("−", "Zoom out", () => this.adjustViewportZoom(0.8));
    const reset = this.createViewportButton("↺", "Reset view", () => this.resetViewport());
    tools.append(zoomIn, zoomOut, reset);
    return tools;
  }

  private createViewportButton(label: string, ariaLabel: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "layout-task-viewport-button";
    button.textContent = label;
    button.setAttribute("aria-label", ariaLabel);
    button.title = ariaLabel;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  focusConfidence(): void {
    this.refs.confidenceElement?.classList.add("is-required");
    this.refs.confidenceElement?.querySelector<HTMLButtonElement>(".layout-task-confidence-button")?.focus();
  }

  showSubmissionRequirement(): void {
    const targets = [this.refs.statusElement, this.refs.confirmButton].filter(
      (element): element is HTMLElement => element !== undefined,
    );

    for (const target of targets) {
      target.classList.remove("is-submit-attention");
      void target.offsetWidth;
      target.classList.add("is-submit-attention");
      window.setTimeout(() => target.classList.remove("is-submit-attention"), 850);
    }
  }

  hideConfidence(): void {
    if (!this.refs.confidenceElement) {
      return;
    }

    this.refs.confidenceElement.hidden = true;
    this.refs.confidenceElement.classList.remove("is-required");
  }

  showTutorialStep(step: { anchor: string; message: string }): void {
    const bubble = this.refs.tutorialBubbleElement;
    const message = this.refs.tutorialBubbleMessageElement;
    if (!bubble || !message) {
      return;
    }

    renderTutorialMessage(message, step.message);
    bubble.hidden = false;
    bubble.dataset.anchor = step.anchor;
    this.setTutorialAttention(step.anchor);
  }

  hideTutorialStep(): void {
    if (this.refs.tutorialBubbleElement) {
      this.refs.tutorialBubbleElement.hidden = true;
    }
    this.setTutorialAttention();
  }

  private setTutorialAttention(anchor?: string): void {
    for (const element of this.options.root.querySelectorAll(".is-tutorial-attention")) {
      element.classList.remove("is-tutorial-attention");
    }

    if (!anchor) {
      return;
    }

    this.options.root.querySelector(`[data-layout-task-anchor="${anchor}"]`)?.classList.add("is-tutorial-attention");
  }

  private createReconstructionHint(): HTMLElement {
    const hint = document.createElement("section");
    hint.className = "layout-task-reconstruction-hint";

    const title = document.createElement("p");
    title.className = "layout-task-reconstruction-hint-title";
    title.textContent = this.options.config.messages.reconstruction_hint_title;

    const list = document.createElement("ul");
    list.className = "layout-task-reconstruction-hint-list";

    for (const item of this.getReconstructionHintItems()) {
      const row = document.createElement("li");
      const icon = document.createElement("img");
      icon.src = getPlayerIconUrl(item.icon);
      icon.alt = "";
      icon.setAttribute("aria-hidden", "true");

      const text = document.createElement("span");
      text.textContent = item.text;

      row.append(icon, text);
      list.append(row);
    }

    hint.append(title, list);
    return hint;
  }

  private getReconstructionHintItems(): Array<{ icon: string; text: string }> {
    const hasDrag = this.options.config.objects.some((objectConfig) => objectConfig.behavior.movement.mode === "drag");
    const hasButtonMove = this.options.config.objects.some(
      (objectConfig) => objectConfig.behavior.movement.mode === "button",
    );
    const hasRotation = this.options.config.objects.some((objectConfig) => objectConfig.behavior.rotation?.step);

    const items: Array<{ icon: string; text: string }> = [
      {
        icon: "info.svg",
        text: this.options.config.messages.reconstruction_hint_select,
      },
    ];

    if (hasDrag) {
      items.push({
        icon: "hand.svg",
        text: this.options.config.messages.reconstruction_hint_drag,
      });
    }

    if (hasButtonMove) {
      items.push({
        icon: "arrow-right.svg",
        text: this.options.config.messages.reconstruction_hint_button,
      });
    }

    if (hasRotation) {
      items.push({
        icon: "rotate-cw.svg",
        text: this.options.config.messages.reconstruction_hint_rotation,
      });
    }

    items.push({
      icon: "info.svg",
      text: this.options.config.messages.reconstruction_hint_no_information,
    });

    return items;
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

  enterPreviewFlow(options: { stageMode: PreviewStageMode; message: string; countdownText?: string }): void {
    this.setStatus(options.message);
    if (this.refs.flowMessageElement) {
      this.refs.flowMessageElement.hidden = false;
      this.refs.flowMessageElement.textContent = options.message;
    }
    if (this.refs.flowCountdownElement) {
      this.refs.flowCountdownElement.hidden = options.countdownText === undefined;
      this.refs.flowCountdownElement.textContent = options.countdownText ?? "";
    }
    if (this.refs.panelInstructionElement) {
      this.refs.panelInstructionElement.hidden = true;
    }
    if (this.refs.reconstructionHintElement) {
      this.refs.reconstructionHintElement.hidden = true;
    }

    this.setDisplayImageVisible(true);
    this.setPreviewStageMode(options.stageMode);
  }

  showPreviewAcknowledgement(options: { message: string; confirmLabel: string }): Promise<void> {
    const modal = this.refs.flowModalElement;
    const message = this.refs.flowModalMessageElement;
    const button = this.refs.flowModalButtonElement;
    if (!modal || !message || !button) {
      return Promise.resolve();
    }

    message.textContent = options.message;
    button.textContent = options.confirmLabel;
    modal.hidden = false;

    return new Promise((resolve) => {
      const finish = () => {
        button.removeEventListener("click", finish);
        modal.hidden = true;
        resolve();
      };
      button.addEventListener("click", finish);
      button.focus();
    });
  }

  updatePreviewCountdown(text: string): void {
    if (this.refs.flowCountdownElement) {
      this.refs.flowCountdownElement.hidden = false;
      this.refs.flowCountdownElement.textContent = text;
    }
  }

  enterReconstructionFlow(message?: string, referenceMode: ReferenceMode = "preview_10s"): void {
    this.setDisplayImageVisible(referenceMode === "persistent");
    this.refs.displayImageFrameElement?.classList.toggle("is-persistent-reference", referenceMode === "persistent");
    this.setPreviewStageMode(undefined);
    if (this.refs.flowCountdownElement) {
      this.refs.flowCountdownElement.hidden = true;
      this.refs.flowCountdownElement.textContent = "";
    }
    if (this.refs.flowMessageElement) {
      this.refs.flowMessageElement.hidden = message === undefined;
      this.refs.flowMessageElement.textContent = message ?? "";
    }
    if (this.refs.panelInstructionElement) {
      this.refs.panelInstructionElement.hidden = false;
    }
    if (this.refs.reconstructionHintElement) {
      this.refs.reconstructionHintElement.hidden = false;
    }
    if (message) {
      this.setStatus(message);
    }

    // Hiding the reference image can change the workspace layout. Re-measure
    // after that layout pass so the first visible controls use the real scale.
    this.scheduleControlsLayoutSync();
  }

  waitForDisplayImageReady(): Promise<void> {
    const image = this.refs.displayImageElement;
    if (!image || image.complete) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const finish = () => {
        image.removeEventListener("load", finish);
        image.removeEventListener("error", finish);
        resolve();
      };
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
    });
  }

  private setDisplayImageVisible(visible: boolean): void {
    if (this.refs.displayImageFrameElement) {
      this.refs.displayImageFrameElement.hidden = !visible;
    }
  }

  private setPreviewStageMode(mode: PreviewStageMode | undefined): void {
    const hidden = mode === "hidden";
    const locked = mode === "locked";
    if (this.refs.workspaceElement) {
      this.refs.workspaceElement.classList.toggle("is-flow-preview", mode !== undefined);
      this.refs.workspaceElement.classList.toggle("is-flow-preview-hidden", hidden);
      this.refs.workspaceElement.classList.toggle("is-flow-preview-locked", locked);
    }
    if (this.refs.stageWrapElement) {
      this.refs.stageWrapElement.hidden = hidden;
    }
    if (this.refs.confirmButton) {
      this.refs.confirmButton.disabled = mode !== undefined;
    }
    for (const controlElement of this.refs.controlElements.values()) {
      controlElement.classList.toggle("is-locked", mode !== undefined);
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
      const feedbackTransform = getLimitFeedbackTransform(rect, state.r);
      if (feedbackTransform) {
        area.setAttribute("transform", feedbackTransform);
      }
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
    icon.src = getPlayerIconUrl("alert-circle.svg");
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
    // Completion never writes to the clipboard automatically. The participant
    // copies the visible encoded result only when a prompt tells them to do so.
    void copyResult;
    this.setStatus("If you see any prompt, copy this text and follow the instructions.");

    if (this.refs.resultOutput) {
      this.refs.resultOutput.hidden = false;
      this.refs.resultOutput.value = outputText;
    }

    if (this.refs.copyAgainButton) {
      this.refs.copyAgainButton.hidden = false;
    }
  }

  showSaving(message: string): void {
    if (!this.refs.savingBubbleElement || !this.refs.savingBubbleMessageElement) {
      return;
    }

    this.refs.savingBubbleMessageElement.textContent = message;
    this.refs.savingBubbleElement.hidden = false;
  }

  private adjustViewportZoom(factor: number): void {
    this.viewportZoom = clampViewportZoom(this.viewportZoom * factor);
    this.updateViewportTransform();
  }

  private resetViewport(): void {
    this.viewportZoom = DEFAULT_VIEWPORT_ZOOM;
    this.viewportPan = { x: 0, y: 0 };
    this.updateViewportTransform();
  }

  private readonly handleViewportPointerDown = (event: PointerEvent): void => {
    if (this.options.isPaused?.()) {
      return;
    }
    if (event.button !== 2 || !this.refs.svg) {
      return;
    }

    event.preventDefault();
    this.viewportPanPointerId = event.pointerId;
    this.viewportPanLast = { x: event.clientX, y: event.clientY };
    this.refs.svg.setPointerCapture(event.pointerId);
    this.refs.stageWrapElement?.classList.add("is-viewport-panning");
  };

  private readonly handleViewportPointerMove = (event: PointerEvent): void => {
    if (this.options.isPaused?.()) {
      return;
    }
    if (event.pointerId !== this.viewportPanPointerId || !this.viewportPanLast || !this.refs.svg) {
      return;
    }

    event.preventDefault();
    const scale = getSvgScreenScale(this.refs.svg);
    const dx = (event.clientX - this.viewportPanLast.x) / (scale * this.viewportZoom);
    const dy = (event.clientY - this.viewportPanLast.y) / (scale * this.viewportZoom);
    this.viewportPan.x += dx;
    this.viewportPan.y += dy;
    this.viewportPanLast = { x: event.clientX, y: event.clientY };
    this.updateViewportTransform();
  };

  private readonly handleViewportPointerUp = (event: PointerEvent): void => {
    if (this.options.isPaused?.()) {
      return;
    }
    if (event.pointerId !== this.viewportPanPointerId) {
      return;
    }

    event.preventDefault();
    if (this.refs.svg?.hasPointerCapture(event.pointerId)) {
      this.refs.svg.releasePointerCapture(event.pointerId);
    }
    this.viewportPanPointerId = undefined;
    this.viewportPanLast = undefined;
    this.refs.stageWrapElement?.classList.remove("is-viewport-panning");
  };

  private updateViewportTransform(): void {
    const cameraLayer = this.refs.cameraLayer;
    if (!cameraLayer) {
      return;
    }

    cameraLayer.setAttribute(
      "transform",
      getViewportCameraTransform(this.options.config, this.viewportZoom, this.viewportPan),
    );
    this.refs.stageWrapElement?.classList.toggle(
      "is-viewport-transformed",
      this.viewportZoom !== DEFAULT_VIEWPORT_ZOOM || this.viewportPan.x !== 0 || this.viewportPan.y !== 0,
    );
  }

  destroy(): void {
    this.refs.svg?.removeEventListener("pointerdown", this.handleViewportPointerDown);
    this.refs.svg?.removeEventListener("pointermove", this.handleViewportPointerMove);
    this.refs.svg?.removeEventListener("pointerup", this.handleViewportPointerUp);
    this.refs.svg?.removeEventListener("pointercancel", this.handleViewportPointerUp);
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

    // Pointer events arrive in viewport pixels. Convert once into world units so
    // drag/collision code never needs to know about CSS scale or browser zoom.
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    const viewBox = this.options.config.world.viewBox;
    return {
      x: viewBox.x + (transformed.x - viewBox.x - this.viewportPan.x) / this.viewportZoom,
      y: viewBox.y + (transformed.y - viewBox.y - this.viewportPan.y) / this.viewportZoom,
    };
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
    const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.classList.add("layout-task-controls-ring");
    ring.setAttribute("pointer-events", "none");
    group.append(ring);
    const hotzone = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    hotzone.classList.add("layout-task-controls-hotzone");
    group.append(hotzone);
    group.addEventListener("pointerenter", () => {
      this.clearHideTimer();
      this.setActiveControlsVisible(objectId, true);
    });
    group.addEventListener("pointerleave", () => this.scheduleActiveControlsHide(objectId));

    for (const control of [...movementControls, ...rotationControls]) {
      const button = document.createElementNS("http://www.w3.org/2000/svg", "g");
      button.classList.add("layout-task-control-button");
      button.dataset.action = control.action;
      button.setAttribute("tabindex", "0");
      button.setAttribute("role", "button");
      button.setAttribute("aria-label", `${objectId}: ${control.label}`);

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", String(ui.controlRadius));

      const icon = createControlIcon(control.icon, ui.controlIconSize);

      button.addEventListener("click", (event) => {
        if (this.options.isPaused?.()) {
          return;
        }
        event.stopPropagation();
        this.options.onAction?.(objectId, control.action, event);
      });

      button.addEventListener("keydown", (event) => {
        if (this.options.isPaused?.()) {
          return;
        }
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

    // Keep movement controls on the object's authored local axes. Rotating the
    // furniture changes its visual bounds, but must not rotate its move system.
    const objectConfig = this.options.config.objects.find((item) => item.id === objectId);
    const movementRotationDeg = objectConfig?.rotation ?? 0;
    const bounds = this.getObjectVisualBounds(objectId);
    const ui = getStageUiMetrics(this.options.config, this.refs.svg);
    const positions = getObjectControlLayout({
      bounds,
      ui,
      movementRotationDeg,
    });
    const ringLayout = getObjectControlRingLayout(bounds, ui);
    const ringElement = this.refs.controlElements
      .get(objectId)
      ?.querySelector<SVGCircleElement>(".layout-task-controls-ring");
    if (ringElement) {
      ringElement.setAttribute("cx", String(ringLayout.centerX));
      ringElement.setAttribute("cy", String(ringLayout.centerY));
      ringElement.setAttribute("r", String(ringLayout.radius));
    }

    for (const [action, button] of buttons.entries()) {
      const position = positions[action as ControlButtonAction];
      if (!position) {
        continue;
      }
      button.setAttribute(
        "transform",
        getControlButtonTransform(action as ControlButtonAction, position, movementRotationDeg),
      );
    }

    const hotzonePositions = Object.fromEntries(
      Array.from(buttons.keys()).map((action) => [action, positions[action as ControlButtonAction]]),
    ) as Partial<Record<ControlButtonAction, { x: number; y: number }>>;
    const hotzoneBounds = getControlHotzoneBounds(hotzonePositions, ui.controlRadius, 6 * ui.scale);
    const hotzone = this.refs.controlElements.get(objectId)?.querySelector<SVGRectElement>(".layout-task-controls-hotzone");
    if (hotzone) {
      hotzone.setAttribute("x", String(hotzoneBounds.x));
      hotzone.setAttribute("y", String(hotzoneBounds.y));
      hotzone.setAttribute("width", String(hotzoneBounds.width));
      hotzone.setAttribute("height", String(hotzoneBounds.height));
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
    // Use the compiled asset dimensions as the stable control-frame geometry.
    // SVG getBBox() can become available only after the first interaction and
    // may exclude viewBox whitespace, which otherwise makes the controls jump
    // closer to the object after its first move.
    return getRotatedVisualBounds(
      getConfiguredObjectLocalRect({
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
        idPrefix: `${escapeSvgId(objectId)}-shadow`,
        forceFill: "#0e7490",
        opacity: "0.92",
      });
      shadowLayer.append(shadowShape);
    }

    const image = inlineSvgText
      ? this.createInlineObjectSvgElement(inlineSvgText, width, height, anchor, {
          idPrefix: `${escapeSvgId(objectId)}-image`,
        })
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
    options: { idPrefix?: string; forceFill?: string; opacity?: string } = {},
  ): SVGElement {
    const parser = new DOMParser();
    const parsedDocument = parser.parseFromString(svgText, "image/svg+xml");
    const sourceSvg = parsedDocument.documentElement as unknown as SVGElement;
    if (sourceSvg.nodeName.toLowerCase() !== "svg" || sourceSvg.querySelector("parsererror")) {
      return this.createObjectImageElement("", width, height, anchor);
    }

    const viewBox = parseSvgViewBox(sourceSvg.getAttribute("viewBox"));
    namespaceInlineSvgIds(sourceSvg, options.idPrefix ?? `inline-${nextInlineSvgNamespaceId()}`);
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

    // Selection keeps edit mode active, while pointer hover controls whether the
    // nearby handles remain visible. Leaving the object never exits edit mode.
    this.clearHideTimer();
    this.clearLimitFeedback();

    this.activeObjectId = objectId;
    for (const [currentObjectId, objectElement] of this.refs.objectElements.entries()) {
      objectElement.classList.toggle("is-active", currentObjectId === objectId);
      this.setObjectVisualHighlight(currentObjectId, currentObjectId === objectId);
    }
    for (const [currentObjectId, controlElement] of this.refs.controlElements.entries()) {
      controlElement.classList.toggle("is-active", currentObjectId === objectId);
      controlElement.classList.remove("is-controls-hidden");
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
      controlElement.classList.remove("is-controls-hidden");
    }
  }

  private setActiveControlsVisible(objectId: string, visible: boolean): void {
    if (this.activeObjectId !== objectId) {
      return;
    }

    if (visible) {
      this.clearHideTimer();
    }

    this.refs.controlElements.get(objectId)?.classList.toggle("is-controls-hidden", !visible);
  }

  private scheduleActiveControlsHide(objectId: string): void {
    this.clearHideTimer();
    if (this.activeObjectId !== objectId) {
      return;
    }

    this.hideControlsTimer = window.setTimeout(() => {
      this.hideControlsTimer = undefined;
      this.setActiveControlsVisible(objectId, false);
    }, 180);
  }

  private bindObjectPointerEvents(element: SVGElement, objectId: string): void {
    element.addEventListener("pointerdown", (event) => {
      if (this.options.isPaused?.()) {
        return;
      }
      const pointer = this.eventToRendererPointer(event);
      this.options.onDragStart?.(objectId, pointer);
      if (element.classList.contains("is-dragging")) {
        element.setPointerCapture(event.pointerId);
      }
    });

    element.addEventListener("pointermove", (event) => {
      if (this.options.isPaused?.()) {
        return;
      }
      if (!element.hasPointerCapture(event.pointerId)) {
        return;
      }

      this.options.onDragMove?.(objectId, this.eventToRendererPointer(event));
    });

    element.addEventListener("pointerup", (event) => {
      if (this.options.isPaused?.()) {
        return;
      }
      if (!element.hasPointerCapture(event.pointerId)) {
        return;
      }

      this.options.onDragEnd?.(objectId, this.eventToRendererPointer(event));
      element.releasePointerCapture(event.pointerId);
    });

    element.addEventListener("pointercancel", (event) => {
      if (this.options.isPaused?.()) {
        return;
      }
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

  private scheduleControlsLayoutSync(): void {
    const update = () => {
      for (const objectConfig of this.options.config.objects) {
        this.updateControlsLayout(objectConfig.id);
      }
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(update);
      return;
    }

    update();
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

export function isObjectInteractive(objectConfig: RuntimeTaskObject): boolean {
  const movement = objectConfig.behavior.movement;
  const hasButtonMovement = movement.mode === "button";
  const hasDragMovement = movement.mode === "drag" && objectConfig.behavior.free_drag.enabled;
  const hasRotation = objectConfig.behavior.rotation?.step !== undefined;
  return hasButtonMovement || hasDragMovement || hasRotation;
}

export function getObjectControlLayout(input: ControlLayoutInput): Record<ControlButtonAction, { x: number; y: number }> {
  const { bounds, ui, movementRotationDeg = 0 } = input;
  const { centerX, centerY, radius } = getObjectControlRingLayout(bounds, ui);

  const layout = {
    move_up: { x: centerX, y: centerY - radius },
    move_down: { x: centerX, y: centerY + radius },
    move_left: { x: centerX - radius, y: centerY },
    move_right: { x: centerX + radius, y: centerY },
    rotate_ccw: pointOnCircle(centerX, centerY, radius, -135),
    rotate_cw: pointOnCircle(centerX, centerY, radius, -45),
  };

  return {
    move_up: rotatePointAround(layout.move_up, { x: centerX, y: centerY }, movementRotationDeg),
    move_down: rotatePointAround(layout.move_down, { x: centerX, y: centerY }, movementRotationDeg),
    move_left: rotatePointAround(layout.move_left, { x: centerX, y: centerY }, movementRotationDeg),
    move_right: rotatePointAround(layout.move_right, { x: centerX, y: centerY }, movementRotationDeg),
    rotate_ccw: rotatePointAround(layout.rotate_ccw, { x: centerX, y: centerY }, movementRotationDeg),
    rotate_cw: rotatePointAround(layout.rotate_cw, { x: centerX, y: centerY }, movementRotationDeg),
  };
}

export function getTrialHeaderContent(input: {
  tutorialMode?: boolean;
  taskId: string;
  qid?: string;
  objectCount: number;
  presentation?: Pick<ReferencePresentation, "trialIndex" | "trialTotal">;
}): { title: string; meta: string } {
  const meta = `${input.taskId} - QID: ${input.qid ?? ""} - Objects: ${input.objectCount}`;
  if (input.tutorialMode) {
    return { title: "Tutorial", meta };
  }
  const title = input.presentation
    ? `Trial ${input.presentation.trialIndex} / ${input.presentation.trialTotal}`
    : "Trial";
  return { title, meta };
}

export function getObjectControlRingLayout(
  bounds: VisualBounds,
  ui: Pick<ReturnType<typeof getStageUiMetrics>, "controlRingRadius">,
): { centerX: number; centerY: number; radius: number } {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    centerX,
    centerY,
    radius: ui.controlRingRadius,
  };
}

export function getControlButtonTransform(
  _action: ControlButtonAction,
  position: { x: number; y: number },
  movementRotationDeg = 0,
): string {
  const rotation = movementRotationDeg % 360;
  const translate = `translate(${position.x} ${position.y})`;
  return rotation === 0 ? translate : `${translate} rotate(${rotation})`;
}

export function getLimitFeedbackTransform(rect: LocalRect, rotationDeg: number): string | undefined {
  const rotation = rotationDeg % 360;
  if (rotation === 0) {
    return undefined;
  }

  return `rotate(${rotation} ${rect.x + rect.width / 2} ${rect.y + rect.height / 2})`;
}

export function getControlHotzoneBounds(
  positions: Partial<Record<ControlButtonAction, { x: number; y: number }>>,
  controlRadius: number,
  padding = 0,
): LocalRect {
  const points = Object.values(positions);
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const inset = controlRadius + padding;
  const minX = Math.min(...points.map((point) => point.x)) - inset;
  const maxX = Math.max(...points.map((point) => point.x)) + inset;
  const minY = Math.min(...points.map((point) => point.y)) - inset;
  const maxY = Math.max(...points.map((point) => point.y)) + inset;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function rotatePointAround(
  point: { x: number; y: number },
  center: { x: number; y: number },
  rotationDeg: number,
): { x: number; y: number } {
  const rotation = rotationDeg % 360;
  if (rotation === 0) {
    return point;
  }

  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function pointOnCircle(centerX: number, centerY: number, radius: number, angleDeg: number): { x: number; y: number } {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: centerX + Math.cos(radians) * radius,
    y: centerY + Math.sin(radians) * radius,
  };
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

export function clampViewportZoom(zoom: number): number {
  return Math.min(Math.max(zoom, 0.75), 3);
}

export const DEFAULT_VIEWPORT_ZOOM = 1.3;

export function getViewportCameraTransform(
  config: RuntimeTaskConfig,
  zoom: number,
  pan: { x: number; y: number },
): string {
  const viewBox = config.world.viewBox;
  const centerX = viewBox.x + viewBox.width / 2;
  const centerY = viewBox.y + viewBox.height / 2;
  return `translate(${centerX + pan.x} ${centerY + pan.y}) scale(${clampViewportZoom(zoom)}) translate(${-centerX} ${-centerY})`;
}

function getSvgScreenScale(svg: SVGSVGElement): number {
  const screenScale = svg.getScreenCTM()?.a;
  if (screenScale && Number.isFinite(screenScale) && screenScale > 0) {
    return screenScale;
  }

  const bounds = svg.getBoundingClientRect();
  return bounds.width / svg.viewBox.baseVal.width || 1;
}

export function getStageDisplayTransform(config: RuntimeTaskConfig): string | undefined {
  const transforms: string[] = [];
  if (config.stage.display_flip_y) {
    const viewBox = config.world.viewBox;
    transforms.push(`translate(0 ${viewBox.y * 2 + viewBox.height}) scale(1 -1)`);
  }

  const rotation = config.stage.display_rotation_deg % 360;
  if (rotation !== 0) {
    const viewBox = config.world.viewBox;
    transforms.push(`rotate(${rotation} ${viewBox.x + viewBox.width / 2} ${viewBox.y + viewBox.height / 2})`);
  }

  return transforms.length === 0 ? undefined : transforms.join(" ");
}

export function getObjectVisualDisplayTransform(config: RuntimeTaskConfig): string | undefined {
  // Assets are authored in the source coordinate system while the stage is
  // displayed in screen coordinates. Counter-flip only the furniture artwork
  // so its authored orientation survives the stage's global Y flip.
  return config.stage.display_flip_y ? "scale(1 -1)" : undefined;
}

function renderTutorialMessage(container: HTMLElement, source: string): void {
  container.replaceChildren();
  const tokenPattern = /(\*\*[^*]+\*\*|\[\[yellow\]\][^[]+\[\[\/yellow\]\])/g;
  let cursor = 0;

  for (const match of source.matchAll(tokenPattern)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      container.append(document.createTextNode(source.slice(cursor, start)));
    }

    const token = match[0];
    const strong = document.createElement("strong");
    if (token.startsWith("[[yellow]]")) {
      strong.className = "layout-task-tutorial-yellow-emphasis";
      strong.textContent = token.slice("[[yellow]]".length, -"[[/yellow]]".length);
    } else {
      strong.textContent = token.slice(2, -2);
    }
    container.append(strong);
    cursor = start + token.length;
  }

  if (cursor < source.length) {
    container.append(document.createTextNode(source.slice(cursor)));
  }
}

export function getBackgroundDisplayTransform(config: RuntimeTaskConfig): string | undefined {
  if (!config.stage.background_flip_y) {
    return undefined;
  }

  const background = config.background;
  return `translate(0 ${background.y * 2 + background.height}) scale(1 -1)`;
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
  controlRingRadius: number;
} {
  const scale = getWorldUiScale(config, svg);
  const maxObjectRadius = Math.max(
    ...config.objects
      .filter(isObjectInteractive)
      .map((object) => Math.hypot(object.width, object.height) / 2),
    0,
  );
  return {
    scale,
    controlGap: 44 * scale,
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
    // One shared radius keeps the controls visually consistent across objects.
    // The largest interactive asset determines the minimum safe clearance.
    controlRingRadius: maxObjectRadius + 34 * scale,
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

let inlineSvgNamespaceCounter = 0;

function nextInlineSvgNamespaceId(): number {
  inlineSvgNamespaceCounter += 1;
  return inlineSvgNamespaceCounter;
}

function namespaceInlineSvgIds(sourceSvg: SVGElement, prefix: string): void {
  const idMap = new Map<string, string>();

  for (const element of Array.from(sourceSvg.querySelectorAll<SVGElement>("[id]"))) {
    const id = element.getAttribute("id");
    if (!id || idMap.has(id)) {
      continue;
    }
    idMap.set(id, `${prefix}-${id}`);
  }

  if (idMap.size === 0) {
    return;
  }

  for (const element of Array.from(sourceSvg.querySelectorAll<SVGElement>("*"))) {
    const id = element.getAttribute("id");
    if (id) {
      const mappedId = idMap.get(id);
      if (mappedId) {
        element.setAttribute("id", mappedId);
      }
    }

    for (const attribute of Array.from(element.attributes)) {
      const value = rewriteSvgReferenceValue(attribute.value, idMap);
      if (value !== attribute.value) {
        element.setAttribute(attribute.name, value);
      }
    }
  }
}

function rewriteSvgReferenceValue(value: string, idMap: Map<string, string>): string {
  let rewritten = value.replace(/url\(\s*(['"]?)#([^)'" ]+)\1\s*\)/g, (match, quote: string, id: string) => {
    const mappedId = idMap.get(id);
    return mappedId ? `url(${quote}#${mappedId}${quote})` : match;
  });

  if (rewritten.startsWith("#")) {
    const mappedId = idMap.get(rewritten.slice(1));
    if (mappedId) {
      rewritten = `#${mappedId}`;
    }
  }

  return rewritten;
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

function createControlIcon(iconFile: string, size: number): SVGElement {
  // Icons are served from public assets so the same files can be reused by
  // the standalone page and future jsPsych integration.
  const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
  image.classList.add("layout-task-control-icon");
  image.setAttribute("href", getPlayerIconUrl(iconFile));
  image.setAttribute("x", String(-size / 2));
  image.setAttribute("y", String(-size / 2));
  image.setAttribute("width", String(size));
  image.setAttribute("height", String(size));
  image.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return image;
}

export function getPlayerIconUrl(iconFile: string, pageUrl = globalThis.location?.href ?? "http://example.test/"): string {
  return new URL(`layout-task/assets/icons/${iconFile}`, pageUrl).toString();
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
