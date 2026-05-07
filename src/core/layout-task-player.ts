import type { FinalState } from "../types/result";
import type { RuntimeTaskConfig } from "../types/runtime";
import { ClipboardService } from "./clipboard-service";
import { CompletionController, type CompletionPayload } from "./completion-controller";
import { DisplayChangeRecorder } from "./display-change-recorder";
import { DisplayInfoCollector } from "./display-info";
import { LayoutTaskEncoder } from "./encoder";
import { DataSaveService } from "./data-save-service";
import { InteractionController } from "./interaction-controller";
import { PageTimingCollector } from "./page-timing";
import { Recorder } from "./recorder";
import { LayoutTaskRenderer } from "./renderer";
import { StateStore } from "./state-store";
import { createSessionId } from "../utils/time";

export interface LayoutTaskPlayerOptions {
  root: HTMLElement;
  config: RuntimeTaskConfig;
  onComplete?: (payload: CompletionPayload) => void;
}

export interface LayoutTaskPlayer {
  start(): void;
  destroy(): void;
  getState(): FinalState;
  isLocked(): boolean;
}

// createLayoutTaskPlayer is the product core.
// standalone `main.ts` 和 jsPsych plugin 都应该只是外层 adapter，不要把产品逻辑散回去。
export function createLayoutTaskPlayer(options: LayoutTaskPlayerOptions): LayoutTaskPlayer {
  const sessionId = createSessionId();
  const store = new StateStore(options.config);
  const clipboard = new ClipboardService();
  const encoder = new LayoutTaskEncoder();
  const dataSave = new DataSaveService({ config: options.config.dataSave });
  const pageTiming = new PageTimingCollector();

  let recorder: Recorder | undefined;
  let interaction: InteractionController | undefined;
  let completion: CompletionController | undefined;
  let displayChangeRecorder: DisplayChangeRecorder | undefined;

  const renderer = new LayoutTaskRenderer({
    root: options.root,
    config: options.config,
    store,
    onAction: (objectId, action, event) => {
      interaction?.requestAction({
        objectId,
        action,
        pointer:
          "clientX" in event && "clientY" in event
            ? {
                clientX: event.clientX,
                clientY: event.clientY,
              }
            : undefined,
      });
    },
    onObjectSelect: (objectId) => interaction?.selectObject(objectId),
    onStageBackgroundClick: () => interaction?.deselectObject(),
    onDragStart: (objectId, pointer) => {
      interaction?.requestDragStart({ objectId, pointer });
    },
    onDragMove: (objectId, pointer) => {
      interaction?.requestDragMove({ objectId, pointer });
    },
    onDragEnd: (objectId, pointer) => {
      interaction?.requestDragEnd({ objectId, pointer });
    },
    onDragCancel: (objectId, pointer) => {
      interaction?.requestDragCancel({ objectId, pointer });
    },
    onConfirm: () => {
      void completion?.requestComplete();
    },
    onCopyAgain: () => {
      void completion?.copyAgain();
    },
  });

  return {
    start() {
      // Render first, then wire recorder / interaction around mounted DOM refs.
      // 先 mount 再测 display，再绑定行为；这样数据和界面生命周期是一致的。
      const refs = renderer.mount();
      // Browser-only observer: in Node unit tests there is no window, so skip it.
      // GitHub Pages / normal browser 里会正常开启；非浏览器环境只是不记录 display changes。
      displayChangeRecorder =
        options.config.recording.record_display_changes && typeof window !== "undefined"
          ? new DisplayChangeRecorder({ refs })
          : undefined;
      displayChangeRecorder?.start();

      const displayCollector = new DisplayInfoCollector(refs, options.config, displayChangeRecorder);
      recorder = new Recorder({
        config: options.config,
        sessionId,
        getDisplayInfo: () => displayCollector.collect(),
        getFinalState: () => store.getFinalState(),
        getPageTiming: (submitTime, playerStartTime) => pageTiming.collect(submitTime, playerStartTime),
      });
      interaction = new InteractionController({
        config: options.config,
        store,
        renderer,
        recorder,
      });
      completion = new CompletionController({
        config: options.config,
        store,
        recorder,
        renderer,
        encoder,
        clipboard,
        dataSave,
        onComplete: options.onComplete,
      });

      recorder.start();
      interaction.bind();
    },

    destroy() {
      // Teardown stays intentionally boring and explicit.
      // 这里只清理 binding 和 DOM，不偷偷改外部状态。
      interaction?.unbind();
      displayChangeRecorder?.stop();
      renderer.destroy();
    },

    getState() {
      return store.getFinalState();
    },

    isLocked() {
      return store.isLocked();
    },
  };
}
