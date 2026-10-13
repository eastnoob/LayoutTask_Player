import {
  ExperimentPauseController,
  FORMAL_PAUSE_LIMIT_MS,
  PRACTICE_PAUSE_LIMIT_MS,
} from "./experiment-pause";

export interface ExperimentPauseUiOptions {
  controller: ExperimentPauseController;
  documentRef?: Document;
  now?: () => number;
  locale?: "en-US" | "zh-CN";
  mountRoot?: HTMLElement;
}

export interface ExperimentPauseUi {
  mount(): void;
  setPageActive(active: boolean): void;
  setPauseEnabled(enabled: boolean): void;
  destroy(): void;
}

export function createExperimentPauseUi(options: ExperimentPauseUiOptions): ExperimentPauseUi {
  const documentRef = options.documentRef ?? document;
  const now = options.now ?? (() => Date.now());
  const locale = options.locale ?? "en-US";
  const tutorialPractice = options.controller.snapshot().mode === "tutorial_practice";
  const mountRoot = options.mountRoot ?? documentRef.body;
  const root = documentRef.createElement("div");
  root.dataset.layoutTaskPauseRoot = "";
  root.className = "layout-task-pause-root";

  const button = documentRef.createElement("button");
  button.type = "button";
  button.dataset.layoutTaskPause = "";
  button.dataset.layoutTaskAnchor = "pause";
  button.className = "layout-task-pause-button";
  button.textContent = locale === "zh-CN" ? "暂停" : "Pause";
  button.setAttribute("aria-label", locale === "zh-CN" ? "暂停实验" : "Pause experiment");

  const dialog = documentRef.createElement("div");
  dialog.dataset.layoutTaskPauseDialog = "";
  dialog.className = "layout-task-pause-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  const dialogText = documentRef.createElement("p");
  dialogText.textContent = getDialogText(tutorialPractice, locale);
  const confirmButton = documentRef.createElement("button");
  confirmButton.type = "button";
  confirmButton.dataset.layoutTaskPauseConfirm = "";
  confirmButton.textContent = tutorialPractice
    ? (locale === "zh-CN" ? "开始练习" : "Start practice")
    : (locale === "zh-CN" ? "确认暂停" : "Confirm pause");
  const cancelButton = documentRef.createElement("button");
  cancelButton.type = "button";
  cancelButton.dataset.layoutTaskPauseCancel = "";
  cancelButton.textContent = locale === "zh-CN" ? "取消" : "Cancel";
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
  resumeButton.textContent = locale === "zh-CN" ? "恢复" : "Resume";
  overlay.append(remaining, resumeButton);
  root.append(button, dialog, overlay);

  let mounted = false;
  let pageActive = true;
  let pauseEnabled = true;
  let interval: ReturnType<typeof setInterval> | undefined;
  const unsubscribe = options.controller.subscribe(update);

  function update(): void {
    const snapshot = options.controller.snapshot();
    const availableStatus = tutorialPractice ? "practice_available" : "available";
    const isPracticeAvailable = tutorialPractice && snapshot.status === "practice_available";
    root.hidden = !pageActive;
    dialog.hidden = snapshot.status !== "confirming";
    overlay.hidden = !options.controller.isPaused();
    button.disabled = !pauseEnabled || snapshot.status !== availableStatus;
    root.classList.toggle("is-tutorial-pause-practice", isPracticeAvailable && pauseEnabled);
    dialogText.textContent = getDialogText(tutorialPractice, locale);
    if (options.controller.isPaused() && snapshot.pauseStartedAt !== undefined) {
      const limit = tutorialPractice ? PRACTICE_PAUSE_LIMIT_MS : FORMAL_PAUSE_LIMIT_MS;
      const seconds = Math.max(0, Math.ceil((limit - (now() - snapshot.pauseStartedAt)) / 1_000));
      remaining.textContent = tutorialPractice
        ? (locale === "zh-CN" ? `剩余 ${formatRemaining(seconds)}` : `${formatRemaining(seconds)} remaining`)
        : `${formatRemaining(seconds)} remaining`;
    }
  }

  function preventOverlayInteraction(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  button.addEventListener("click", () => {
    if (!pauseEnabled) {
      return;
    }
    options.controller.requestPause();
    update();
  });
  confirmButton.addEventListener("click", () => {
    options.controller.confirmPause();
    update();
  });
  cancelButton.addEventListener("click", () => {
    options.controller.cancelConfirmation();
    update();
  });
  resumeButton.addEventListener("click", () => {
    options.controller.resume("manual_resume");
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
      mountRoot.append(root);
      mounted = true;
      interval = setInterval(update, 1_000);
      update();
    },
    setPageActive(active) {
      pageActive = active;
      update();
    },
    setPauseEnabled(enabled) {
      pauseEnabled = enabled;
      update();
    },
    destroy() {
      if (interval !== undefined) {
        clearInterval(interval);
        interval = undefined;
      }
      unsubscribe();
      root.remove();
      mounted = false;
    },
  };
}

function getDialogText(tutorialPractice: boolean, locale: "en-US" | "zh-CN"): string {
  if (tutorialPractice) {
    return locale === "zh-CN"
      ? "要开始 Pause 练习吗？练习最长 10 秒，不会消耗正式实验的暂停机会。"
      : "Start the Pause practice? It lasts up to 10 seconds and does not use your formal pause.";
  }
  return locale === "zh-CN"
    ? "确定要暂停吗？正式实验只有一次暂停机会，最长 15 分钟。"
    : "Are you sure you want to pause? This is your only pause opportunity and it can last up to 15 minutes.";
}

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}
