import type { FinalState } from "../types/result";
import type { RuntimeTaskConfig } from "../types/runtime";
import type { ReferencePresentation } from "../types/schedule";
import { ClipboardService } from "./clipboard-service";
import { CompletionController, type CompletionPayload } from "./completion-controller";
import { DisplayChangeRecorder } from "./display-change-recorder";
import { DisplayInfoCollector } from "./display-info";
import { LayoutTaskEncoder } from "./encoder";
import { DataSaveService } from "./data-save-service";
import { ConfidenceController } from "./confidence-controller";
import { FlowController } from "./flow-controller";
import { InteractionController } from "./interaction-controller";
import { PageTimingCollector } from "./page-timing";
import { Recorder } from "./recorder";
import { ReferenceAssistanceRecorder } from "./reference-assistance-recorder";
import { LayoutTaskRenderer } from "./renderer";
import { StateStore } from "./state-store";
import { createSessionId } from "../utils/time";
import { TutorialController, type TutorialEvent, type TutorialEventPayload, type TutorialPracticeEvent, type TutorialStep } from "./tutorial-controller";
import { mountTutorialReferenceBoard, type TutorialReferenceBoard } from "./tutorial-reference-board";
import { UploadState } from "./upload-state";
import type { LocalBackupStore } from "./local-backup-store";
import { createPauseSummary } from "./experiment-pause";
import type { ExperimentPauseController } from "./experiment-pause";
import { resolveMessages } from "./messages";
import type { RewardConfig, RewardReferenceTask } from "../types/reward";
import { MagnifierController, type MagnifierSnapshot, type MagnifierTaskWindow } from "./magnifier-controller";

export interface LayoutTaskPlayerOptions {
  root: HTMLElement;
  config: RuntimeTaskConfig;
  confidence?: {
    required: boolean;
    scale: number[];
    labels: Record<string, string>;
  };
  tutorialMode?: boolean;
  tutorialReferenceBoard?: TutorialReferenceBoard;
  locale?: "en-US" | "zh-CN";
  developerMode?: boolean;
  presentation?: ReferencePresentation;
  onComplete?: (payload: CompletionPayload) => void;
  localBackup?: LocalBackupStore;
  pause?: Pick<ExperimentPauseController, "isPaused" | "getActiveElapsedMs" | "subscribe" | "snapshot">
    & Partial<Pick<ExperimentPauseController, "registerInputGuard">>;
  reward?: RewardConfig;
  rewardReference?: RewardReferenceTask;
}

export interface LayoutTaskPlayer {
  start(): void;
  destroy(): void;
  getState(): FinalState;
  isLocked(): boolean;
  getTutorialStep(): TutorialStep | undefined;
  handleTutorialPractice(event: TutorialPracticeEvent, payload?: TutorialEventPayload): boolean;
  canStartMagnifier(): boolean;
  canStartPause(): boolean;
  getMagnifierSnapshot(taskWindow?: MagnifierTaskWindow): MagnifierSnapshot;
}

