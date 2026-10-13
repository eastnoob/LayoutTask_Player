import { describe, expect, it } from "vitest";
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

  it("keeps the pause button visible but disabled during the tutorial", () => {
    const documentRef = new FakeDocument();
    const controller = new ExperimentPauseController({ mode: "formal" });
    const ui = createExperimentPauseUi({ controller, documentRef: documentRef as unknown as Document });
    ui.mount();
    ui.setPageActive(true);
    ui.setPauseEnabled(false);

    const pauseButton = documentRef.querySelector<FakeElement>("[data-layout-task-pause]");
    expect(documentRef.querySelector<FakeElement>("[data-layout-task-pause-root]")?.hidden).toBe(false);
    expect(pauseButton?.disabled).toBe(true);
    pauseButton?.click();
    expect(controller.snapshot().status).toBe("available");

    ui.setPauseEnabled(true);
    expect(pauseButton?.disabled).toBe(false);
    ui.destroy();
  });

  it("localizes the tutorial practice confirmation, countdown, and highlight lifecycle", () => {
    const documentRef = new FakeDocument();
    let now = 1_000;
    const controller = new ExperimentPauseController({ mode: "tutorial_practice", now: () => now });
    const ui = createExperimentPauseUi({
      controller,
      documentRef: documentRef as unknown as Document,
      now: () => now,
      locale: "zh-CN",
    });
    ui.mount();

    const root = documentRef.querySelector<FakeElement>("[data-layout-task-pause-root]");
    const pauseButton = documentRef.querySelector<FakeElement>("[data-layout-task-pause]");
    ui.setPauseEnabled(true);
    expect(root?.className).toContain("is-tutorial-pause-practice");
    pauseButton?.click();
    expect(documentRef.body.textContent).toContain("最长 10 秒");
    expect(documentRef.body.textContent).toContain("不会消耗正式实验的暂停机会");

    documentRef.querySelector<FakeElement>("[data-layout-task-pause-cancel]")?.click();
    expect(controller.snapshot().status).toBe("practice_available");
    expect(root?.className).toContain("is-tutorial-pause-practice");

    pauseButton?.click();
    documentRef.querySelector<FakeElement>("[data-layout-task-pause-confirm]")?.click();
    expect(documentRef.body.textContent).toContain("00:10");
    expect(root?.className).not.toContain("is-tutorial-pause-practice");
    documentRef.querySelector<FakeElement>("[data-layout-task-pause-resume]")?.click();
    expect(controller.snapshot().status).toBe("practice_consumed");
    expect(root?.className).not.toContain("is-tutorial-pause-practice");
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
  readonly classList = {
    contains: (name: string) => this.className.split(/\s+/).includes(name),
    add: (...names: string[]) => {
      const values = new Set(this.className.split(/\s+/).filter(Boolean));
      names.forEach((name) => values.add(name));
      this.className = Array.from(values).join(" ");
    },
    remove: (...names: string[]) => {
      const removed = new Set(names);
      this.className = this.className.split(/\s+/).filter((name) => name && !removed.has(name)).join(" ");
    },
    toggle: (name: string, force?: boolean) => {
      const next = force ?? !this.classList.contains(name);
      if (next) this.classList.add(name); else this.classList.remove(name);
      return next;
    },
  };
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
