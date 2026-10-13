import type { ExperimentTutorialReferenceBoardConfig } from "../types/experiment";

export interface TutorialReferenceBoard {
  pages: string[];
  continueLabel: string;
}

// Reused by the board-only jsPsych trials and the board inside a live player.
export function startReferenceBoardContinueCountdown(input: {
  documentRef?: Document | HTMLElement;
  windowRef?: Pick<Window, "setInterval" | "clearInterval">;
  label: string;
  seconds?: number;
}): () => void {
  const documentRef = input.documentRef ?? document;
  const windowRef = input.windowRef ?? window;
  const nav = documentRef.querySelector<HTMLElement>(".layout-task-reference-board-trial .jspsych-instructions-nav");
  const nextButton = documentRef.querySelector<HTMLButtonElement>(".layout-task-reference-board-trial #jspsych-instructions-next");
  if (!nav || !nextButton) return () => undefined;
  nav.style.visibility = "visible";
  let remaining = input.seconds ?? 5;
  const update = () => {
    nextButton.disabled = remaining > 0;
    nextButton.textContent = remaining > 0 ? `${input.label} (${remaining})` : input.label;
  };
  update();
  if (remaining <= 0) return () => undefined;
  const timer = windowRef.setInterval(() => {
    remaining -= 1;
    update();
    if (remaining <= 0) windowRef.clearInterval(timer);
  }, 1_000);
  return () => windowRef.clearInterval(timer);
}

export function mountTutorialReferenceBoard(input: TutorialReferenceBoard & {
  root: HTMLElement;
  onComplete(): void;
}): { destroy(): void } {
  const documentRef = input.root.ownerDocument;
  const playerChildren = Array.from(input.root.children, (child) => ({
    element: child as HTMLElement, display: (child as HTMLElement).style.display,
  }));
  playerChildren.forEach(({ element }) => { element.style.display = "none"; });
  const host = documentRef.createElement("section");
  host.className = "layout-task-reference-board-trial layout-task-reference-board-mounted";
  const content = documentRef.createElement("div");
  const nav = documentRef.createElement("div");
  nav.className = "jspsych-instructions-nav";
  const nextButton = documentRef.createElement("button");
  nextButton.type = "button";
  nextButton.id = "jspsych-instructions-next";
  nextButton.className = "jspsych-btn";
  nav.append(nextButton);
  host.append(content, nav);
  input.root.append(host);
  let index = 0;
  let destroyed = false;
  let readyAt = 0;
  let stopCountdown: (() => void) | undefined;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stopCountdown?.();
    host.remove();
    playerChildren.forEach(({ element, display }) => { element.style.display = display; });
  };
  const showPage = () => {
    stopCountdown?.();
    content.innerHTML = input.pages[index];
    readyAt = Date.now() + 5_000;
    stopCountdown = startReferenceBoardContinueCountdown({
      documentRef: input.root, windowRef: globalThis as unknown as Window, label: input.continueLabel,
    });
    nextButton.focus();
  };
  nextButton.addEventListener("click", () => {
    if (destroyed || Date.now() < readyAt) return;
    index += 1;
    if (index < input.pages.length) showPage();
    else { destroy(); input.onComplete(); }
  });
  showPage();
  return { destroy };
}

export function buildTutorialReferenceBoardPage(input: {
  baseUrl: string;
  board: ExperimentTutorialReferenceBoardConfig;
  locale?: "en-US" | "zh-CN";
}): string {
  return buildTutorialReferenceBoardHtml({ baseUrl: input.baseUrl, board: input.board, locale: input.locale });
}

export function buildTutorialReferenceBoardPages(input: {
  baseUrl: string;
  board: ExperimentTutorialReferenceBoardConfig;
  locale?: "en-US" | "zh-CN";
}): string[] {
  const total = input.board.items.length;
  return input.board.items.map((item, index) =>
    buildTutorialReferenceBoardHtml({
      baseUrl: input.baseUrl,
      board: { ...input.board, items: [item] },
      progress: `${index + 1} / ${total}`,
      locale: input.locale,
    }),
  );
}

