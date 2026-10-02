export interface CompletionCodeGateOptions {
  minDisplayMs?: number;
  documentRef?: Document;
  now?: () => number;
}

export class CompletionCodeGate {
  private readonly minDisplayMs: number;
  private readonly documentRef: Document;
  private readonly now: () => number;
  private rootElement: HTMLElement | undefined;
  private input: HTMLInputElement | undefined;
  private continueButton: HTMLButtonElement | undefined;
  private startedAt = 0;
  private complete = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private resolveCompletion: ((value: string) => void) | undefined;

  constructor(options: CompletionCodeGateOptions = {}) {
    this.minDisplayMs = options.minDisplayMs ?? 15_000;
    this.documentRef = options.documentRef ?? document;
    this.now = options.now ?? (() => Date.now());
  }

  mount(root: HTMLElement): void {
    if (this.rootElement) {
      return;
    }

    this.startedAt = this.now();
    this.complete = false;

    const section = this.documentRef.createElement("section");
    section.className = "layout-task-shell layout-task-completion-code-shell";
    section.setAttribute("aria-live", "polite");

    const title = this.documentRef.createElement("h1");
    title.textContent = "完成实验";

    const instruction = this.documentRef.createElement("p");
    const emphasis = this.documentRef.createElement("strong");
    emphasis.className = "layout-task-completion-code-emphasis";
    emphasis.textContent = "填写完成码并截图保存本页";
    instruction.append("请在下方", emphasis, "。以便发布者审核数据与发放报酬(202609259125)。");

    const explanation = this.documentRef.createElement("p");
    explanation.textContent = "完成码来自外部问卷或系统，请原样粘贴。此页面不会验证完成码格式。";

    const label = this.documentRef.createElement("label");
    label.textContent = "完成码";
    const input = this.documentRef.createElement("input");
    input.type = "text";
    input.required = true;
    input.autocomplete = "off";
    input.id = "layout-task-completion-code";
    input.dataset.completionCodeInput = "";
    label.htmlFor = input.id;

    const countdown = this.documentRef.createElement("p");
    countdown.className = "layout-task-completion-code-countdown";
    countdown.dataset.completionCodeCountdown = "";

    const button = this.documentRef.createElement("button");
    button.type = "button";
    button.className = "layout-task-primary-button";
    button.dataset.completionCodeContinue = "";
    button.textContent = "Continue";

    section.append(title, instruction, explanation, label, input, countdown, button);
    root.append(section);
    this.rootElement = section;
    this.input = input;
    this.continueButton = button;

    input.addEventListener("input", () => this.update());
    button.addEventListener("click", () => {
      if (button.disabled) {
        return;
      }
      this.complete = true;
      button.disabled = true;
      input.disabled = true;
      this.resolveCompletion?.(input.value);
      this.resolveCompletion = undefined;
    });

    this.timer = setInterval(() => this.update(), 250);
    this.update();
  }

  waitForCompletion(): Promise<string> {
    if (this.complete) {
      return Promise.resolve(this.getValue());
    }
    return new Promise((resolve) => {
      this.resolveCompletion = resolve;
    });
  }

  isComplete(): boolean {
    return this.complete;
  }

  getValue(): string {
    return this.input?.value ?? "";
  }

  destroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.rootElement?.remove();
    this.rootElement = undefined;
    this.input = undefined;
    this.continueButton = undefined;
    this.resolveCompletion = undefined;
  }

  private update(): void {
    if (!this.input || !this.continueButton || !this.rootElement) {
      return;
    }

    const elapsed = Math.max(0, this.now() - this.startedAt);
    const remaining = Math.max(0, this.minDisplayMs - elapsed);
    const seconds = Math.ceil(remaining / 1_000);
    const countdown = this.rootElement.querySelector<HTMLElement>("[data-completion-code-countdown]");
    if (countdown) {
      countdown.textContent = remaining > 0
        ? `Continue will be available in ${seconds} seconds.`
        : "You may continue when ready.";
    }
    this.continueButton.disabled = remaining > 0 || this.input.value.trim().length === 0 || this.complete;
  }
}
