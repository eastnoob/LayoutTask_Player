import type { RuntimeTaskConfig } from "../types/runtime";
import type { LayoutAction } from "../types/events";
import type { CopyResult } from "./clipboard-service";
import type { StateStore } from "./state-store";

export interface RendererRefs {
  root: HTMLElement;
  svg?: SVGSVGElement;
  backgroundElement?: SVGElement;
  objectElements: Map<string, SVGElement>;
  controlElements: Map<string, SVGElement>;
  controlButtons: Map<string, Map<LayoutAction, SVGElement>>;
  controlsLayer?: SVGElement;
  confirmButton?: HTMLButtonElement;
  copyAgainButton?: HTMLButtonElement;
  resultOutput?: HTMLTextAreaElement;
  statusElement?: HTMLElement;
}

export class LayoutTaskRenderer {
  readonly refs: RendererRefs;
  private activeObjectId: string | undefined;
  private hideControlsTimer: number | undefined;

  constructor(
    private readonly options: {
      root: HTMLElement;
      config: RuntimeTaskConfig;
      store: StateStore;
      onAction?: (objectId: string, action: LayoutAction, event: MouseEvent | KeyboardEvent) => void;
      onObjectSelect?: (objectId: string) => void;
      onStageBackgroundClick?: () => void;
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

    header.append(eyebrow, title, meta);

    const workspace = document.createElement("main");
    workspace.className = "layout-task-workspace";

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

    const controlsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    controlsLayer.classList.add("layout-task-controls-layer");

    for (const objectConfig of this.options.config.objects) {
      const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
      wrapper.classList.add("layout-task-object-wrapper");
      wrapper.dataset.objectId = objectConfig.id;

      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.classList.add("layout-task-object");
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
    instruction.textContent = "Click an object to enter edit mode. Controls stay visible until you tap the stage background to exit.";

    const confirmButton = document.createElement("button");
    confirmButton.className = "layout-task-primary-button";
    confirmButton.type = "button";
    confirmButton.textContent = "Confirm and copy result";
    confirmButton.addEventListener("click", () => this.options.onConfirm?.());

    const status = document.createElement("p");
    status.className = "layout-task-status";
    status.textContent = "Ready";

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
    this.options.root.append(shell);

    this.refs.svg = svg;
    this.refs.backgroundElement = background;
    this.refs.controlsLayer = controlsLayer;
    this.refs.confirmButton = confirmButton;
    this.refs.statusElement = status;
    this.refs.resultOutput = output;
    this.refs.copyAgainButton = copyAgainButton;
  }

  updateObject(objectId: string): void {
    const element = this.refs.objectElements.get(objectId);
    if (!element) {
      return;
    }

    const state = this.options.store.getObjectState(objectId);
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

  setStatus(message: string): void {
    if (this.refs.statusElement) {
      this.refs.statusElement.textContent = message;
    }
  }

  setLocked(locked: boolean): void {
    this.options.root.classList.toggle("layout-task-locked", locked);
    if (locked) {
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
    this.options.root.innerHTML = "";
  }

  private createControls(objectId: string, objectWidth: number, objectHeight: number): SVGElement {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("layout-task-controls");
    group.dataset.objectId = objectId;

    const gap = 30;
    const controls: Array<{
      action: LayoutAction;
      label: string;
      x: number;
      y: number;
      icon: string;
    }> = [
      { action: "move_up", label: "Move up", x: 0, y: -objectHeight / 2 - gap, icon: "arrow-up.svg" },
      { action: "move_down", label: "Move down", x: 0, y: objectHeight / 2 + gap, icon: "arrow-down.svg" },
      { action: "move_left", label: "Move left", x: -objectWidth / 2 - gap, y: 0, icon: "arrow-left.svg" },
      { action: "move_right", label: "Move right", x: objectWidth / 2 + gap, y: 0, icon: "arrow-right.svg" },
      {
        action: "rotate_ccw",
        label: "Rotate counter-clockwise",
        x: -objectWidth / 2 - gap,
        y: -objectHeight / 2 - gap,
        icon: "rotate-ccw.svg",
      },
      {
        action: "rotate_cw",
        label: "Rotate clockwise",
        x: objectWidth / 2 + gap,
        y: -objectHeight / 2 - gap,
        icon: "rotate-cw.svg",
      },
    ];

    const buttonMap = new Map<LayoutAction, SVGElement>();

    for (const control of controls) {
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
        if (button.classList.contains("is-disabled")) {
          return;
        }
        this.options.onAction?.(objectId, control.action, event);
      });

      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (button.classList.contains("is-disabled")) {
          return;
        }
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

    this.clearHideTimer();

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
    this.activeObjectId = undefined;

    for (const objectElement of this.refs.objectElements.values()) {
      objectElement.classList.remove("is-active");
    }

    for (const controlElement of this.refs.controlElements.values()) {
      controlElement.classList.remove("is-active");
    }
  }

  private clearHideTimer(): void {
    if (this.hideControlsTimer !== undefined) {
      window.clearTimeout(this.hideControlsTimer);
      this.hideControlsTimer = undefined;
    }
  }
}

function createControlIcon(baseUrl: string, iconFile: string): SVGElement {
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
