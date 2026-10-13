import { describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import experimentConfig from "../../public/experiment/experiment.json";
import { buildTutorialReferenceBoardPage, buildTutorialReferenceBoardPages, mountTutorialReferenceBoard } from "./tutorial-reference-board";
import type { ExperimentTutorialReferenceBoardConfig } from "../types/experiment";

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
    expect(html).toContain("dragging is optional");
    expect(html).toContain("movable furniture is marked in yellow");
    expect(html).not.toContain("relation.svg");
    expect(html).not.toContain("<h1");
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

    expect(sources).toHaveLength(16);
    expect(sources.every((source) => source.startsWith(`${expectedBase}assets/`))).toBe(true);
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
  innerHTML = "";
  textContent = "";
  parent?: BoardElement;
  listeners = new Map<string, () => void>();
  constructor(readonly tag: string) {}
  append(...children: BoardElement[]) { children.forEach((child) => { child.parent = this; this.children.push(child); }); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
  setAttribute() {}
  focus() {}
  addEventListener(type: string, listener: () => void) { this.listeners.set(type, listener); }
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
