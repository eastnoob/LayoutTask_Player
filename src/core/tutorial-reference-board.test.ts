import { describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import experimentConfig from "../../public/experiment/experiment.json";
import {
  buildTutorialReferenceBoardPage,
  buildTutorialReferenceBoardPages,
  installTutorialReferenceBoardInteractions,
  mountTutorialReferenceBoard,
  type TutorialReferenceBoardState,
} from "./tutorial-reference-board";
import type { ExperimentTutorialReferenceBoardConfig } from "../types/experiment";
import { buildExperimentTimeline } from "../experiment-runner";
import { parseExperimentConfig } from "../schemas/experiment.schema";

vi.mock("jspsych", () => ({
  initJsPsych: vi.fn(),
  ParameterType: { OBJECT: "object", STRING: "string", BOOL: "bool" },
}));
vi.mock("@jspsych/plugin-instructions", () => ({ default: function InstructionsPlugin() {} }));

function board(): ExperimentTutorialReferenceBoardConfig {
  return {
    enabled: true,
    continueLabel: "Continue",
    items: [
      ["m01", "Armchairs and Coffee Table"],
      ["m03", "Dining Table and Chairs"],
      ["m04", "Bookcase"],
      ["m05", "Sofa and Coffee Table"],
    ].map(([id, name]) => ({
      id,
      name,
      allSvg: `assets/tutorial-reference/tutorial/whole/svg/${id}.svg`,
      variableSvg: `assets/tutorial-reference/tutorial/variable/svg/${id}.svg`,
      allAnimation: `assets/tutorial-reference/tutorial/whole/${id}.gif`,
      variableAnimation: `assets/tutorial-reference/tutorial/variable/${id}.gif`,
    })),
  };
}

describe("buildTutorialReferenceBoardPage", () => {
  it("mounts four pages in one player, gates each Continue for five seconds, and restores its DOM", () => {
    vi.useFakeTimers();
    const documentRef = { createElement: (tag: string) => new BoardElement(tag) };
    const root = new BoardElement("root");
    root.ownerDocument = documentRef;
    const playerShell = new BoardElement("section");
    root.append(playerShell);
    const onComplete = vi.fn();
    const mounted = mountTutorialReferenceBoard({ root: root as unknown as HTMLElement,
      pages: ["page1", "page2", "page3", "page4"], continueLabel: "Continue", onComplete });
    try {
      expect(playerShell.style.display).toBe("none");
      const host = root.children[1];
      const [content, nav] = host.children;
      const button = nav.children[0];
      expect(content.innerHTML).toBe("page1");
      for (let page = 1; page <= 4; page++) {
        expect(button.disabled).toBe(true);
        button.click(); expect(content.innerHTML).toBe(`page${page}`);
        vi.advanceTimersByTime(4_000); expect(button.disabled).toBe(true);
        vi.advanceTimersByTime(1_000); expect(button.disabled).toBe(false);
        button.click();
      }
      expect(onComplete).toHaveBeenCalledOnce();
      expect(root.children).toEqual([playerShell]);
      expect(playerShell.style.display).toBe("");
      expect(vi.getTimerCount()).toBe(0);
    } finally { mounted.destroy(); vi.useRealTimers(); }
  });

  it("cleans up an interrupted reading countdown without completing the board", () => {
    vi.useFakeTimers();
    const root = new BoardElement("root");
    root.ownerDocument = { createElement: (tag: string) => new BoardElement(tag) };
    const onComplete = vi.fn();
    const mounted = mountTutorialReferenceBoard({ root: root as unknown as HTMLElement,
      pages: ["page1"], continueLabel: "继续", onComplete });
    mounted.destroy();
    expect(vi.getTimerCount()).toBe(0);
    expect(onComplete).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("renders each card as an SVG row above an independent GIF row", () => {
    const html = buildTutorialReferenceBoardPage({
      baseUrl: "/layout-task-generated/",
      board: board(),
    });

    expect(html.match(/<article class="layout-task-tutorial-board-card">/g)).toHaveLength(4);
    expect(html).toContain("/layout-task-generated/assets/tutorial-reference/tutorial/whole/svg/m01.svg");
    expect(html).toContain("/layout-task-generated/assets/tutorial-reference/tutorial/variable/svg/m01.svg");
    expect(html).toContain("/layout-task-generated/assets/tutorial-reference/tutorial/whole/m01.gif");
    expect(html).toContain("/layout-task-generated/assets/tutorial-reference/tutorial/variable/m01.gif");
    expect(html).toContain('class="layout-task-tutorial-board-svg-grid"');
    expect(html).toContain('class="layout-task-tutorial-board-gif-grid"');
    expect(html).toContain(">Armchairs and Coffee Table<");
    expect(html).toContain(">All Furniture<");
    expect(html).toContain(">Movable Item<");
    expect(html).not.toContain(">M01<");
    expect(html).not.toContain("Bedside Tables");
    expect(html).toContain("Reference board");
    expect(html).toContain("Inspect each furniture arrangement");
    expect(html).toContain("Dragging is optional");
    expect(html).toContain("use the wheel while holding to zoom");
    expect(html).toContain("movable furniture is marked in yellow");
    expect(html).not.toContain("relation.svg");
    expect(html).not.toContain("<h1");
  });

  it("adds a local hand prompt to each independently draggable SVG frame", () => {
    const english = buildTutorialReferenceBoardPage({
      baseUrl: "/layout-task-generated/",
      board: board(),
    });
    const chinese = buildTutorialReferenceBoardPage({
      baseUrl: "/layout-task-generated/",
      locale: "zh-CN",
      board: board(),
    });

    expect(english.match(/data-reference-frame-key=/g)).toHaveLength(8);
    expect(english.match(/class="layout-task-tutorial-board-hand"/g)).toHaveLength(8);
    expect(english).toContain("/experiment/layout-task/assets/icons/hand.svg");
    expect(english).toContain("Click and hold to drag");
    expect(chinese).toContain("按住拖动观察");
  });

  it("clamps each frame independently and hides the prompt after real movement", () => {
    const first = new DragFrame();
    const second = new DragFrame();
    installTutorialReferenceBoardInteractions({ querySelectorAll: () => [first, second] } as unknown as ParentNode);

    first.dispatch("pointerdown", { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    first.dispatch("pointerup", { pointerId: 1, clientX: 10, clientY: 10 });
    expect(first.dataset.referenceDragged).toBeUndefined();
    expect(first.hand.classList.contains("is-hidden")).toBe(false);

    first.dispatch("pointerdown", { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    first.dispatch("pointermove", { pointerId: 1, clientX: 1_000, clientY: 1_000 });
    first.dispatch("pointerup", { pointerId: 1, clientX: 1_000, clientY: 1_000 });

    expect(first.image.style.transform).toBe("translate(25px, 20px) scale(1)");
    expect(first.dataset.referenceDragged).toBe("true");
    expect(first.hand.classList.contains("is-hidden")).toBe(true);
    expect(second.image.style.transform).toBe("");
    expect(second.dataset.referenceDragged).toBeUndefined();

    first.dispatch("pointermove", { pointerId: 1, clientX: 50, clientY: 40 });
    expect(first.hand.classList.contains("is-hidden")).toBe(false);
  });

  it("zooms only while held, clamps zoom and pan, and continues dragging without a jump", () => {
    const frame = new DragFrame("m01:all");
    const other = new DragFrame("m01:variable");
    const frames: TutorialReferenceBoardState = new Map();
    const stop = installTutorialReferenceBoardInteractions({ querySelectorAll: () => [frame, other] } as unknown as ParentNode, frames);
    const wheel = (deltaY: number) => {
      const event = { deltaY, preventDefault: vi.fn() };
      frame.listeners.get("wheel")?.(event as never);
      return event.preventDefault;
    };
    try {
      expect(wheel(-100)).not.toHaveBeenCalled();
      frame.dispatch("pointerdown", { button: 0, pointerId: 1, clientX: 50, clientY: 40 });
      expect(wheel(-100)).toHaveBeenCalledOnce();
      expect(frames.get("m01:all")).toMatchObject({ zoom: 1.25, dragged: false });
      for (let i = 0; i < 20; i++) wheel(-100);
      expect(frames.get("m01:all")?.zoom).toBe(4);
      frame.dispatch("pointermove", { pointerId: 1, clientX: 150, clientY: 120 });
      for (let i = 0; i < 20; i++) wheel(100);
      expect(frames.get("m01:all")).toEqual({ x: 25, y: 20, zoom: 1, dragged: true });
      frame.dispatch("pointermove", { pointerId: 1, clientX: 145, clientY: 115 });
      expect(frames.get("m01:all")).toMatchObject({ x: 20, y: 15 });
      frame.dispatch("pointerup", { pointerId: 1 });
      expect(wheel(-100)).not.toHaveBeenCalled();
      frame.dispatch("pointerdown", { button: 0, pointerId: 2, clientX: 50, clientY: 40 });
      frame.dispatch("pointercancel", { pointerId: 2 });
      expect(wheel(-100)).not.toHaveBeenCalled();
      expect(frames.get("m01:variable")).toEqual({ x: 0, y: 0, zoom: 1, dragged: false });
    } finally { stop(); }
    expect(frame.listeners.size).toBe(0);
  });

  it("restores each frame's zoom together with its position on a revisit", () => {
    const frames: TutorialReferenceBoardState = new Map();
    const first = new DragFrame("m01:all");
    const stop = installTutorialReferenceBoardInteractions({ querySelectorAll: () => [first] } as unknown as ParentNode, frames);
    drag(first, 15, 10);
    first.dispatch("pointerdown", { button: 0, pointerId: 1, clientX: 50, clientY: 40 });
    first.listeners.get("wheel")?.({ deltaY: -100, preventDefault: vi.fn() } as never);
    first.dispatch("pointerup", { pointerId: 1 });
    stop();
    const restored = new DragFrame("m01:all");
    const clean = installTutorialReferenceBoardInteractions({ querySelectorAll: () => [restored] } as unknown as ParentNode, frames);
    try {
      expect(restored.image.style.transform).toBe("translate(15px, 10px) scale(1.25)");
      expect(restored.hand.classList.contains("is-hidden")).toBe(true);
    } finally { clean(); }
  });

  it("stops held-wheel zoom when left is released while right remains pressed", () => {
    const frame = new DragFrame("m01:all");
    const frames: TutorialReferenceBoardState = new Map();
    const stop = installTutorialReferenceBoardInteractions({ querySelectorAll: () => [frame] } as unknown as ParentNode, frames);
    try {
      frame.dispatch("pointerdown", { button: 0, buttons: 1, pointerId: 1, clientX: 50, clientY: 40 });
      frame.dispatch("pointermove", { buttons: 2, pointerId: 1, clientX: 50, clientY: 40 });
      const preventDefault = vi.fn();
      frame.listeners.get("wheel")?.({ deltaY: -100, preventDefault } as never);
      expect(frames.get("m01:all")?.zoom).toBe(1);
      expect(preventDefault).not.toHaveBeenCalled();
      expect(frame.classList.contains("is-dragging")).toBe(false);
    } finally { stop(); }
  });

  it("restores each frame on a mounted page revisit and resets on a new board", () => {
    vi.useFakeTimers();
    const root = new BoardElement("root");
    const pages = buildTutorialReferenceBoardPages({ baseUrl: "/tutorial/", board: board() });
    const input = { root: root as unknown as HTMLElement, pages: [pages[0], pages[1], pages[0]],
      continueLabel: "继续", onComplete: vi.fn() };
    const mounted = mountTutorialReferenceBoard(input);
    try {
      const [content, nav] = root.children[0].children;
      const button = nav.children[0];
      const [all, variable] = content.frames;
      drag(all, 20, 10);
      drag(variable, -10, -5);
      vi.advanceTimersByTime(5_000); button.click();
      const otherPage = content.frames;
      expect(otherPage[0].dataset.referenceDragged).toBeUndefined();
      vi.advanceTimersByTime(5_000); button.click();
      const [restoredAll, restoredVariable] = content.frames;
      expect(restoredAll.image.style.transform).toBe("translate(20px, 10px) scale(1)");
      expect(restoredVariable.image.style.transform).toBe("translate(-10px, -5px) scale(1)");
      expect(restoredAll.dataset.referenceDragged).toBe("true");
      expect(restoredVariable.dataset.referenceDragged).toBe("true");
      expect(restoredAll.hand.classList.contains("is-hidden")).toBe(true);
      expect(restoredAll.label.classList.contains("is-hidden")).toBe(true);
      drag(restoredAll, 5, 0);
      expect(restoredAll.image.style.transform).toBe("translate(25px, 10px) scale(1)");
      expect(restoredVariable.image.style.transform).toBe("translate(-10px, -5px) scale(1)");
      mounted.destroy();
      for (const frame of [all, variable, ...otherPage, restoredAll, restoredVariable]) {
        expect(frame.listeners.size).toBe(0);
      }
      expect(button.listeners.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      const fresh = mountTutorialReferenceBoard(input);
      try {
        const freshAll = root.children[0].children[0].frames[0];
        expect(freshAll.image.style.transform).toBe("");
        expect(freshAll.dataset.referenceDragged).toBeUndefined();
        expect(freshAll.hand.classList.contains("is-hidden")).toBe(false);
        expect(freshAll.label.classList.contains("is-hidden")).toBe(false);
      } finally { fresh.destroy(); }
    } finally { mounted.destroy(); vi.useRealTimers(); }
  });

  it("shares frame state across runner board-only trials and cleans up at completion", () => {
    vi.useFakeTimers();
    const documentRef = new BoardElement("root");
    const nav = new BoardElement("div");
    nav.className = "jspsych-instructions-nav";
    const button = new BoardElement("button");
    button.id = "jspsych-instructions-next";
    nav.append(button);
    documentRef.append(nav);
    vi.stubGlobal("document", documentRef);
    vi.stubGlobal("window", globalThis);
    const config = parseExperimentConfig(experimentConfig);
    const referenceBoard = board();
    referenceBoard.items = [referenceBoard.items[0], referenceBoard.items[1], referenceBoard.items[0]];
    config.tutorial = { enabled: true, referenceBoard };
    const trials = buildExperimentTimeline(config).filter((trial) => trial.data?.tutorial_reference_board);
    const load = (index: number) => {
      documentRef.innerHTML = trials[index].pages[0];
      trials[index].on_load();
      expect(vi.getTimerCount()).toBe(1);
      return documentRef.frames;
    };
    try {
      const [all, variable] = load(0);
      drag(all, 20, 10);
      drag(variable, -10, -5);
      const remounted = load(0);
      expect(remounted[0].image.style.transform).toBe("translate(20px, 10px) scale(1)");
      expect(remounted[1].image.style.transform).toBe("translate(-10px, -5px) scale(1)");
      trials[0].on_finish?.();
      const otherPage = load(1);
      expect(otherPage[0].dataset.referenceDragged).toBeUndefined();
      trials[1].on_finish?.();
      const [restoredAll, restoredVariable] = load(2);
      expect(restoredAll.image.style.transform).toBe("translate(20px, 10px) scale(1)");
      expect(restoredVariable.image.style.transform).toBe("translate(-10px, -5px) scale(1)");
      expect(restoredAll.dataset.referenceDragged).toBe("true");
      expect(restoredAll.hand.classList.contains("is-hidden")).toBe(true);
      expect(restoredAll.label.classList.contains("is-hidden")).toBe(true);
      trials[2].on_finish?.();
      for (const frame of [all, variable, ...remounted, ...otherPage, restoredAll, restoredVariable]) {
        expect(frame.listeners.size).toBe(0);
      }
      expect(vi.getTimerCount()).toBe(0);
      const [freshAll] = load(0);
      expect(freshAll.image.style.transform).toBe("");
      expect(freshAll.dataset.referenceDragged).toBeUndefined();
      trials[0].on_finish?.();
    } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
  });

  it("hides icon and label for a 5px central drag through pointerup until later central hover", () => {
    const frame = new DragFrame("m01:all");
    const stop = installTutorialReferenceBoardInteractions({ querySelectorAll: () => [frame] } as unknown as ParentNode);
    try {
      frame.dispatch("pointerdown", { button: 0, pointerId: 1, clientX: 50, clientY: 40 });
      frame.dispatch("pointermove", { pointerId: 1, clientX: 55, clientY: 40 });
      expect(frame.image.style.transform).toBe("translate(5px, 0px) scale(1)");
      expect(frame.hand.classList.contains("is-hidden")).toBe(true);
      expect(frame.label.classList.contains("is-hidden")).toBe(true);
      frame.dispatch("pointermove", { pointerId: 1, clientX: 56, clientY: 40 });
      frame.dispatch("pointerup", { pointerId: 1, clientX: 56, clientY: 40 });
      expect(frame.hand.classList.contains("is-hidden")).toBe(true);
      expect(frame.label.classList.contains("is-hidden")).toBe(true);
      frame.dispatch("pointermove", { pointerId: 1, clientX: 10, clientY: 10 });
      expect(frame.hand.classList.contains("is-hidden")).toBe(true);
      expect(frame.label.classList.contains("is-hidden")).toBe(true);
      frame.dispatch("pointermove", { pointerId: 1, clientX: 50, clientY: 40 });
      expect(frame.hand.classList.contains("is-hidden")).toBe(false);
      expect(frame.label.classList.contains("is-hidden")).toBe(false);
    } finally { stop(); }
  });

  it("keeps the full prompt visible for a stationary central press", () => {
    const frame = new DragFrame("m01:all");
    const stop = installTutorialReferenceBoardInteractions({ querySelectorAll: () => [frame] } as unknown as ParentNode);
    try {
      frame.dispatch("pointerdown", { button: 0, pointerId: 1, clientX: 50, clientY: 40 });
      frame.dispatch("pointermove", { pointerId: 1, clientX: 50, clientY: 40 });
      frame.dispatch("pointerup", { pointerId: 1, clientX: 50, clientY: 40 });
      expect(frame.image.style.transform).toBe("");
      expect(frame.dataset.referenceDragged).toBeUndefined();
      expect(frame.hand.classList.contains("is-hidden")).toBe(false);
      expect(frame.label.classList.contains("is-hidden")).toBe(false);
    } finally { stop(); }
  });

  it("hides the text label along with the icon after movement", () => {
    const frame = new DragFrame("m01:all");
    const stop = installTutorialReferenceBoardInteractions({ querySelectorAll: () => [frame] } as unknown as ParentNode);
    try {
      drag(frame, 25, 20);
      expect(frame.hand.classList.contains("is-hidden")).toBe(true);
      expect(frame.label.classList.contains("is-hidden")).toBe(true);
    } finally { stop(); }
  });

  it("can render one furniture group per page with progress", () => {
    const pages = buildTutorialReferenceBoardPages({
      baseUrl: "/layout-task-generated/",
      board: board(),
    });

    expect(pages).toHaveLength(4);
    expect(pages[0].match(/<article class="layout-task-tutorial-board-card">/g)).toHaveLength(1);
    expect(pages[0]).toContain(">1 / 4<");
    expect(pages[0]).toContain(">Armchairs and Coffee Table<");
    expect(pages[0]).not.toContain(">Dining Table and Chairs<");
    expect(pages[3]).toContain(">4 / 4<");
    expect(pages[3]).toContain(">Sofa and Coffee Table<");
  });

  it("localizes the reference board and yellow-object requirement", () => {
    const html = buildTutorialReferenceBoardPage({
      baseUrl: "/tutorial/",
      locale: "zh-CN",
      board: board(),
    });

    expect(html).toContain("参考板");
    expect(html).toContain("观察每组家具的摆放");
    expect(html).toContain("拖动不是必做项");
    expect(html).toContain("按住时可用滚轮缩放");
    expect(html).not.toContain("必须点击每一个黄色物体一次");
    expect(html).not.toContain("Study these default furniture arrangements carefully");
  });

  it("resolves the shipped reference assets from the formal package to the experiment asset directory", () => {
    const expectedBase = new URL(experimentConfig.baseUrl, "http://127.0.0.1:5174/experiment/").toString();
    const html = buildTutorialReferenceBoardPage({
      baseUrl: expectedBase,
      board: experimentConfig.tutorial.referenceBoard as ExperimentTutorialReferenceBoardConfig,
    });
    const sources = Array.from(html.matchAll(/(?:src="|background-image: url\(&quot;)([^"&]+)/g), (match) => match[1]);

    expect(sources).toHaveLength(24);
    const handSources = sources.filter((source) => source.endsWith("/experiment/layout-task/assets/icons/hand.svg"));
    const boardSources = sources.filter((source) => !source.endsWith("/experiment/layout-task/assets/icons/hand.svg"));
    expect(handSources).toHaveLength(8);
    expect(boardSources).toHaveLength(16);
    expect(boardSources.every((source) => source.startsWith(`${expectedBase}assets/`))).toBe(true);
  });

  it("keeps shipped reference-board asset config rooted in the shared assets folder", () => {
    const board = experimentConfig.tutorial.referenceBoard as ExperimentTutorialReferenceBoardConfig;
    const configuredAssets = board.items.flatMap((item) => [
      item.allSvg,
      item.variableSvg,
      item.allAnimation,
      item.variableAnimation,
    ]);

    expect(configuredAssets).toHaveLength(16);
    for (const asset of configuredAssets) {
      expect(asset).toMatch(/^assets\/tutorial-reference\//);
      expect(existsSync(join(process.cwd(), asset))).toBe(true);
    }
  });
});

class BoardElement {
  children: BoardElement[] = [];
  ownerDocument: { createElement(tag: string): BoardElement } = { createElement: (tag) => new BoardElement(tag) };
  style = { display: "", visibility: "" };
  dataset: Record<string, string> = {};
  disabled = false;
  className = "";
  id = "";
  type = "";
  private html = "";
  frames: DragFrame[] = [];
  get innerHTML() { return this.html; }
  set innerHTML(value: string) {
    this.html = value;
    this.frames = Array.from(value.matchAll(/data-reference-frame-key="([^"]+)"/g), (match) => new DragFrame(match[1]));
  }
  textContent = "";
  parent?: BoardElement;
  listeners = new Map<string, () => void>();
  constructor(readonly tag: string) {}
  append(...children: BoardElement[]) { children.forEach((child) => { child.parent = this; this.children.push(child); }); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
  setAttribute() {}
  focus() {}
  addEventListener(type: string, listener: () => void) { this.listeners.set(type, listener); }
  removeEventListener(type: string, listener: () => void) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  querySelectorAll() { return this.frames; }
  click() { this.listeners.get("click")?.(); }
  querySelector(selector: string): BoardElement | null {
    for (const child of this.children) {
      if (selector.endsWith(".jspsych-instructions-nav") && child.className === "jspsych-instructions-nav") return child;
      if (selector.endsWith("#jspsych-instructions-next") && child.id === "jspsych-instructions-next") return child;
      const nested = child.querySelector(selector); if (nested) return nested;
    }
    return null;
  }
}

class DragFrame {
  readonly dataset: Record<string, string> = {};
  readonly image = { style: { transform: "" } };
  readonly classList = new FakeClassList();
  readonly hand = { classList: new FakeClassList() };
  readonly label = { classList: new FakeClassList() };
  readonly listeners = new Map<string, (event: Record<string, number>) => void>();
  readonly clientWidth = 100;
  readonly clientHeight = 80;

  constructor(key?: string) { if (key) this.dataset.referenceFrameKey = key; }
  querySelector(selector: string) {
    if (selector === ".layout-task-tutorial-board-image") return this.image;
    if (selector === ".layout-task-tutorial-board-hand") return this.hand;
    if (selector === ".layout-task-tutorial-board-hand-label") return this.label;
    return null;
  }
  addEventListener(type: string, listener: (event: Record<string, number>) => void) { this.listeners.set(type, listener); }
  removeEventListener(type: string, listener: (event: Record<string, number>) => void) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  dispatch(type: string, event: Record<string, number>) {
    this.listeners.get(type)?.({ buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1, ...event });
  }
}

function drag(frame: DragFrame, x: number, y: number) {
  frame.dispatch("pointerdown", { button: 0, pointerId: 1, clientX: 50, clientY: 40 });
  frame.dispatch("pointermove", { pointerId: 1, clientX: 50 + x, clientY: 40 + y });
  frame.dispatch("pointerup", { pointerId: 1, clientX: 50 + x, clientY: 40 + y });
}

class FakeClassList {
  private readonly values = new Set<string>();
  add(value: string) { this.values.add(value); }
  remove(value: string) { this.values.delete(value); }
  toggle(value: string, force?: boolean) {
    const next = force === undefined ? !this.values.has(value) : force;
    if (next) this.values.add(value); else this.values.delete(value);
    return next;
  }
  contains(value: string) { return this.values.has(value); }
}
