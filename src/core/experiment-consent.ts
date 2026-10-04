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
  data_protection_statement_confirmed: true;
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
    data_protection_statement_confirmed: true,
    developer_mode: options.mode === "developer",
  };
}

export interface ConsentPageCopy {
  eyebrow: string;
  title: string;
  fullDocumentHtml: string;
  signatureNotice: string;
  confirmations: [string, string, string, string, string];
  buttonLabel: string;
}

const ENGLISH_DOCUMENT_HTML = `
  <article class="layout-task-consent-document-content">
    <h2>Informed Consent Form</h2>
    <p><strong>Study title:</strong> Spatial Perception of Furniture Position and Orientation from a Single Indoor Photograph</p>
    <p><strong>Revision:</strong> 1</p>
    <p>Dear Participant, thank you for your participation in this study.</p>
    <h3>Researcher(s)</h3>
    <p>Fengxu Tian (SPARC Lab), <a href="mailto:ftian@uni-muenster.de">ftian@uni-muenster.de</a><br />Jun.-Prof. Dr. Jakub Krukar (SPARC Lab), <a href="mailto:krukar@uni-muenster.de">krukar@uni-muenster.de</a></p>
    <h3>Purpose of the study</h3>
    <p>This study aims to understand how people perceive spatial layout based on a single indoor image. You will view images of indoor scenes and, based on your interpretation, move yellow furniture on a floor plan to the approximate locations and orientations where you perceive them to be in the images. Your responses will help us better understand how people extract spatial information from images.</p>
    <h3>Procedure</h3>
    <p>If you agree to participate, you will first read the study instructions and confirm your informed consent. For each task, an indoor scene image appears above a floor plan. Adjust only the yellow furniture items with the move and rotate tools so that their positions and orientations match the image as closely as possible. Open every yellow item at least once, rate your certainty about placement and orientation, and save before submitting. Yellow highlighting appears only on the floor plan; the furniture in the indoor image retains its original colors. Reconstruction results, response times, certainty ratings, and task-related actions will be recorded.</p>
    <h3>Duration</h3>
    <p>This study usually takes approximately <strong>20–40 minutes</strong>. The actual duration varies with response speed and the time spent on individual judgments.</p>
    <h3>Potential risks</h3>
    <p>This is a low-risk online computer-based experiment. Prolonged screen viewing or sustained attention may cause mild eye strain, cognitive fatigue, or brief discomfort. There are no invasive procedures, physical exertion, virtual-reality equipment, emotionally intense content, or rapidly flashing stimuli. The materials show ordinary indoor spaces and furniture. You may close the webpage at any time to stop participating. During the experiment there is one pause opportunity of up to 15 minutes; it resumes automatically after the limit.</p>
    <h3>Privacy and data processing</h3>
    <p>The online experiment records your <strong>Prolific ID</strong>, participant and session information, furniture position and rotation answers, confidence ratings, response times, and task-operation records. Data are stored using university-provided research storage and the university research data pipeline. Data will be analysed in de-identified form for scientific research and will not be published in a way that identifies you. Please see the data-protection statement below for your rights and contact details.</p>
    <h3>Benefits and compensation</h3>
    <p>The compensation for this study is a <strong>£4 base payment plus task-performance bonuses</strong>. Payment is administered through the third-party recruitment platform. There may be no direct personal benefit from taking part.</p>
    <p>You are free to stop or quit the study and withdraw consent at any time without giving a reason. If you have questions, please ask them before agreeing. For questions, complaints, or issues, contact the institute's Ethics Committee at <a href="mailto:ifgi-ethics@listserv.uni-muenster.de">ifgi-ethics@listserv.uni-muenster.de</a>.</p>
    <h2>Data protection policy in accordance with Art. 13 GDPR</h2>
    <p><strong>Project/reason:</strong> Spatial Perception of Furniture Position and Orientation from a Single Indoor Photograph<br /><strong>Revision:</strong> 1</p>
    <h3>1. Name and address of the responsible controller</h3>
    <p>Universität Münster / University of Münster, represented by its Rector, Schlossplatz 2, 48149 Münster, Germany; telephone +49 251 83-0; email <a href="mailto:mailbox@uni-muenster.de">mailbox@uni-muenster.de</a>.</p>
    <p>Responsible project staff: Fengxu Tian (SPARC Lab), <a href="mailto:ftian@uni-muenster.de">ftian@uni-muenster.de</a>; Jun.-Prof. Dr. Jakub Krukar (SPARC Lab), <a href="mailto:krukar@uni-muenster.de">krukar@uni-muenster.de</a>.</p>
    <h3>2. Contact data of the Data Protection Officer</h3>
    <p>Data Protection Office, Schlossplatz 2, 48149 Münster; telephone +49 251 83-22446; email <a href="mailto:datenschutz@uni-muenster.de">datenschutz@uni-muenster.de</a>.</p>
    <h3>3. Data processing</h3>
    <p>The purpose is to conduct this project and draw scientific conclusions about groups. The legal basis is your consent under Art. 6(1)(a) GDPR and, if applicable, Art. 9(2)(a) GDPR. The online study uses the data listed under “Privacy and data processing” above. The paper declaration from which this notice was adapted lists full name, date of birth, email address, and phone number; those paper-form fields are <strong>not collected by this online experiment</strong>.</p>
    <p>Research data are kept only as long as necessary for the project and according to the project's stated de-identification and deletion procedure. De-identified research data may be retained for up to 12 years. Your data are not shared with other recipients within or outside the University except for the university-provided research storage and processing services described above.</p>
    <h3>4. Your rights as a data subject</h3>
    <p>You have the right to information (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), and withdrawal of consent (Art. 7(3)). You may withdraw consent in writing or by email from the contacts above. You also have the right to lodge a complaint with the Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen, Postfach 20 04 44, 40102 Düsseldorf; telephone +49 211 / 38424-0; email <a href="mailto:poststelle@ldi.nrw.de">poststelle@ldi.nrw.de</a>.</p>
    <h3>Declaration of consent</h3>
    <p>By confirming below, you voluntarily consent to the collection and processing of the online-study data described above for the stated purposes. You have been informed of the scope and purpose of data collection and processing and of your right to withdraw consent. In the paper form, the declaration also contains fields for full name, date of birth, parent or legal guardian, email address, city/date, and signature; these paper fields are not requested in this online experiment.</p>
  </article>
`;

