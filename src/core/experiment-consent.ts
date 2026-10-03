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

export interface ConsentPageCopy {
  eyebrow: string;
  title: string;
  introduction: string;
  studyDetails: string;
  dataDetails: string;
  signatureNotice: string;
  confirmations: [string, string, string, string];
  buttonLabel: string;
}

export function getConsentPageCopy(locale: "en-US" | "zh-CN"): ConsentPageCopy {
  return locale === "zh-CN"
    ? {
      eyebrow: "知情同意",
      title: "开始实验前请阅读并确认",
      introduction: "本研究请您根据室内照片，还原平面图中的家具位置和朝向。",
      studyDetails: "整个研究大约需要 20–40 分钟。报酬为 £4 基础奖金，另加根据任务表现计算的任务奖金。",
      dataDetails: "我们会收集您的 Prolific ID、参与者和会话信息、位置与旋转答案、置信度、反应时间以及任务操作记录。数据将通过大学提供的研究存储和研究数据管道保存。",
      signatureNotice: "勾选以下确认项并点击“我同意”即表示您作出电子确认，可视为本研究中的电子签字；这不代表生成手写签名。",
      confirmations: [
        "我确认自己是自愿参加本研究的。",
        "我确认自己有机会提问，并已获得相应答复。",
        "我确认自己在研究开始前已看到本知情说明。",
        "我确认自己理解可以随时退出本研究。",
      ],
      buttonLabel: "我同意并开始",
    }
    : {
      eyebrow: "Informed consent",
      title: "Read and confirm before you begin",
      introduction: "This study asks you to reconstruct furniture positions and orientations on a floor plan from indoor photographs.",
      studyDetails: "The study takes approximately 20–40 minutes. Compensation is a £4 base payment plus task-performance bonuses.",
      dataDetails: "We collect your Prolific ID, participant and session information, position and rotation responses, confidence ratings, reaction times, and task-operation records. Data are stored using university-provided research storage and the university research data pipeline.",
      signatureNotice: "Checking the confirmations below and selecting “I agree” is your electronic confirmation and may be treated as your electronic signature for this study; it does not create a handwritten signature.",
      confirmations: [
        "I confirm that I volunteered to participate in this study.",
        "I confirm that I was allowed to ask questions and that I was provided with responses.",
        "I confirm that I was presented with this document prior to the beginning of the study.",
        "I confirm that I understood my right to quit the study at any time.",
      ],
      buttonLabel: "I agree and begin",
    };
}

export function isConsentComplete(values: boolean[]): boolean {
  return values.length === 4 && values.every(Boolean);
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
  developerMode?: boolean;
  documentRef?: Document;
}): Promise<ExperimentConsentResult> {
  const documentRef = options.documentRef ?? document;
  const chinese = options.locale === "zh-CN";
  return new Promise((resolve) => {
    let section: HTMLElement;
    let progress: string[] = [];
    let mode: "agreed" | "developer" = options.developerMode ? "developer" : "agreed";

    const renderConsent = () => {
      const copy = getConsentPageCopy(options.locale ?? "en-US");
      section = documentRef.createElement("section");
      section.className = "layout-task-shell layout-task-consent-shell";
      const developerNotice = mode === "developer"
        ? chinese
          ? `<p class="layout-task-consent-developer-notice">开发者模式：本次测试将使用被试编号 9999，并在数据中标记为开发者测试。</p>`
          : `<p class="layout-task-consent-developer-notice">Developer mode: this test will use participant ID 9999 and will be marked as developer data.</p>`
        : "";
      section.innerHTML = `
        <header class="layout-task-header">
          <p class="layout-task-eyebrow">${copy.eyebrow}</p>
          <h1>${copy.title}</h1>
        </header>
        <div class="layout-task-consent-copy">
          <p>${copy.introduction}</p>
          <p>${copy.studyDetails}</p>
          <p>${copy.dataDetails}</p>
          ${developerNotice}
          <p class="layout-task-consent-signature-notice">${copy.signatureNotice}</p>
        </div>
        <fieldset class="layout-task-consent-checklist">
          <legend>${chinese ? "请逐项确认" : "Please confirm each statement"}</legend>
          ${copy.confirmations.map((confirmation, index) => `
            <label class="layout-task-consent-checkbox">
              <input type="checkbox" data-consent-index="${index}" />
              <span>${confirmation}</span>
            </label>
          `).join("")}
        </fieldset>
        <button type="button" class="layout-task-primary-button" disabled>${copy.buttonLabel}</button>
      `;
      options.root.replaceChildren(section);
      const checkboxes = Array.from(section.querySelectorAll<HTMLInputElement>("[data-consent-index]"));
      const button = section.querySelector<HTMLButtonElement>("button")!;
      const updateButton = () => {
        button.disabled = !isConsentComplete(checkboxes.map((checkbox) => checkbox.checked));
      };
      checkboxes.forEach((checkbox) => checkbox.addEventListener("change", updateButton));
      button.addEventListener("click", () => {
        if (button.disabled) return;
        documentRef.removeEventListener("keydown", onKeyDown);
        section.remove();
        resolve({ mode, consent: createConsentRecord({ locale: options.locale ?? "en-US", mode }) });
      }, { once: true });
    };

    const renderDeveloperConfirmation = () => {
      section.innerHTML = chinese
        ? `<header class="layout-task-header"><p class="layout-task-eyebrow">开发者模式</p><h1>进入开发者模式？</h1></header><p>这将使用被试编号 9999，并标记为开发者测试数据。</p><button type="button" class="layout-task-primary-button">继续开发者模式</button><button type="button" class="layout-task-secondary-button">取消</button>`
        : `<header class="layout-task-header"><p class="layout-task-eyebrow">Developer mode</p><h1>Enter developer mode?</h1></header><p>This will use participant ID 9999 and mark the data as a developer test.</p><button type="button" class="layout-task-primary-button">Continue developer mode</button><button type="button" class="layout-task-secondary-button">Cancel</button>`;
      section.querySelector(".layout-task-primary-button")!.addEventListener("click", () => {
        mode = "developer";
        renderConsent();
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