function buildTutorialReferenceBoardHtml(input: {
  baseUrl: string;
  board: ExperimentTutorialReferenceBoardConfig;
  progress?: string;
  locale?: "en-US" | "zh-CN";
}): string {
  const chinese = input.locale === "zh-CN";
  const absoluteBaseUrl = new URL(input.baseUrl, "http://example.test/");
  const assetUrl = (path: string) => {
    const url = new URL(path, absoluteBaseUrl);
    return isAbsoluteUrl(input.baseUrl) ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  };
  const svgImage = (path: string, label: string) =>
    `<div class="layout-task-tutorial-board-svg" role="img" aria-label="${escapeHtmlAttribute(label)}" style="background-image: ${escapeHtmlAttribute(`url(${JSON.stringify(assetUrl(path))})`)}"></div>`;
  const columns = input.board.items
    .map(
      (item) => `
        <article class="layout-task-tutorial-board-card">
          <div class="layout-task-tutorial-board-card-header">
            <span class="layout-task-tutorial-board-card-dot"></span>
            <span class="layout-task-tutorial-board-card-title">${escapeHtmlText(item.name)}</span>
          </div>
          <div class="layout-task-tutorial-board-card-body">
            <div class="layout-task-tutorial-board-svg-grid">
              <figure class="layout-task-tutorial-board-media-frame">
                <figcaption>${chinese ? "全部家具" : "All Furniture"}</figcaption>
                ${svgImage(item.allSvg, chinese ? "全部家具的俯视摆放" : "All furniture top-down arrangement")}
              </figure>
              <figure class="layout-task-tutorial-board-media-frame">
                <figcaption>${chinese ? "可移动家具" : "Movable Item"}</figcaption>
                ${svgImage(item.variableSvg, chinese ? "可移动家具的俯视摆放" : "Movable furniture item top-down arrangement")}
              </figure>
            </div>
            <div class="layout-task-tutorial-board-gif-grid">
              <figure class="layout-task-tutorial-board-media-frame">
                <figcaption>${chinese ? "全部家具" : "All Furniture"}</figcaption>
                <img class="layout-task-tutorial-board-gif" src="${escapeHtmlAttribute(assetUrl(item.allAnimation))}" alt="${chinese ? "全部家具三维旋转展示" : "All furniture rotating in 3D"}" />
              </figure>
              <figure class="layout-task-tutorial-board-media-frame">
                <figcaption>${chinese ? "可移动家具" : "Movable Item"}</figcaption>
                <img class="layout-task-tutorial-board-gif" src="${escapeHtmlAttribute(assetUrl(item.variableAnimation))}" alt="${chinese ? "可移动家具三维旋转展示" : "Movable furniture item rotating in 3D"}" />
              </figure>
            </div>
          </div>
        </article>`,
    )
    .join("");

  return `
    <section class="layout-task-shell layout-task-tutorial-board-shell">
      <div class="layout-task-tutorial-board-title">
        <span>▶</span><span>${chinese ? "参考板" : "Reference board"}</span>${input.progress ? `<span class="layout-task-tutorial-board-progress">${escapeHtmlText(input.progress)}</span>` : ""}
      </div>
      <p class="layout-task-tutorial-board-callout">${chinese ? "观察每组家具的摆放。按住并拖动平面图可查看细节；拖动不是必做项。正式实验中，可移动家具会标记为黄色。" : "Inspect each furniture arrangement. Hold and drag either floor-plan image to inspect it; dragging is optional. In the formal experiment, movable furniture is marked in yellow."}</p>
      <div class="layout-task-tutorial-board-grid${input.board.items.length === 1 ? " is-single" : ""}">${columns}</div>
    </section>
  `;
}

function isAbsoluteUrl(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(value);
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function escapeHtmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