const CHINESE_DOCUMENT_HTML = `
  <article class="layout-task-consent-document-content">
    <h2>知情同意书</h2>
    <p><strong>研究标题：</strong>根据单张室内照片感知家具的位置与朝向</p>
    <p><strong>修订版本：</strong>1</p>
    <p>尊敬的参与者：感谢您参加本研究。</p>
    <h3>研究者</h3>
    <p>Fengxu Tian（SPARC 实验室），<a href="mailto:ftian@uni-muenster.de">ftian@uni-muenster.de</a><br />Jun.-Prof. Dr. Jakub Krukar（SPARC 实验室），<a href="mailto:krukar@uni-muenster.de">krukar@uni-muenster.de</a></p>
    <h3>研究目的</h3>
    <p>本研究旨在了解人们如何根据单张室内图像感知空间布局。您将查看室内场景图，并根据您的理解，在平面图上把黄色家具移动到您认为与图像中相符的大致位置和朝向。您的回答将帮助我们了解人们如何从图像中提取空间信息。</p>
    <h3>研究流程</h3>
    <p>如果您同意参加，您将先阅读实验说明并确认知情同意。每个任务中，页面上方会显示室内场景图，下方会显示平面图。请只使用移动和旋转工具调整黄色家具，使其位置和朝向尽可能与上方图片一致。每个黄色物体都必须至少打开一次，选择位置和朝向的确定程度，并在提交前保存。黄色标记只出现在平面图中；室内图片中的家具保持原有颜色。系统会记录平面图还原结果、反应时间、确定程度以及任务操作记录。</p>
    <h3>研究时长</h3>
    <p>本研究通常需要约 <strong>20–40 分钟</strong>。实际时长会因回答速度和每个判断所用时间而有所不同。</p>
    <h3>潜在风险</h3>
    <p>本研究属于低风险的在线计算机实验。长时间看屏幕或持续集中注意力可能造成轻微眼疲劳、认知疲劳或短暂不适。实验不涉及侵入性操作、体力活动、虚拟现实设备、强烈情绪内容或快速闪烁刺激。材料是普通室内空间和家具。您可以随时关闭网页停止参加。实验期间有一次最长 15 分钟的暂停机会，达到时限后会自动恢复。</p>
    <h3>隐私与数据处理</h3>
    <p>在线实验会记录您的 <strong>Prolific ID</strong>、参与者和会话信息、家具位置与旋转答案、置信度、反应时间以及任务操作记录。数据将使用大学提供的研究存储和研究数据管道保存，并以去标识化形式用于科学研究；发布时不会以能够识别您个人的方式公开。下方的数据保护声明说明了您的权利和联系信息。</p>
    <h3>受益与报酬</h3>
    <p>本研究报酬为 <strong>£4 基础奖金，另加任务表现奖金</strong>，通过第三方招募平台发放。参加本研究可能不会给您带来直接的个人收益。</p>
    <p>您可以随时停止或退出研究并撤回同意，无需说明理由。如果您有任何问题，请在同意前提出。若有问题、投诉或需要协助，请联系研究伦理委员会：<a href="mailto:ifgi-ethics@listserv.uni-muenster.de">ifgi-ethics@listserv.uni-muenster.de</a>。</p>
    <h2>依据《通用数据保护条例》第 13 条的数据保护声明</h2>
    <p><strong>项目/研究名称：</strong>根据单张室内照片感知家具的位置与朝向<br /><strong>修订版本：</strong>1</p>
    <h3>1. 负责数据控制者的名称和地址</h3>
    <p>明斯特大学（Universität Münster / University of Münster），由校长代表，Schlossplatz 2, 48149 Münster, Germany；电话 +49 251 83-0；邮箱 <a href="mailto:mailbox@uni-muenster.de">mailbox@uni-muenster.de</a>。</p>
    <p>项目负责研究人员：Fengxu Tian（SPARC 实验室），<a href="mailto:ftian@uni-muenster.de">ftian@uni-muenster.de</a>；Jun.-Prof. Dr. Jakub Krukar（SPARC 实验室），<a href="mailto:krukar@uni-muenster.de">krukar@uni-muenster.de</a>。</p>
    <h3>2. 数据保护官联系方式</h3>
    <p>数据保护办公室，Schlossplatz 2, 48149 Münster；电话 +49 251 83-22446；邮箱 <a href="mailto:datenschutz@uni-muenster.de">datenschutz@uni-muenster.de</a>。</p>
    <h3>3. 数据处理</h3>
    <p>数据处理目的为开展本项目，并对群体而非个人得出科学结论。法律依据是您依据 GDPR 第 6(1)(a) 条以及（如适用）第 9(2)(a) 条作出的同意。本在线实验使用上方“隐私与数据处理”中列明的数据。原始纸质声明中列出了姓名、出生日期、邮箱和电话等字段；这些纸质表单字段<strong>不会由本在线实验收集</strong>。</p>
    <p>研究数据仅在项目所需期限内，并依据项目既定的去标识化和删除流程保存。去标识化研究数据最长可保存 12 年。除上方所述大学提供的研究存储和处理服务外，您的数据不会提供给大学内部或外部的其他接收方。</p>
    <h3>4. 数据主体的权利</h3>
    <p>您有权查阅个人数据（GDPR 第 15 条）、更正（第 16 条）、删除（第 17 条）、限制处理（第 18 条）以及撤回同意（第 7(3) 条）。您可以通过书面或电子邮件向上述联系人撤回同意。您也有权向监管机构投诉：北莱茵-威斯特法伦州数据保护与信息自由专员，Postfach 20 04 44, 40102 Düsseldorf；电话 +49 211 / 38424-0；邮箱 <a href="mailto:poststelle@ldi.nrw.de">poststelle@ldi.nrw.de</a>。</p>
    <h3>同意声明</h3>
    <p>勾选下方确认项即表示您自愿同意按照上述目的收集和处理本在线实验所述数据。您已获知数据收集与处理的范围和目的，以及撤回同意的权利。原纸质表单还包含姓名、出生日期、父母或法定监护人、邮箱、地点/日期和签名字段；这些纸质字段不会在本在线实验中要求填写。</p>
  </article>
`;

