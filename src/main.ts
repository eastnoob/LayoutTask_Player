import "./styles/layout-task.css";
import { ClipboardService } from "./core/clipboard-service";
import { ConfigLoader } from "./core/config-loader";
import { DisplayInfoCollector } from "./core/display-info";
import { LayoutTaskEncoder } from "./core/encoder";
import { Recorder } from "./core/recorder";
import { LayoutTaskRenderer } from "./core/renderer";
import { StateStore } from "./core/state-store";
import { parseLayoutTaskUrlParams } from "./utils/url";
import { createSessionId } from "./utils/time";

// main.ts is the standalone-player entry.
// 它把 loader / store / renderer / recorder / encoder 串成一个完整页面流程。
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
  const encoder = new LayoutTaskEncoder();
  let lockedResultText = "";
  let activeObjectId: string | undefined;

  const renderer = new LayoutTaskRenderer({
    root,
    config,
    store,
    onAction: (objectId, action) => {
      if (store.isLocked()) {
        renderer.setStatus("Task is locked. Use the copy button to copy the saved result.");
        return;
      }

      const canApply = store.canApplyAction(objectId, action);
      if (!canApply.ok) {
        renderer.updateControlsDisabled(objectId);
        renderer.setStatus(`${objectId}: ${action} is unavailable (${canApply.reason}).`);
        return;
      }

      const transition = store.applyAction(objectId, action);
      // Record offsets as well because later exports may choose relative final state
      // or a full trajectory. 这些 offset 是后期统计最顺手的量。
      recorder.recordEvent({
        i: eventIndex,
        t: Date.now() - startTime,
        object: objectId,
        action,
        valid: true,
        before: transition.before,
        after: transition.after,
        counts: transition.counts,
        offsets: transition.offsets,
      });
      eventIndex += 1;
      renderer.updateObject(objectId);
      renderer.updateControlsDisabled(objectId);
      renderer.setStatus(`${objectId}: ${action} applied.`);
    },
    onObjectSelect: (objectId) => {
      if (store.isLocked()) {
        return;
      }

      if (activeObjectId && activeObjectId !== objectId) {
        renderer.setStatus(`Editing ${activeObjectId}. Tap the stage background to exit before selecting another object.`);
        return;
      }

      activeObjectId = objectId;
      renderer.activateObject(objectId);
      renderer.updateControlsDisabled(objectId);
      renderer.setStatus(`Editing ${objectId}. Tap the stage background to exit edit mode.`);
    },
    onStageBackgroundClick: () => {
      if (!activeObjectId) {
        return;
      }

      renderer.clearActiveObject();
      renderer.setStatus(`Exited ${activeObjectId} edit mode.`);
      activeObjectId = undefined;
    },
    onConfirm: async () => {
      if (store.isLocked()) {
        return;
      }

      const ok1 = window.confirm("After confirmation, the object layout will be locked. Continue?");
      if (!ok1) {
        return;
      }

      const ok2 = window.confirm("Please confirm again: this will finalize the current layout.");
      if (!ok2) {
        return;
      }

      // After this point the trial becomes immutable.
      // 先 lock 再 encode/copy，确保“再次复制”拿到的是同一份 frozen result。
      store.lock();
      activeObjectId = undefined;
      renderer.setLocked(true);

      const result = await recorder.finish(Date.now());
      const encoded = await encoder.encode(result, config.output);
      lockedResultText = encoded.output;
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
