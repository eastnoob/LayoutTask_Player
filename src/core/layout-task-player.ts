import type { RuntimeTaskConfig } from "../types/runtime";
import type { FinalState } from "../types/result";
import { ClipboardService } from "./clipboard-service";
import { CompletionController, type CompletionPayload } from "./completion-controller";
import { DisplayInfoCollector } from "./display-info";
import { LayoutTaskEncoder } from "./encoder";
import { InteractionController } from "./interaction-controller";
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
// standalone main.ts 和 jsPsych plugin 都应该只是外层 adapter，不要把产品逻辑散回去。
export function createLayoutTaskPlayer(options: LayoutTaskPlayerOptions): LayoutTaskPlayer {
  const sessionId = createSessionId();
  const store = new StateStore(options.config);
  const clipboard = new ClipboardService();
  const encoder = new LayoutTaskEncoder();

  let recorder: Recorder | undefined;
  let interaction: InteractionController | undefined;
  let completion: CompletionController | undefined;

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
      // 先 mount 再测 display，再绑定行为，这样数据和界面生命周期是一致的。
      const refs = renderer.mount();
      const displayCollector = new DisplayInfoCollector(refs, options.config);
      recorder = new Recorder({
        config: options.config,
        sessionId,
        getDisplayInfo: () => displayCollector.collect(),
        getFinalState: () => store.getFinalState(),
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
        onComplete: options.onComplete,
      });

      recorder.start();
      interaction.bind();
    },

    destroy() {
      // Teardown stays intentionally boring and explicit.
      // 这里只清理 binding 和 DOM，不偷偷改外部状态。
      interaction?.unbind();
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
