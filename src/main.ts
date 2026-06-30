import "./styles/layout-task.css";
import { ConfigLoader } from "./core/config-loader";
import { createLayoutTaskPlayer } from "./core/layout-task-player";
import { parseLayoutTaskUrlParams } from "./utils/url";

// main.ts is the standalone-page adapter.
// 真正的业务流已经收进 createLayoutTaskPlayer()，这里仅负责 URL + config 装配。
const DEFAULT_TASK_ID = "room01";
const DEFAULT_QID = "Q1";

async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) {
    throw new Error("Missing #app root element");
  }

  const params = parseLayoutTaskUrlParams(window.location.search);
  // base can be overridden for alternate static hosting roots.
  // 这样 GitHub Pages / 子路径部署时不需要改业务代码。
  const baseUrl = new URL(params.base ?? "layout-task/", window.location.href).toString();
  const loader = new ConfigLoader({ baseUrl });
  const config = await loader.loadRuntimeConfig({
    // Default standalone mode must stay button/arrow based.
    // 拖拽 demo 只通过显式 URL 进入，避免研究者或被试误进 drag 版本。
    taskId: params.task ?? DEFAULT_TASK_ID,
    qid: params.q ?? DEFAULT_QID,
  });

  const player = createLayoutTaskPlayer({
    root,
    config,
  });
  player.start();
}

void bootstrap().catch((error: unknown) => {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (root) {
    root.innerHTML = `
      <section class="layout-task-shell">
        <header class="layout-task-header">
          <p class="layout-task-eyebrow">Layout Task</p>
          <h1>Startup error</h1>
          <p class="layout-task-meta">${error instanceof Error ? error.message : "Unknown error"}</p>
        </header>
      </section>
    `;
  }
});