// ===== Player lifecycle =====
// Upstream loaders/adapters supply an already-built RuntimeTaskConfig. From
// that point on, this factory owns the mounted player lifecycle so standalone
// bootstraps and protocol adapters can stay thin around one shared flow.
export function createLayoutTaskPlayer(options: LayoutTaskPlayerOptions): LayoutTaskPlayer {
  const localizedConfig = options.locale === "zh-CN"
    ? {
        ...options.config,
        messages: resolveMessages(options.config.messages, "zh-CN"),
        flow: options.config.flow.mode === "preview_then_reconstruct"
          ? {
              ...options.config.flow,
              config: {
                ...options.config.flow.config,
                intro_message: "接下来，请观察图片。",
                intro_confirm_label: "开始观察",
                message_before: "请观察顶部图片。",
                message_after: "请根据刚才看到的图片还原场景平面图。",
              },
            }
          : options.config.flow,
      }
    : options.config;
  const sessionId = createSessionId();
  const store = new StateStore(options.config);
  const clipboard = new ClipboardService();
  const encoder = new LayoutTaskEncoder();
  const dataSave = new DataSaveService({
    config: options.config.dataSave,
    uploadState: new UploadState(),
    localBackup: options.localBackup,
  });
  const pageTiming = new PageTimingCollector({
    pause: options.pause
      ? {
          getActiveElapsedMs: (startAt, endAt) => options.pause!.getActiveElapsedMs(startAt, endAt),
        }
      : undefined,
  });
  const localizedConfidence = options.confidence && options.locale === "zh-CN"
    ? {
        ...options.confidence,
        labels: {
          "1": "完全不确定",
          "2": "不确定",
          "3": "一般",
          "4": "确定",
          "5": "完全确定",
        },
      }
    : options.confidence;

  let recorder: Recorder | undefined;
  let interaction: InteractionController | undefined;
  let completion: CompletionController | undefined;
  let displayChangeRecorder: DisplayChangeRecorder | undefined;
  let referenceAssistanceRecorder: ReferenceAssistanceRecorder | undefined;
  let flow: FlowController | undefined;
  let confidence: ConfidenceController | undefined;
  let tutorial: TutorialController | undefined;
  let referenceBoard: ReturnType<typeof mountTutorialReferenceBoard> | undefined;
  let destroyed = false;
  let unregisterPauseInputGuard: (() => void) | undefined;
  const magnifier = new MagnifierController({
    pauseIntervals: () => getPauseIntervals(options.pause?.snapshot()),
  });

  const isPauseInputExcluded = () => options.pause?.isPaused()
    || options.pause?.snapshot().status === "confirming";
  const isInteractionBlocked = () => (tutorial?.isInteractionBlocked() ?? false)
    || magnifier.isActive()
    || isPauseInputExcluded();
  const canStartMagnifier = () => !destroyed && !store.isLocked() && !isPauseInputExcluded()
    && !magnifier.isActive() && (tutorial?.canStartMagnifier() ?? true);

  const showTutorial = () => {
    if (tutorial) {
      renderer.showTutorialStep(tutorial.getCurrentStep());
    }
  };

  const advanceTutorial = (event: TutorialEvent, payload?: TutorialEventPayload): boolean => {
    if (destroyed || store.isLocked() && event !== "submitted") return false;
    if (tutorial?.handle(event, payload)) {
      showTutorial();
      if (tutorial.getCurrentStep().id === "reference_board" && options.tutorialReferenceBoard && !referenceBoard) {
        referenceBoard = mountTutorialReferenceBoard({ root: options.root, ...options.tutorialReferenceBoard,
          onComplete: () => {
            referenceBoard = undefined;
            advanceTutorial("reference_board_completed");
          },
        });
      }
      return true;
    }
    return false;
  };

  const renderer = new LayoutTaskRenderer({
    root: options.root,
    config: localizedConfig,
    store,
    tutorialMode: options.tutorialMode,
    locale: options.locale,
    presentation: options.presentation,
    confidence: localizedConfidence
      ? {
          scale: localizedConfidence.scale,
          labels: localizedConfidence.labels,
          onChoose: (dimension, value) => {
            if (isInteractionBlocked() || options.pause?.isPaused() || store.isLocked()) return;
            confidence?.choose(dimension, value);
            advanceTutorial("confidence_chosen");
          },
          onSave: () => interaction?.saveActiveConfidence(),
        }
      : undefined,
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
    developerMode: options.developerMode,
    onDeveloperShortcut: () => {
      if (!options.developerMode || options.tutorialMode || !interaction || !confidence || isInteractionBlocked() || store.isLocked()) {
        return;
      }

      const defaultConfidence = localizedConfidence
        ? localizedConfidence.scale[Math.floor((localizedConfidence.scale.length - 1) / 2)] ?? 3
        : 3;
      const completedGroups = new Set<string>();
      for (const object of options.config.objects) {
        if (object.role !== "variable") {
          continue;
        }

        const groupId = object.group_id ?? object.id;
        if (completedGroups.has(groupId)) {
          continue;
        }

        interaction.selectObject(object.id);
        confidence.choose("position", defaultConfidence);
        confidence.choose("rotation", defaultConfidence);
        interaction.saveActiveConfidence();
        completedGroups.add(groupId);
      }
    },
    onCopyAgain: () => {
      void completion?.copyAgain();
    },
    onTutorialAcknowledge: () => advanceTutorial("view_direction_acknowledged"),
    isInteractionBlocked,
    isPaused: () => options.pause?.isPaused() ?? false,
      magnifier: {
        controller: magnifier,
        onEnter: (_position) => {
          if (!canStartMagnifier() || !magnifier.enter()) return false;
          if (tutorial && !advanceTutorial("magnifier_entered")) {
            magnifier.exit();
            return false;
          }
          return true;
        },
        onWheel: (direction) => {
          const change = magnifier.wheel(direction);
          if (change) {
            if (tutorial) advanceTutorial("magnifier_zoom_changed", change);
          }
          return change;
        },
        onExit: (reason) => {
          if (!magnifier.exit()) return false;
          if (tutorial) advanceTutorial("magnifier_exited", { exitReason: reason });
          return true;
        },
      },
    isObjectFirstSaveComplete: (objectId) => {
      const object = localizedConfig.objects.find((item) => item.id === objectId);
      if (object?.role !== "variable" || !localizedConfidence) {
        return true;
      }
      if (!confidence) {
        return false;
      }
      const groupId = object.group_id ?? object.id;
      return confidence.getFinalConfidence()[groupId] !== undefined;
    },
  });

  return {
    start() {
      // Mount before measuring or binding. Display metadata should describe the
      // layout the participant actually saw, and controllers need real refs.
      const refs = renderer.mount();
      // Browser-only observer: in Node unit tests there is no window, so skip it.
      // GitHub Pages / normal browser 里会正常开启；非浏览器环境只是不记录 display changes。
      displayChangeRecorder =
        options.config.recording.record_display_changes && typeof window !== "undefined"
          ? new DisplayChangeRecorder({ refs })
          : undefined;
      displayChangeRecorder?.start();
      referenceAssistanceRecorder =
        options.config.referenceMode === "persistent" && typeof window !== "undefined" && refs.displayImageFrameElement
          ? new ReferenceAssistanceRecorder()
          : undefined;
      if (referenceAssistanceRecorder && refs.displayImageFrameElement) {
        referenceAssistanceRecorder.start(refs.displayImageFrameElement, window);
      }

      const displayCollector = new DisplayInfoCollector(refs, options.config, displayChangeRecorder);
      const pauseController = options.pause;
      recorder = new Recorder({
    config: localizedConfig,
        sessionId,
        getDisplayInfo: () => displayCollector.collect(),
        getFinalState: () => store.getFinalState(),
        getPageTiming: (submitTime, playerStartTime) => pageTiming.collect(submitTime, playerStartTime),
        getFlowInfo: () => flow?.getFlowInfo() ?? { mode: options.config.flow.mode },
        getConfidence: () => confidence?.getFinalConfidence(),
        getReferenceAssistance: () => referenceAssistanceRecorder?.snapshot(),
        getPresentation: () => options.presentation,
        reward: options.reward,
        rewardReference: options.rewardReference,
        pause: pauseController ? {
          getActiveElapsedMs: (startAt, endAt) => pauseController.getActiveElapsedMs(startAt, endAt),
          snapshot: () => createPauseSummary(pauseController!.snapshot()),
        } : undefined,
      });
      confidence = localizedConfidence
        ? new ConfidenceController({
            config: options.config,
            required: localizedConfidence.required,
            scale: localizedConfidence.scale,
            requireAllGroupsOnSubmit: true,
          })
        : undefined;
      if (options.tutorialMode) {
        tutorial = new TutorialController(options.config.referenceMode, options.locale, {
          confidence,
          getGroupId: (objectId) => {
            const object = options.config.objects.find((item) => item.id === objectId);
            return object && (object.group_id ?? object.id);
          },
          referenceBoardRequired: !!options.tutorialReferenceBoard?.pages.length,
        });
        showTutorial();
      }
      interaction = new InteractionController({
        config: options.config,
        store,
        renderer,
        recorder,
        confidence,
        tutorial: {
          onObjectSelected: (objectId) => advanceTutorial("object_selected", { objectId }),
          onObjectAction: (objectId) => advanceTutorial("object_moved_or_rotated", { objectId }),
          onObjectDeselected: (objectId) => advanceTutorial("object_deselected", { objectId }),
          onObjectSaved: (objectId) => advanceTutorial("object_saved", { objectId }),
        },
        isInteractionBlocked,
        canSelectObject: (objectId) => tutorial?.canSelectObject(objectId) ?? true,
        pause: options.pause,
      });
      completion = new CompletionController({
        config: localizedConfig,
        store,
        recorder,
        renderer,
        encoder,
        clipboard,
        dataSave,
        confidence,
        tutorial,
        // The tutorial has its own staged guidance and completion bubble. Avoid
        // the formal experiment's native confirmation dialogs here because they
        // interrupt the tutorial flow and can appear as an unresponsive button.
        confirmImpl: options.tutorialMode ? () => true : undefined,
        pause: options.pause,
        isInteractionBlocked,
        locale: options.locale,
        onComplete: (payload) => {
          advanceTutorial("submitted");
          options.onComplete?.(payload);
        },
      });
      unregisterPauseInputGuard = options.pause?.registerInputGuard?.(() => !magnifier.isActive() && !store.isLocked());

      // Recorder owns page-level timing for the whole player session; flow adds
      // its own phase timestamps on top of that shared session record.
      recorder.start();
      flow = new FlowController({
        flow: localizedConfig.flow,
        referenceMode: localizedConfig.referenceMode,
        renderer,
        onPreviewAcknowledged: () => advanceTutorial("preview_acknowledged"),
        onReconstructionStart: () => {
          advanceTutorial("reconstruction_started");
          interaction?.bind();
        },
        pause: options.pause,
      });
      flow.start();
    },

    destroy() {
      // Teardown stays intentionally boring and explicit.
      // 这里只清理 binding 和 DOM，不偷偷改外部状态。
      destroyed = true;
      unregisterPauseInputGuard?.();
      unregisterPauseInputGuard = undefined;
      if (magnifier.isActive()) {
        magnifier.exit();
        tutorial?.handle("magnifier_exited", { exitReason: "destroy" });
      }
      referenceBoard?.destroy();
      interaction?.unbind();
      flow?.destroy();
      displayChangeRecorder?.stop();
      referenceAssistanceRecorder?.stop();
      renderer.destroy();
    },

    getState() {
      return store.getFinalState();
    },

    isLocked() {
      return store.isLocked();
    },
    getTutorialStep() { return tutorial?.getCurrentStep(); },
    // Tasks 4/5 call these contracts from their actual controller/UI events.
    // There is no user-facing control that generates synthetic practice events.
    handleTutorialPractice(event, payload) { return advanceTutorial(event, payload); },
    canStartMagnifier,
    canStartPause() { return !destroyed && !store.isLocked() && !magnifier.isActive() && !isPauseInputExcluded()
      && (tutorial?.canStartPause() ?? true); },
    getMagnifierSnapshot(taskWindow) { return magnifier.snapshot(taskWindow); },
  };
}

function getPauseIntervals(snapshot: ReturnType<ExperimentPauseController["snapshot"]> | undefined): Array<{ start: number; end: number }> {
  if (!snapshot) return [];
  const intervals: Array<{ start: number; end: number }> = [];
  let start: number | undefined;
  for (const event of snapshot.events) {
    if (event.type === "pause_confirmed") {
      start = event.at;
    } else if (start !== undefined && event.type === "pause_resumed") {
      intervals.push({ start, end: event.at });
      start = undefined;
    }
  }
  if (start !== undefined) intervals.push({ start, end: Date.now() });
  return intervals;
}
