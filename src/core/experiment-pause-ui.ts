import {
  ExperimentPauseController,
  FORMAL_PAUSE_LIMIT_MS,
  PRACTICE_PAUSE_LIMIT_MS,
} from "./experiment-pause";

export interface ExperimentPauseUiOptions {
  controller: ExperimentPauseController;
  practiceController?: ExperimentPauseController;
  documentRef?: Document;
  now?: () => number;
}

export interface ExperimentPauseUi {
  mount(): void;
  setPageActive(active: boolean): void;
  setTutorialPracticeEnabled(enabled: boolean): void;
  destroy(): void;
}

export function createExperimentPauseUi(options: ExperimentPauseUiOptions): ExperimentPauseUi {
  const documentRef = options.documentRef ?? document;
  const now = options.now ?? (() => Date.now());
  const root = documentRef.createElement("div");
  root.dataset.layoutTaskPauseRoot = "";
  root.className = "layout-task-pause-root";

  const button = documentRef.createElement("button");
  button.type = "button";
  button.dataset.layoutTaskPause = "";
  button.className = "layout-task-pause-button";
  button.textContent = "Pause";
  button.setAttribute("aria-label", "Pause experiment");

  const dialog = documentRef.createElement("div");
  dialog.dataset.layoutTaskPauseDialog = "";
  dialog.className = "layout-task-pause-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  const dialogText = documentRef.createElement("p");
  dialogText.textContent = "Are you sure you want to pause? This is your only pause opportunity and it can last up to 15 minutes.";
  const confirmButton = documentRef.createElement("button");
  confirmButton.type = "button";
  confirmButton.dataset.layoutTaskPauseConfirm = "";
  confirmButton.textContent = "Confirm pause";
  const cancelButton = documentRef.createElement("button");
  cancelButton.type = "button";
  cancelButton.dataset.layoutTaskPauseCancel = "";
  cancelButton.textContent = "Cancel";
  dialog.append(dialogText, confirmButton, cancelButton);

  const overlay = documentRef.createElement("div");
  overlay.dataset.layoutTaskPauseOverlay = "";
  overlay.className = "layout-task-pause-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  const remaining = documentRef.createElement("p");
  remaining.dataset.layoutTaskPauseRemaining = "";
  const resumeButton = documentRef.createElement("button");
  resumeButton.type = "button";
  resumeButton.dataset.layoutTaskPauseResume = "";
  resumeButton.textContent = "Resume";
  overlay.append(remaining, resumeButton);
  root.append(button, dialog, overlay);

  let mounted = false;
  let pageActive = true;
  let practiceEnabled = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  const unsubscribe = [options.controller.subscribe(update)];
  if (options.practiceController) {
    unsubscribe.push(options.practiceController.subscribe(update));
  }

  function activeController(): ExperimentPauseController {
    return practiceEnabled && options.practiceController ? options.practiceController : options.controller;
  }

  function update(): void {
    const controller = activeController();
    const snapshot = controller.snapshot();
    const isPractice = practiceEnabled && Boolean(options.practiceController);
    root.hidden = !pageActive;
    dialog.hidden = snapshot.status !== "confirming";
    overlay.hidden = !controller.isPaused();
    button.disabled = isPractice
      ? snapshot.status !== "practice_available"
      : snapshot.status !== "available";
    button.textContent = isPractice ? "Pause practice" : "Pause";
    if (controller.isPaused() && snapshot.pauseStartedAt !== undefined) {
      const limit = isPractice ? PRACTICE_PAUSE_LIMIT_MS : FORMAL_PAUSE_LIMIT_MS;
      const seconds = Math.max(0, Math.ceil((limit - (now() - snapshot.pauseStartedAt)) / 1_000));
      remaining.textContent = `${formatRemaining(seconds)} remaining`;
    }
  }

  function preventOverlayInteraction(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  button.addEventListener("click", () => {
    activeController().requestPause();
    update();
  });
  confirmButton.addEventListener("click", () => {
    activeController().confirmPause();
    update();
  });
  cancelButton.addEventListener("click", () => {
    activeController().cancelConfirmation();
    update();
  });
  resumeButton.addEventListener("click", () => {
    activeController().resume("manual_resume");
    update();
  });
  ["pointerdown", "pointermove", "wheel", "contextmenu", "keydown"].forEach((type) => {
    overlay.addEventListener(type, preventOverlayInteraction, { capture: true });
  });

  return {
    mount() {
      if (mounted) {
        return;
      }
      documentRef.body.append(root);
      mounted = true;
      interval = setInterval(update, 1_000);
      update();
    },
    setPageActive(active) {
      pageActive = active;
      update();
    },
    setTutorialPracticeEnabled(enabled) {
      practiceEnabled = enabled && Boolean(options.practiceController);
      update();
    },
    destroy() {
      if (interval !== undefined) {
        clearInterval(interval);
        interval = undefined;
      }
      unsubscribe.forEach((remove) => remove());
      root.remove();
      mounted = false;
    },
  };
}

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}
