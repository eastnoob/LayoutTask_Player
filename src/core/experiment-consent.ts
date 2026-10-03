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

export interface ConsentRecord {
  consent_version: "informed-consent-2026-10-03-v1";
  notice_version: "data-protection-2026-10-03-v1";
  locale: "en-US" | "zh-CN";
  consented_at: string;
  signature_method: "checkbox_confirmation";
  voluntary_participation_confirmed: true;
  questions_answered_confirmed: true;
  prestudy_document_confirmed: true;
  withdrawal_right_understood_confirmed: true;
  developer_mode: boolean;
}

export type ExperimentConsentResult = {
  mode: "agreed" | "developer";
  consent: ConsentRecord;
};

export function createConsentRecord(options: {
  locale: "en-US" | "zh-CN";
  mode: "agreed" | "developer";
  consentedAt?: string;
}): ConsentRecord {
  return {
    consent_version: "informed-consent-2026-10-03-v1",
    notice_version: "data-protection-2026-10-03-v1",
    locale: options.locale,
    consented_at: options.consentedAt ?? new Date().toISOString(),
    signature_method: "checkbox_confirmation",
    voluntary_participation_confirmed: true,
    questions_answered_confirmed: true,
    prestudy_document_confirmed: true,
    withdrawal_right_understood_confirmed: true,
    developer_mode: options.mode === "developer",
  };
}

export function parseProlificIdInput(value: string): string | undefined {
  return value.trim() ? value : undefined;
}

export function waitForProlificId(options: {
  root: HTMLElement;
  locale?: "en-US" | "zh-CN";
  documentRef?: Document;
}): Promise<string> {
  const documentRef = options.documentRef ?? document;
  const chinese = options.locale === "zh-CN";
  return new Promise((resolve) => {
    const section = documentRef.createElement("section");
    section.className = "layout-task-shell layout-task-prolific-id-shell";
    section.innerHTML = chinese
      ? `<header class="layout-task-header"><p class="layout-task-eyebrow">被试信息</p><h1>请输入您的 Prolific ID</h1></header><p>请从 Prolific 复制您的唯一 ID，并粘贴到下方。允许复制和粘贴。</p><label for="layout-task-prolific-id">Prolific ID</label><input id="layout-task-prolific-id" type="text" autocomplete="off" spellcheck="false" required /><p class="layout-task-form-error" role="alert" hidden>请输入 Prolific ID 后继续。</p><button type="button" class="layout-task-primary-button">继续</button>`
      : `<header class="layout-task-header"><p class="layout-task-eyebrow">Participant information</p><h1>Enter your Prolific ID</h1></header><p>Copy your unique ID from Prolific and paste it below. Copy and paste are allowed.</p><label for="layout-task-prolific-id">Prolific ID</label><input id="layout-task-prolific-id" type="text" autocomplete="off" spellcheck="false" required /><p class="layout-task-form-error" role="alert" hidden>Please enter your Prolific ID before continuing.</p><button type="button" class="layout-task-primary-button">Continue</button>`;
    options.root.replaceChildren(section);
    const input = section.querySelector<HTMLInputElement>("#layout-task-prolific-id")!;
    const error = section.querySelector<HTMLElement>(".layout-task-form-error")!;
    const button = section.querySelector<HTMLButtonElement>("button")!;
    const submit = () => {
      const value = parseProlificIdInput(input.value);
      if (value === undefined) {
        error.hidden = false;
        input.focus();
        return;
      }
      section.remove();
      resolve(value);
    };
    button.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
    });
    input.focus();
  });
}

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
