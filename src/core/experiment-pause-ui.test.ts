import { describe, expect, it, vi } from "vitest";
import { ExperimentPauseController } from "./experiment-pause";
import { createExperimentPauseUi } from "./experiment-pause-ui";

describe("ExperimentPauseUi", () => {
  it("renders confirmation, blocking overlay, countdown, and disabled state", () => {
    const documentRef = new FakeDocument();
    const controller = new ExperimentPauseController({ mode: "formal", now: () => 1_000 });
    const ui = createExperimentPauseUi({ controller, documentRef: documentRef as unknown as Document, now: () => 1_000 });
    ui.mount();

    const pauseButton = documentRef.querySelector<FakeElement>("[data-layout-task-pause]");
    expect(pauseButton?.textContent).toContain("Pause");
    pauseButton?.click();
    expect(documentRef.body.textContent).toContain("This is your only pause opportunity");

    documentRef.querySelector<FakeElement>("[data-layout-task-pause-confirm]")?.click();
    expect(documentRef.querySelector<FakeElement>("[data-layout-task-pause-overlay]")?.getAttribute("aria-modal")).toBe("true");
    expect(documentRef.body.textContent).toContain("15:00");

    documentRef.querySelector<FakeElement>("[data-layout-task-pause-resume]")?.click();
    expect(pauseButton?.disabled).toBe(true);
    ui.destroy();
    expect(documentRef.querySelector("[data-layout-task-pause-root]")).toBeNull();
  });

  it("hides the control when the page is inactive", () => {
    const documentRef = new FakeDocument();
    const controller = new ExperimentPauseController({ mode: "formal" });
    const ui = createExperimentPauseUi({ controller, documentRef: documentRef as unknown as Document });
    ui.mount();
    ui.setPageActive(false);
    expect(documentRef.querySelector<FakeElement>("[data-layout-task-pause-root]")?.hidden).toBe(true);
    ui.setPageActive(true);
    expect(documentRef.querySelector<FakeElement>("[data-layout-task-pause-root]")?.hidden).toBe(false);
    ui.destroy();
  });

  it("uses a separate tutorial practice controller", () => {
    const documentRef = new FakeDocument();
    const formal = new ExperimentPauseController({ mode: "formal" });
    const practice = new ExperimentPauseController({ mode: "tutorial_practice" });
    const ui = createExperimentPauseUi({ controller: formal, practiceController: practice, documentRef: documentRef as unknown as Document });
    ui.mount();
    ui.setTutorialPracticeEnabled(true);
    documentRef.querySelector<FakeElement>("[data-layout-task-pause]")?.click();
    expect(practice.snapshot().status).toBe("practice_paused");
    expect(formal.snapshot().pauseUsed).toBe(false);
    vi.useRealTimers();
    ui.destroy();
  });
});

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  hidden = false;
  disabled = false;
  className = "";
  parent: FakeElement | undefined;
  private ownText = "";
  private listeners = new Map<string, () => void>();

  constructor(readonly tagName: string) {}

  set textContent(value: string | null) {
    this.ownText = value ?? "";
  }

  get textContent(): string {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }

  append(...children: FakeElement[]): void {
    children.forEach((child) => {
      child.parent = this;
      this.children.push(child);
    });
  }

  remove(): void {
    const index = this.parent?.children.indexOf(this) ?? -1;
    if (index >= 0) {
      this.parent?.children.splice(index, 1);
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  click(): void {
    this.listeners.get("click")?.();
  }

  querySelector<T extends FakeElement = FakeElement>(selector: string): T | null {
    const dataKey = selector.match(/^\[data-([^\]]+)\]$/)?.[1];
    for (const child of this.children) {
      if (dataKey && Object.prototype.hasOwnProperty.call(child.dataset, dataKey.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()))) {
        return child as T;
      }
      const nested = child.querySelector<T>(selector);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
}

class FakeDocument {
  readonly body = new FakeElement("body");

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  querySelector<T extends FakeElement = FakeElement>(selector: string): T | null {
    return this.body.querySelector<T>(selector);
  }
}
