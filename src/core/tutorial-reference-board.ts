import type { ExperimentTutorialReferenceBoardConfig } from "../types/experiment";

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
                <img class="layout-task-tutorial-board-svg" src="${escapeHtmlAttribute(assetUrl(item.allSvg))}" alt="${chinese ? "全部家具的俯视摆放" : "All furniture top-down arrangement"}" />
              </figure>
              <figure class="layout-task-tutorial-board-media-frame">
                <figcaption>${chinese ? "可移动家具" : "Movable Item"}</figcaption>
                <img class="layout-task-tutorial-board-svg" src="${escapeHtmlAttribute(assetUrl(item.variableSvg))}" alt="${chinese ? "可移动家具的俯视摆放" : "Movable furniture item top-down arrangement"}" />
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
      <p class="layout-task-tutorial-board-callout">${chinese ? "请仔细观察这些家具的默认摆放。正式实验中，可移动家具会标记为黄色。完成教程时，必须点击每一个黄色物体一次。" : "Study these default furniture arrangements carefully. In the formal experiment, movable furniture will be marked in yellow."}</p>
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
