export const KONAMI_CODE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
] as const;

export type ExperimentConsentResult = "agreed" | "developer";

export function getKonamiProgress(progress: string[], key: string): string[] {
  const normalizedKey = key.length === 1 ? key.toLowerCase() : key;
  const next = [...progress, normalizedKey];
  return KONAMI_CODE.slice(0, next.length).every((expected, index) => expected === next[index])
    ? next
    : [];
}

export function waitForExperimentConsent(options: {
  root: HTMLElement;
  locale?: "en-US" | "zh-CN";
  documentRef?: Document;
}): Promise<ExperimentConsentResult> {
  const documentRef = options.documentRef ?? document;
  const chinese = options.locale === "zh-CN";
  return new Promise((resolve) => {
    let section: HTMLElement;
    let progress: string[] = [];

    const renderConsent = () => {
      section = documentRef.createElement("section");
      section.className = "layout-task-shell layout-task-consent-shell";
      section.innerHTML = chinese
        ? `<header class="layout-task-header"><p class="layout-task-eyebrow">实验说明</p><h1>开始实验前请阅读</h1></header><p>请根据图片还原平面图中的家具布局，并认真完成每一道题。实验大约需要 15 分钟。</p><p>点击“我同意”后，系统才会生成被试编号并开始实验。</p><button type="button" class="layout-task-primary-button">我同意</button>`
        : `<header class="layout-task-header"><p class="layout-task-eyebrow">Experiment information</p><h1>Before you begin</h1></header><p>Study each picture and reconstruct the furniture layout on the floor plan. Please complete every trial carefully. The experiment takes about 15 minutes.</p><p>Your participant ID will be created only after you click “I agree” and begin.</p><button type="button" class="layout-task-primary-button">I agree</button>`;
      options.root.replaceChildren(section);
      section.querySelector("button")!.addEventListener("click", () => {
        documentRef.removeEventListener("keydown", onKeyDown);
        section.remove();
        resolve("agreed");
      }, { once: true });
    };

    const renderDeveloperConfirmation = () => {
      section.innerHTML = chinese
        ? `<header class="layout-task-header"><p class="layout-task-eyebrow">开发者模式</p><h1>进入开发者模式？</h1></header><p>这将使用被试编号 9999，并标记为开发者测试数据。</p><button type="button" class="layout-task-primary-button">继续开发者模式</button><button type="button" class="layout-task-secondary-button">取消</button>`
        : `<header class="layout-task-header"><p class="layout-task-eyebrow">Developer mode</p><h1>Enter developer mode?</h1></header><p>This will use participant ID 9999 and mark the data as a developer test.</p><button type="button" class="layout-task-primary-button">Continue developer mode</button><button type="button" class="layout-task-secondary-button">Cancel</button>`;
      section.querySelector(".layout-task-primary-button")!.addEventListener("click", () => {
        section.remove();
        resolve("developer");
      }, { once: true });
      section.querySelector(".layout-task-secondary-button")!.addEventListener("click", () => {
        progress = [];
        renderConsent();
        documentRef.addEventListener("keydown", onKeyDown);
      }, { once: true });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      progress = getKonamiProgress(progress, event.key);
      if (progress.length === KONAMI_CODE.length) {
        documentRef.removeEventListener("keydown", onKeyDown);
        renderDeveloperConfirmation();
      }
    };
    renderConsent();
    documentRef.addEventListener("keydown", onKeyDown);
  });
}
