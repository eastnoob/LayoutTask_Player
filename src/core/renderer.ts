import type { RuntimeTaskConfig } from "../types/runtime";
import type { CopyResult } from "./clipboard-service";
import type { StateStore } from "./state-store";

export interface RendererRefs {
  root: HTMLElement;
  svg?: SVGSVGElement;
  backgroundElement?: SVGElement;
  objectElements: Map<string, SVGElement>;
  confirmButton?: HTMLButtonElement;
  copyAgainButton?: HTMLButtonElement;
  resultOutput?: HTMLTextAreaElement;
  statusElement?: HTMLElement;
}

export class LayoutTaskRenderer {
  readonly refs: RendererRefs;

  constructor(
    private readonly options: {
      root: HTMLElement;
      config: RuntimeTaskConfig;
      store: StateStore;
      onObjectClick?: (objectId: string, event: MouseEvent) => void;
      onConfirm?: () => void;
      onCopyAgain?: () => void;
    },
  ) {
    this.refs = {
      root: options.root,
      objectElements: new Map<string, SVGElement>(),
    };
  }

  mount(): RendererRefs {
    this.renderAll();
    return this.refs;
  }

  renderAll(): void {
    this.options.root.replaceChildren();
    this.refs.objectElements.clear();

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

    for (const objectConfig of this.options.config.objects) {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.classList.add("layout-task-object");
      group.dataset.objectId = objectConfig.id;
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", `${objectConfig.id}: click to rotate`);

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

      group.addEventListener("click", (event) => {
        this.options.onObjectClick?.(objectConfig.id, event);
      });
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.options.onObjectClick?.(objectConfig.id, new MouseEvent("click"));
        }
      });

      group.append(image);
      objectLayer.append(group);
      this.refs.objectElements.set(objectConfig.id, group);
      this.updateObject(objectConfig.id);
    }

    stageWrap.append(svg);

    const panel = document.createElement("aside");
    panel.className = "layout-task-panel";

    const panelTitle = document.createElement("h2");
    panelTitle.textContent = "Minimal Player";

    const instruction = document.createElement("p");
    instruction.textContent = "Click an object to rotate it by 45 degrees. Confirming locks the layout and copies the JSON result.";

    const confirmButton = document.createElement("button");
    confirmButton.className = "layout-task-primary-button";
    confirmButton.type = "button";
    confirmButton.textContent = "确认并复制 JSON";
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
    copyAgainButton.textContent = "再次复制";
    copyAgainButton.hidden = true;
    copyAgainButton.addEventListener("click", () => this.options.onCopyAgain?.());

    panel.append(panelTitle, instruction, confirmButton, status, output, copyAgainButton);
    workspace.append(stageWrap, panel);
    shell.append(header, workspace);
    this.options.root.append(shell);

    this.refs.svg = svg;
    this.refs.backgroundElement = background;
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
  }

  setStatus(message: string): void {
    if (this.refs.statusElement) {
      this.refs.statusElement.textContent = message;
    }
  }

  setLocked(locked: boolean): void {
    this.options.root.classList.toggle("layout-task-locked", locked);

    for (const objectElement of this.refs.objectElements.values()) {
      objectElement.classList.toggle("is-locked", locked);
    }

    if (this.refs.confirmButton) {
      this.refs.confirmButton.disabled = locked;
    }
  }

  showCompletion(outputText: string, copyResult: CopyResult): void {
    this.setStatus(
      copyResult.ok
        ? "已锁定并复制 JSON。请返回问卷粘贴结果。"
        : "已锁定。自动复制失败，请手动复制下方 JSON。",
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
    this.options.root.innerHTML = "";
  }
}