export function getConsentPageCopy(locale: "en-US" | "zh-CN"): ConsentPageCopy {
  return locale === "zh-CN"
    ? {
      eyebrow: "知情同意",
      title: "开始实验前请阅读并确认",
      fullDocumentHtml: CHINESE_DOCUMENT_HTML,
      signatureNotice: "勾选以下确认项并点击“我同意”即表示您作出电子确认，可视为本研究中的电子签字；这不代表生成手写签名。",
      confirmations: [
        "我确认自己是自愿参加本研究的。",
        "我确认自己有机会提问，并已获得相应答复。",
        "我确认自己在研究开始前已看到本知情说明。",
        "我确认自己理解可以随时退出本研究。",
        "我确认自己已阅读数据保护声明，并自愿同意按照声明收集和处理数据。",
      ],
      buttonLabel: "我同意并开始",
    }
    : {
      eyebrow: "Informed consent",
      title: "Read and confirm before you begin",
      fullDocumentHtml: ENGLISH_DOCUMENT_HTML,
      signatureNotice: "Checking the confirmations below and selecting “I agree” is your electronic confirmation and may be treated as your electronic signature for this study; it does not create a handwritten signature.",
      confirmations: [
        "I confirm that I volunteered to participate in this study.",
        "I confirm that I was allowed to ask questions and that I was provided with responses.",
        "I confirm that I was presented with this document prior to the beginning of the study.",
        "I confirm that I understood my right to quit the study at any time.",
        "I confirm that I have read the data protection statement and voluntarily consent to the collection and processing of data as described there.",
      ],
      buttonLabel: "I agree and begin",
    };
}

export function isConsentComplete(values: boolean[]): boolean {
  return values.length === 5 && values.every(Boolean);
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
        <div class="layout-task-consent-document" tabindex="0" aria-label="${chinese ? "完整知情同意和数据保护声明" : "Complete informed consent and data protection statement"}">
          ${copy.fullDocumentHtml}
        </div>
        <div class="layout-task-consent-copy">
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
