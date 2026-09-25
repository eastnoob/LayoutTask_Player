import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompletionCodeGate } from "./completion-code-gate";

describe("CompletionCodeGate", () => {
  let now: number;

  beforeEach(() => {
    now = 0;
    vi.useFakeTimers();
  });

  it("keeps Continue disabled until 15 seconds and requires non-empty input", () => {
    const documentRef = new FakeDocument();
    const root = documentRef.createElement("main");
    const gate = new CompletionCodeGate({ documentRef: documentRef as unknown as Document, now: () => now });
    gate.mount(root as unknown as HTMLElement);

    const input = root.querySelector<FakeElement>("[data-completion-code-input]")!;
    const button = root.querySelector<FakeElement>("[data-completion-code-continue]")!;
    expect(button.disabled).toBe(true);

    input.value = "  CODE-17  ";
    input.dispatch("input");
    now = 15_000;
    vi.advanceTimersByTime(250);
    expect(button.disabled).toBe(false);

    input.value = "";
    input.dispatch("input");
    expect(button.disabled).toBe(true);
    gate.destroy();
  });

  it("preserves the exact non-empty value when Continue is clicked", () => {
    const documentRef = new FakeDocument();
    const root = documentRef.createElement("main");
    const gate = new CompletionCodeGate({ documentRef: documentRef as unknown as Document, now: () => now });
    gate.mount(root as unknown as HTMLElement);
    const input = root.querySelector<FakeElement>("[data-completion-code-input]")!;
    const button = root.querySelector<FakeElement>("[data-completion-code-continue]")!;

    input.value = "  CODE-17  ";
    input.dispatch("input");
    now = 15_000;
    vi.advanceTimersByTime(250);
    button.click();

    expect(gate.isComplete()).toBe(true);
    expect(gate.getValue()).toBe("  CODE-17  ");
    gate.destroy();
  });

  it("renders the exact Chinese copy with only the requested phrase emphasized", () => {
    const documentRef = new FakeDocument();
    const root = documentRef.createElement("main");
    const gate = new CompletionCodeGate({ documentRef: documentRef as unknown as Document, now: () => now });
    gate.mount(root as unknown as HTMLElement);

    expect(root.textContent).toContain("请在下方填写完成码并截图保存本页。以便发布者审核数据与发放报酬(202609259125)。");
    const emphasis = root.querySelector<FakeElement>(".layout-task-completion-code-emphasis");
    expect(emphasis?.tagName).toBe("strong");
    expect(emphasis?.className).toBe("layout-task-completion-code-emphasis");
    gate.destroy();
  });
});

class FakeElement {
  readonly children: Array<FakeElement | string> = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  readonly dataset: Record<string, string> = {};
  parent: FakeElement | undefined;
  private ownText = "";
  value = "";
  disabled = false;
  hidden = false;
  type = "";
  className = "";

  constructor(readonly tagName: string) {}

  set textContent(value: string) {
    this.ownText = value;
  }

  get textContent(): string {
    return this.ownText + this.children.map((child) => typeof child === "string" ? child : child.textContent).join("");
  }

  append(...children: Array<FakeElement | string>): void {
    children.forEach((child) => {
      if (typeof child !== "string") {
        child.parent = this;
      }
      this.children.push(child);
    });
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  dispatch(type: string): void {
    this.listeners.get(type)?.();
  }

  click(): void {
    if (!this.disabled) {
      this.dispatch("click");
    }
  }

  querySelector<T extends FakeElement>(selector: string): T | null {
    for (const child of this.children) {
      if (typeof child === "string") {
        continue;
      }
      if (child.matches(selector)) {
        return child as T;
      }
      const nested = child.querySelector<T>(selector);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  matches(selector: string): boolean {
    if (selector.startsWith(".")) {
      return this.className.split(/\s+/).includes(selector.slice(1));
    }
    const attribute = selector.match(/^\[([^\]]+)\]$/)?.[1];
    if (!attribute) {
      return false;
    }
    if (this.attributes.has(attribute)) {
      return true;
    }
    const dataName = attribute.startsWith("data-")
      ? attribute.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
      : "";
    return Boolean(dataName && dataName in this.dataset);
  }

  remove(): void {
    const index = this.parent?.children.indexOf(this) ?? -1;
    if (index >= 0) {
      this.parent?.children.splice(index, 1);
    }
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }
}
