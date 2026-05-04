import "./styles/layout-task.css";
import { ConfigLoader } from "./core/config-loader";
import { createLayoutTaskPlayer } from "./core/layout-task-player";
import { parseLayoutTaskUrlParams } from "./utils/url";

// main.ts is now a thin standalone adapter.
// 真正的业务流程已经收进 createLayoutTaskPlayer()，这里只负责装配 URL + config。
async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) {
    throw new Error("Missing #app root element");
  }

  const params = parseLayoutTaskUrlParams(window.location.search);
  const baseUrl = new URL(params.base ?? "/layout-task/", window.location.origin).toString();
  const loader = new ConfigLoader({ baseUrl });
  const config = await loader.loadRuntimeConfig({
    taskId: params.task,
    qid: params.q,
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
