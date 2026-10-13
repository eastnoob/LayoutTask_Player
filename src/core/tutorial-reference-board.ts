import type { ExperimentTutorialReferenceBoardConfig } from "../types/experiment";

export interface TutorialReferenceBoard {
  pages: string[];
  continueLabel: string;
}

const HAND_ASSET_PATH = "../../experiment/layout-task/assets/icons/hand.svg";

export type TutorialReferenceBoardState = Map<string, { x: number; y: number; dragged: boolean }>;

export function installTutorialReferenceBoardInteractions(
  root: ParentNode, frames: TutorialReferenceBoardState = new Map(),
): () => void {
  if (typeof root.querySelectorAll !== "function") return () => undefined;
  const cleanups = Array.from(root.querySelectorAll<HTMLElement>(".layout-task-tutorial-board-svg"), (frame) => {
    const hand = frame.querySelector<HTMLElement>(".layout-task-tutorial-board-hand");
    const label = frame.querySelector<HTMLElement>(".layout-task-tutorial-board-hand-label");
    const key = frame.dataset.referenceFrameKey;
    const state = (key && frames.get(key)) || { x: 0, y: 0, dragged: false };
    if (key) frames.set(key, state);
    const drag = { startX: 0, startY: 0, baseX: 0, baseY: 0, active: false };
    const hidePrompt = (hidden: boolean) => {
      hand?.classList.toggle("is-hidden", hidden);
      label?.classList.toggle("is-hidden", hidden);
    };
    const updatePosition = () => {
      frame.dataset.referenceDragged = "true";
      frame.style.backgroundPosition = `calc(50% + ${state.x}px) calc(50% + ${state.y}px)`;
    };
    if (state.dragged) { updatePosition(); hidePrompt(true); }
    const maxPan = () => ({
      x: Math.max(0, Math.round(frame.clientWidth * 0.25)),
      y: Math.max(0, Math.round(frame.clientHeight * 0.25)),
    });
    const updatePrompt = (event: PointerEvent) => {
      if (!state.dragged) return;
      const rect = frame.getBoundingClientRect?.();
      const width = rect?.width || frame.clientWidth || 1;
      const height = rect?.height || frame.clientHeight || 1;
      const left = rect?.left ?? 0;
      const top = rect?.top ?? 0;
      const central = Math.abs((event.clientX - left) / width - 0.5) < 0.2
        && Math.abs((event.clientY - top) / height - 0.5) < 0.2;
      hidePrompt(!central);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      drag.active = true;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.baseX = state.x;
      drag.baseY = state.y;
      frame.classList.add("is-dragging");
      frame.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag.active) { updatePrompt(event); return; }
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (deltaX === 0 && deltaY === 0) return;
      const limit = maxPan();
      state.x = clamp(drag.baseX + deltaX, -limit.x, limit.x);
      state.y = clamp(drag.baseY + deltaY, -limit.y, limit.y);
      state.dragged = true;
      updatePosition();
      hidePrompt(true);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!drag.active) return;
      drag.active = false;
      frame.classList.remove("is-dragging");
      frame.releasePointerCapture?.(event.pointerId);
    };
    const onPointerLeave = () => {
      if (state.dragged) hidePrompt(true);
    };
    frame.addEventListener("pointerdown", onPointerDown);
    frame.addEventListener("pointermove", onPointerMove);
    frame.addEventListener("pointerup", onPointerUp);
    frame.addEventListener("pointercancel", onPointerUp);
    frame.addEventListener("pointerleave", onPointerLeave);
    return () => {
      frame.removeEventListener("pointerdown", onPointerDown);
      frame.removeEventListener("pointermove", onPointerMove);
      frame.removeEventListener("pointerup", onPointerUp);
      frame.removeEventListener("pointercancel", onPointerUp);
      frame.removeEventListener("pointerleave", onPointerLeave);
    };
  });
  return () => cleanups.forEach((cleanup) => cleanup());
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
  let stopInteractions: (() => void) | undefined;
  const frames: TutorialReferenceBoardState = new Map();
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stopCountdown?.();
    stopInteractions?.();
    frames.clear();
    nextButton.removeEventListener("click", onNext);
    host.remove();
    playerChildren.forEach(({ element, display }) => { element.style.display = display; });
  };
  const showPage = () => {
    stopCountdown?.();
    stopInteractions?.();
    content.innerHTML = input.pages[index];
    stopInteractions = installTutorialReferenceBoardInteractions(content, frames);
    readyAt = Date.now() + 5_000;
    stopCountdown = startReferenceBoardContinueCountdown({
      documentRef: input.root, windowRef: globalThis as unknown as Window, label: input.continueLabel,
    });
    nextButton.focus();
  };
  const onNext = () => {
    if (destroyed || Date.now() < readyAt) return;
    index += 1;
    if (index < input.pages.length) showPage();
    else { destroy(); input.onComplete(); }
  };
  nextButton.addEventListener("click", onNext);
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
  const svgImage = (path: string, label: string, frameKey: string) => `
    <div class="layout-task-tutorial-board-svg" data-reference-frame-key="${escapeHtmlAttribute(frameKey)}" role="img" aria-label="${escapeHtmlAttribute(label)}" style="background-image: ${escapeHtmlAttribute(`url(${JSON.stringify(assetUrl(path))})`)}">
      <img class="layout-task-tutorial-board-hand" src="${escapeHtmlAttribute(assetUrl(HAND_ASSET_PATH))}" alt="" aria-hidden="true" draggable="false" />
      <span class="layout-task-tutorial-board-hand-label">${chinese ? "按住拖动观察" : "Click and hold to drag"}</span>
    </div>`;
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
                ${svgImage(item.allSvg, chinese ? "全部家具的俯视摆放" : "All furniture top-down arrangement", `${item.id}:all`)}
              </figure>
              <figure class="layout-task-tutorial-board-media-frame">
                <figcaption>${chinese ? "可移动家具" : "Movable Item"}</figcaption>
                ${svgImage(item.variableSvg, chinese ? "可移动家具的俯视摆放" : "Movable furniture item top-down arrangement", `${item.id}:variable`)}
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function escapeHtmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
