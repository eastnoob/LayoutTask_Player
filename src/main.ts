import "./styles/layout-task.css";
import { ConfigLoader } from "./core/config-loader";
import { LayoutTaskRenderer } from "./core/renderer";
import { StateStore } from "./core/state-store";
import { parseLayoutTaskUrlParams } from "./utils/url";

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

  const store = new StateStore(config);
  const renderer = new LayoutTaskRenderer({ root, config });
  renderer.mount();
  renderer.renderShell(store.getFinalState());
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
