import type { ExperimentTutorialReferenceBoardConfig } from "../types/experiment";

export function buildTutorialReferenceBoardPage(input: {
  baseUrl: string;
  board: ExperimentTutorialReferenceBoardConfig;
}): string {
  return buildTutorialReferenceBoardHtml({ baseUrl: input.baseUrl, board: input.board });
}

export function buildTutorialReferenceBoardPages(input: {
  baseUrl: string;
  board: ExperimentTutorialReferenceBoardConfig;
}): string[] {
  const total = input.board.items.length;
  return input.board.items.map((item, index) =>
    buildTutorialReferenceBoardHtml({
      baseUrl: input.baseUrl,
      board: { ...input.board, items: [item] },
      progress: `${index + 1} / ${total}`,
    }),
  );
}

function buildTutorialReferenceBoardHtml(input: {
  baseUrl: string;
  board: ExperimentTutorialReferenceBoardConfig;
  progress?: string;
}): string {
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
                <figcaption>All Furniture</figcaption>
                <img class="layout-task-tutorial-board-svg" src="${escapeHtmlAttribute(assetUrl(item.allSvg))}" alt="All furniture top-down arrangement" />
              </figure>
              <figure class="layout-task-tutorial-board-media-frame">
                <figcaption>Movable Item</figcaption>
                <img class="layout-task-tutorial-board-svg" src="${escapeHtmlAttribute(assetUrl(item.variableSvg))}" alt="Movable furniture item top-down arrangement" />
              </figure>
            </div>
            <div class="layout-task-tutorial-board-gif-grid">
              <figure class="layout-task-tutorial-board-media-frame">
                <figcaption>All Furniture</figcaption>
                <img class="layout-task-tutorial-board-gif" src="${escapeHtmlAttribute(assetUrl(item.allAnimation))}" alt="All furniture rotating in 3D" />
              </figure>
              <figure class="layout-task-tutorial-board-media-frame">
                <figcaption>Movable Item</figcaption>
                <img class="layout-task-tutorial-board-gif" src="${escapeHtmlAttribute(assetUrl(item.variableAnimation))}" alt="Movable furniture item rotating in 3D" />
              </figure>
            </div>
          </div>
        </article>`,
    )
    .join("");

  return `
    <section class="layout-task-shell layout-task-tutorial-board-shell">
      <div class="layout-task-tutorial-board-title">
        <span>▶</span><span>Reference board</span>${input.progress ? `<span class="layout-task-tutorial-board-progress">${escapeHtmlText(input.progress)}</span>` : ""}
      </div>
      <p class="layout-task-tutorial-board-callout">Study these default furniture arrangements carefully. In the formal experiment, movable furniture will be marked in yellow.</p>
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
