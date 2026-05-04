import "./styles/layout-task.css";
import { ClipboardService } from "./core/clipboard-service";
import { ConfigLoader } from "./core/config-loader";
import { DisplayInfoCollector } from "./core/display-info";
import { Recorder } from "./core/recorder";
import { LayoutTaskRenderer } from "./core/renderer";
import { StateStore } from "./core/state-store";
import { parseLayoutTaskUrlParams } from "./utils/url";
import { createSessionId } from "./utils/time";

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
  const clipboard = new ClipboardService();
  let lockedResultText = "";

  const renderer = new LayoutTaskRenderer({
    root,
    config,
    store,
    onObjectClick: (objectId) => {
      if (store.isLocked()) {
        renderer.setStatus("Task is locked. Use the copy button to copy the saved result.");
        return;
      }

      const objectConfig = config.objects.find((item) => item.id === objectId);
      const step = objectConfig?.behavior.rotation?.step ?? 45;
      const transition = store.rotateClockwise(objectId, step);
      recorder.recordEvent({
        i: eventIndex,
        t: Date.now() - startTime,
        object: objectId,
        action: "rotate_cw",
        valid: true,
        before: transition.before,
        after: transition.after,
        counts: transition.counts,
      });
      eventIndex += 1;
      renderer.updateObject(objectId);
      renderer.setStatus(`${objectId} rotated to ${transition.after.r} degrees.`);
    },
    onConfirm: async () => {
      if (store.isLocked()) {
        return;
      }

      store.lock();
      renderer.setLocked(true);

      const result = await recorder.finish(Date.now());
      lockedResultText = JSON.stringify(result);
      const copyResult = await clipboard.copy(lockedResultText);
      renderer.showCompletion(lockedResultText, copyResult);
    },
    onCopyAgain: async () => {
      if (!lockedResultText) {
        renderer.setStatus("No locked result is available yet.");
        return;
      }

      const copyResult = await clipboard.copy(lockedResultText);
      renderer.setStatus(copyResult.ok ? "JSON copied again." : "Copy failed. Please copy manually.");
    },
  });

  const refs = renderer.mount();
  const displayCollector = new DisplayInfoCollector(refs, config);
  const startTime = Date.now();
  let eventIndex = 0;
  const recorder = new Recorder({
    config,
    sessionId: createSessionId(),
    getDisplayInfo: () => displayCollector.collect(),
    getFinalState: () => store.getFinalState(),
  });
  recorder.start();
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
