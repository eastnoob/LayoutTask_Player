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
    <p>Dear Participant,</p>
    <p>thank you for your participation in the study.</p>
    <h3>Researcher(s)</h3>
    <p>Fengxu Tian <a href="mailto:ftian@uni-muenster.de">&lt;ftian@uni-muenster.de&gt;</a> (SPARC Lab) Jun.-Prof. Dr. Jakub Krukar <a href="mailto:krukar@uni-muenster.de">&lt;krukar@uni-muenster.de&gt;</a> (SPARC Lab)</p>
    <h3>Purpose of the study</h3>
    <p>This study aims to understand how people perceive spatial layout based on a single indoor image. You will view images of indoor scenes and, based on your interpretation, move yellow furniture on a floor plan to the approximate locations and orientations where you perceive them to be in the images. Your responses will help us better understand how people extract spatial information from images.</p>
    <h3>Procedure</h3>
    <p>If you agree to participate in this study, you will complete the following steps: 1. Read the study instructions and confirm your informed consent. 2. For each task, you will see an indoor scene image at the top of the page and a floor plan below it. Your task is to adjust the furniture layout on the floor plan below to match the indoor perspective image above as closely as possible. 3. Some furniture items on the floor plan will be highlighted in yellow. Using the pop-up move and rotate tools, adjust only these highlighted items so that their positions and orientations match what you see in the image as closely as possible. 4. For each adjusted furniture item, rate how certain you are about your placement and orientation judgment. Please note: Yellow highlighting appears only on the floor plan. In the indoor scene image, the furniture items retain their original colors and may look similar to other items. Your reconstruction results, response times, certainty ratings, and task-related actions will be recorded. You may withdraw from the study at any time without giving a reason. All data will be stored anonymously or in a de-identified format and used solely for scientific research purposes.</p>
    <h3>Duration</h3>
    <p>This study is expected to take approximately <strong>20 minutes</strong>, though the actual duration may vary slightly depending on individual response speed, typically no more than around 30 minutes.</p>
    <h3>Potential risks</h3>
    <p>This study is classified as a low-risk online computer-based experiment. Participants are required to view images of indoor scenes and perform spatial judgment tasks; prolonged screen viewing or sustained attention may result in mild eye strain, cognitive fatigue, or brief discomfort. The study involves no invasive physical procedures, physical exertion, virtual reality equipment, emotionally intense content, or rapidly flashing stimuli. The experimental materials consist of images of ordinary indoor spaces and furniture arrangements featuring soft colors and brightness levels, containing no content likely to trigger strong emotional reactions. The experiment is conducted entirely on the participant's personal computer, and participants may close the webpage at any time to immediately cease participation. During the experiment, there is a single pause opportunity lasting up to 15 minutes, after which it will automatically resume.</p>
    <h3>Privacy</h3>
    <p>Original data obtained from this study will be anonymised and only processed to draw scientific conclusions about groups, not about individual participants. Anonymised data might be published in academic journals, presentations, open science data repositories, or other media, but not in a way that would allow individual identification. One week after the completion of the study it might no longer be possible to retract your data from such aggregated analyses. You can contact the researcher in order to access your data or request its removal.</p>
    <p>Once processed, anonymised data from this experiment will be made available under the following link: <a href="https://datastore.uni-muenster.de/uploads/d1d07-a0b07">https://datastore.uni-muenster.de/uploads/d1d07-a0b07</a></p>
    <h3>Benefits and compensation</h3>
    <p>The compensation for this study is a <strong>£4 base payment plus task-performance bonuses</strong>. Each correctly reconstructed position or rotation earns an additional <strong>£0.04</strong>. Based on our testing, the expected total payment under normal performance is approximately <strong>€7 (about £6)</strong>. The actual amount may vary depending on your performance. Payment is administered directly through the third-party recruitment platform.</p>
    <p>You are free to stop, quit the study and retract your data at any time during the study with no further consequences. If you have any questions, please ask them now.</p>
    <p>For further questions, complains or issues, please contact the institute's Ethics-Committee: <a href="mailto:ifgi-ethics@listserv.uni-muenster.de">&lt;ifgi-ethics@listserv.uni-muenster.de&gt;</a>.</p>
    <h2>Data protection policy in accordance with Art. 13 GDPR</h2>
    <p><strong>Project/reason:</strong> Spatial Perception of Furniture Position and Orientation from a Single Indoor Photograph<br /><strong>Revision:</strong> 1</p>
    <h3>1. Name and address of the responsible controller</h3>
    <p>The responsible controller as defined in the EU General Data Protection Regulation (GDPR) and other national data protection laws of the EU member states as well as other data protection-related provisions is:</p>
    <p>Universität Münster / University of Münster represented by its Rector Schlossplatz 2, 48149 Münster, Germany<br />tel.: + 49 251 83-0<br />email: <a href="mailto:mailbox@uni-muenster.de">mailbox@uni-muenster.de</a></p>
    <p>If you have any questions about the project, please contact the responsible staff member:<br />Fengxu Tian <a href="mailto:ftian@uni-muenster.de">&lt;ftian@uni-muenster.de&gt;</a> (SPARC Lab) Jun.-Prof. Dr. Jakub Krukar <a href="mailto:krukar@uni-muenster.de">&lt;krukar@uni-muenster.de&gt;</a> (SPARC Lab)</p>
    <h3>2. Contact data of the Data Protection Officer</h3>
    <p>You can contact the Data Protection Officer at:<br />Data Protection Office<br />Schlossplatz 2, 48149 Münster<br />tel.: + 49 251 83-22446<br />email: <a href="mailto:datenschutz@uni-muenster.de">datenschutz@uni-muenster.de</a></p>
    <h3>3. Data processing in connection with Spatial Perception of Furniture Position and Orientation from a Single Indoor Photograph</h3>
    <p>This study aims to understand how people perceive spatial layout based on a single indoor image. You will view images of indoor scenes and, based on your interpretation, move yellow furniture on a floor plan to the approximate locations and orientations where you perceive them to be in the images. Your responses will help us better understand how people extract spatial information from images.</p>
    <h4>a) Scope of data processing</h4>
    <p>The following personal data is processed in connection with Spatial Perception of Furniture Position and Orientation from a Single Indoor Photograph:</p>
    <p>(1) first and last name</p>
    <p>(2) date of birth</p>
    <p>(3) email address and phone number</p>
    <h4>b) Purposes of data processing</h4>
    <p>The personal data listed above is processed for the purpose of carrying out the project Spatial Perception of Furniture Position and Orientation from a Single Indoor Photograph. The personal data listed above will be used to draw scientific conclusions about groups, not about individual participants. Anonymised data might be published in academic journals, presentations, open science data repositories, or other media, but not in a way that would allow individual identification. One week after the completion of the study it might no longer be possible to retract your data from such aggregated analyses.</p>
    <h4>c) Legal basis for processing personal data</h4>
    <p>Your consent serves as the legal basis for processing your personal data listed above by the University of Münster, as stipulated by Art. 6 (1, 1a) GDPR and, if applicable, Art. 9 (2a) GDPR.</p>
    <h4>d) Further recipients of your personal data</h4>
    <p>Your personal data will neither be shared with other recipients within the University of Münster nor with recipients outside the University.</p>
    <h4>e) Duration of storage of personal data</h4>
    <p>The personal data listed above is stored for as long as necessary for carrying out the project Spatial Perception of Furniture Position and Orientation from a Single Indoor Photograph but shall not exceed 12 years. Upon withdrawing your consent, we shall delete your personal data.</p>
    <h3>4. Your rights as a data subject</h3>
    <p>You have the right to information about your personal data processed by the University of Münster (Art. 15 GDPR), the right to rectification (Art. 16 GDPR), erasure (Art. 17 GDPR), restriction of processing (Art. 18 GDPR) and the right to withdraw prior consent to such processing (Art. 7 (3) GDPR). You may withdraw your consent in writing or by email from the contact persons listed under nos. 1 and 2 (see above) of this data protection statement. You also have the right to lodge a complaint with the supervisory authority. The responsible supervisory authority is the Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen, Postfach 20 04 44, 40102 Düsseldorf, tel: +49 211 / 38424-0, email: <a href="mailto:poststelle@ldi.nrw.de">poststelle@ldi.nrw.de</a></p>
    <h3>Declaration of consent</h3>
    <p><strong>Subject/reason:</strong> Spatial Perception of Furniture Position and Orientation from a Single Indoor Photograph</p>
    <p><strong>Full name:</strong> _____________________________________________</p>
    <p><strong>Date of birth:</strong> _____________________________________________</p>
    <p><strong>(if applicable) Name of parent or legal guardian:</strong> _____________________________________________</p>
    <p><strong>Email address:</strong> _____________________________________________</p>
    <p>With your consent, you hereby grant permission to the University of Münster to collect and process the personal data listed above under (3a) for the purposes indicated in (3b).</p>
    <p>You have the right to withdraw your consent from the responsible party at any time. The legality of all data processing from the time of consent until withdrawal of consent remains unaffected.</p>
    <p>With your signature, you indicate confirmation of the following:</p>
    <p>“I have read the data protection statement for the project Spatial Perception of Furniture Position and Orientation from a Single Indoor Photograph. I hereby voluntarily consent to having my personal data collected and processed. I have been informed of the scope and purpose of data collection and processing, as well as the right to withdraw consent. I have received a copy of the data protection policy and the declaration of consent.”</p>
    <p>(if applicable) I confirm that I hold sole custody of the underage person named above – or in the case of joint custody – that I am permitted to grant consent on behalf of the other legal guardian or custodial parent.</p>
    <p><strong>City, Date:</strong> _____________________________________________</p>
    <p><strong>Signature:</strong> _____________________________________________<br />(consenting party)</p>
    <p><strong>(if applicable) Signature of the parent or legal guardian:</strong> _____________________________________________</p>
  </article>
`;

const CHINESE_DOCUMENT_HTML = `
  <article class="layout-task-consent-document-content">
    <h2>知情同意书</h2>
    <p><strong>研究标题：</strong>根据单张室内照片感知家具的位置与朝向</p>
    <p><strong>修订版本：</strong>1</p>
    <p>尊敬的参与者：</p>
    <p>感谢您参加本研究。</p>
    <h3>研究者</h3>
    <p>Fengxu Tian <a href="mailto:ftian@uni-muenster.de">&lt;ftian@uni-muenster.de&gt;</a>（SPARC 实验室） Jun.-Prof. Dr. Jakub Krukar <a href="mailto:krukar@uni-muenster.de">&lt;krukar@uni-muenster.de&gt;</a>（SPARC 实验室）</p>
    <h3>研究目的</h3>
    <p>本研究旨在了解人们如何根据单张室内图像感知空间布局。您将查看室内场景图，并根据您的理解，在平面图上把黄色家具移动到您认为与图像中相符的大致位置和朝向。您的回答将帮助我们了解人们如何从图像中提取空间信息。</p>
    <h3>研究流程</h3>
    <p>如果您同意参加本研究，您将完成以下步骤：1. 阅读研究说明并确认知情同意。2. 在每个任务中，您将在页面顶部看到室内场景图，下方看到平面图。您的任务是调整下方平面图上的家具布局，使其尽可能匹配上方的室内透视图。3. 平面图上的部分家具会以黄色突出显示。请使用弹出的移动和旋转工具，只调整这些突出显示的家具，使其位置和朝向尽可能匹配图片中的家具。4. 对于每件调整过的家具，请评价您对其位置和朝向判断的确定程度。请注意：黄色标记只出现在平面图中；室内场景图中的家具保留原有颜色，可能与其他家具相似。系统会记录您的还原结果、反应时间、确定程度和任务相关操作。您可以随时退出研究，无需说明理由。所有数据都会以匿名或去标识化形式保存，仅用于科学研究。</p>
    <h3>研究时长</h3>
    <p>本研究预计需要约 <strong>20 分钟</strong>，但实际时长可能会因个人回答速度略有不同，通常不超过约 30 分钟。</p>
    <h3>潜在风险</h3>
    <p>本研究属于低风险的在线计算机实验。参与者需要查看室内场景图片并完成空间判断任务；长时间看屏幕或持续集中注意力可能造成轻微眼疲劳、认知疲劳或短暂不适。研究不涉及侵入性操作、体力活动、虚拟现实设备、强烈情绪内容或快速闪烁刺激。实验材料由普通室内空间和家具布置图片组成，使用柔和的颜色和亮度，不包含可能引发强烈情绪反应的内容。实验完全在参与者自己的电脑上进行，参与者可以随时关闭网页，立即停止参加。实验期间有一次最长 15 分钟的暂停机会，达到时限后会自动恢复。</p>
    <h3>隐私</h3>
    <p>本研究获得的原始数据将被匿名化，并且只用于得出关于群体而非个人参与者的科学结论。匿名化数据可能会发表在学术期刊、报告、开放科学数据存储库或其他媒体中，但不会以能够识别个人身份的方式发表。研究完成一周后，您可能无法再从此类汇总分析中撤回您的数据。您可以联系研究人员，访问您的数据或要求删除数据。</p>
    <p>数据处理完成后，本实验的匿名化数据将通过以下链接提供：<a href="https://datastore.uni-muenster.de/uploads/d1d07-a0b07">https://datastore.uni-muenster.de/uploads/d1d07-a0b07</a></p>
    <h3>受益与报酬</h3>
    <p>本研究报酬为 <strong>£4 基础奖金，另加任务表现奖金</strong>。每个正确的位置或旋转答案均可获得额外 <strong>£0.04</strong>。根据我们的测试，在正常完成实验的情况下，预计总报酬约为 <strong>€7（约 £6）</strong>。实际金额会根据您的作答表现有所浮动。奖金由第三方招募平台直接发放。</p>
    <p>您可以在研究期间随时停止、退出研究并撤回您的数据，不会产生进一步后果。如果您有任何问题，请现在提出。</p>
    <p>如有进一步问题、投诉或其他事项，请联系研究伦理委员会：<a href="mailto:ifgi-ethics@listserv.uni-muenster.de">&lt;ifgi-ethics@listserv.uni-muenster.de&gt;</a>。</p>
    <h2>依据《通用数据保护条例》第 13 条的数据保护声明</h2>
    <p><strong>项目/研究名称：</strong>根据单张室内照片感知家具的位置与朝向<br /><strong>修订版本：</strong>1</p>
    <h3>1. 负责数据控制者的名称和地址</h3>
    <p>根据欧盟《通用数据保护条例》（GDPR）、欧盟成员国其他国家数据保护法律以及其他数据保护相关规定，负责数据控制者为：</p>
    <p>明斯特大学（Universität Münster / University of Münster），由校长代表，Schlossplatz 2, 48149 Münster, Germany<br />电话：+ 49 251 83-0<br />邮箱：<a href="mailto:mailbox@uni-muenster.de">mailbox@uni-muenster.de</a></p>
    <p>如果您对项目有任何问题，请联系负责工作人员：<br />Fengxu Tian <a href="mailto:ftian@uni-muenster.de">&lt;ftian@uni-muenster.de&gt;</a>（SPARC 实验室） Jun.-Prof. Dr. Jakub Krukar <a href="mailto:krukar@uni-muenster.de">&lt;krukar@uni-muenster.de&gt;</a>（SPARC 实验室）</p>
    <h3>2. 数据保护官联系方式</h3>
    <p>您可以通过以下方式联系数据保护官：<br />数据保护办公室<br />Schlossplatz 2, 48149 Münster<br />电话：+ 49 251 83-22446<br />邮箱：<a href="mailto:datenschutz@uni-muenster.de">datenschutz@uni-muenster.de</a></p>
    <h3>3. 与《根据单张室内照片感知家具的位置与朝向》相关的数据处理</h3>
    <p>本研究旨在了解人们如何根据单张室内图像感知空间布局。您将查看室内场景图，并根据您的理解，在平面图上把黄色家具移动到您认为与图像中相符的大致位置和朝向。您的回答将帮助我们了解人们如何从图像中提取空间信息。</p>
    <h4>a）数据处理范围</h4>
    <p>与《根据单张室内照片感知家具的位置与朝向》相关的数据处理中会处理以下个人数据：</p>
    <p>（1）姓名</p>
    <p>（2）出生日期</p>
    <p>（3）电子邮箱和电话号码</p>
    <h4>b）数据处理目的</h4>
    <p>上述个人数据用于开展《根据单张室内照片感知家具的位置与朝向》项目。上述个人数据将用于得出关于群体而非个人参与者的科学结论。匿名化数据可能会发表在学术期刊、报告、开放科学数据存储库或其他媒体中，但不会以能够识别个人身份的方式发表。研究完成一周后，您可能无法再从此类汇总分析中撤回您的数据。</p>
    <h4>c）处理个人数据的法律依据</h4>
    <p>您同意明斯特大学处理上述个人数据，是该处理的法律依据，依据为 GDPR 第 6 条第 1 款第 1a 项，以及（如适用）第 9 条第 2 款第 a 项。</p>
    <h4>d）个人数据的其他接收方</h4>
    <p>您的个人数据不会与明斯特大学内部的其他接收方共享，也不会与大学外部的接收方共享。</p>
    <h4>e）个人数据的保存期限</h4>
    <p>上述个人数据保存至开展《根据单张室内照片感知家具的位置与朝向》项目所需的期限，但最长不超过 12 年。撤回同意后，我们将删除您的个人数据。</p>
    <h3>4. 数据主体的权利</h3>
    <p>您有权了解明斯特大学处理的个人数据（GDPR 第 15 条）、更正权（GDPR 第 16 条）、删除权（GDPR 第 17 条）、限制处理权（GDPR 第 18 条）以及撤回此前同意的权利（GDPR 第 7 条第 3 款）。您可以通过书面或电子邮件向本数据保护声明第 1、2 项所列的联系人撤回同意。您还有权向监管机构投诉。负责的监管机构是北莱茵-威斯特法伦州数据保护与信息自由专员，Postfach 20 04 44, 40102 Düsseldorf；电话：+49 211 / 38424-0；邮箱：<a href="mailto:poststelle@ldi.nrw.de">poststelle@ldi.nrw.de</a>。</p>
    <h3>同意声明</h3>
    <p><strong>主题/事由：</strong>根据单张室内照片感知家具的位置与朝向</p>
    <p><strong>姓名：</strong> _____________________________________________</p>
    <p><strong>出生日期：</strong> _____________________________________________</p>
    <p><strong>（如适用）父母或法定监护人姓名：</strong> _____________________________________________</p>
    <p><strong>电子邮箱：</strong> _____________________________________________</p>
    <p>您同意后，即表示您允许明斯特大学为第 3a 项所述目的处理上面列出的个人数据。</p>
    <p>您有权随时向负责方撤回同意。从同意作出到撤回同意期间进行的数据处理，其合法性不受影响。</p>
    <p>您签名即表示确认以下内容：</p>
    <p>“我已阅读《根据单张室内照片感知家具的位置与朝向》项目的数据保护声明。我自愿同意收集和处理我的个人数据。我已获知数据收集和处理的范围与目的，以及撤回同意的权利。我已收到数据保护政策和同意声明的副本。”</p>
    <p>（如适用）我确认自己对上述未成年人拥有单独监护权；或者在共同监护的情况下，我有权代表另一位法定监护人或监护父母作出同意。</p>
    <p><strong>地点、日期：</strong> _____________________________________________</p>
    <p><strong>签名：</strong> _____________________________________________<br />（同意方）</p>
    <p><strong>（如适用）父母或法定监护人签名：</strong> _____________________________________________</p>
  </article>
`;

export function getConsentPageCopy(locale: "en-US" | "zh-CN"): ConsentPageCopy {
  return locale === "zh-CN"
    ? {
      eyebrow: "知情同意",
      title: "开始实验前请阅读并确认",
      fullDocumentHtml: CHINESE_DOCUMENT_HTML,
      signatureNotice: "勾选全部确认项并点击“我同意并开始”即表示您同意本研究内容；此操作将作为您的电子确认和电子签字，不会生成手写签名。",
      confirmations: [
        "我确认自己自愿参加本研究。",
        "我确认自己有机会提问，并且已获得相应答复。",
        "我确认自己在研究开始前已看到本文件。",
        "我确认自己理解可以随时退出本研究。",
        "我已阅读《根据单张室内照片感知家具的位置与朝向》项目的数据保护声明，并自愿同意收集和处理我的个人数据。我已获知随时撤回同意且无需说明理由的权利。",
      ],
      buttonLabel: "我同意并开始",
    }
    : {
      eyebrow: "Informed consent",
      title: "Read and confirm before you begin",
      fullDocumentHtml: ENGLISH_DOCUMENT_HTML,
      signatureNotice: "Checking all confirmations below and selecting “I agree and begin” means that you consent to this study and serves as your electronic confirmation and electronic signature for this study; it does not create a handwritten signature.",
      confirmations: [
        "I confirm I volunteered to participate in this study.",
        "I confirm I was allowed to ask questions and that I was provided with responses.",
        "I confirm I was presented with this document prior to the beginning of the study.",
        "I confirm and I understood my right to quit the study at any time.",
        "I have read the data protection statement for Spatial Perception of Furniture Position and Orientation from a Single Indoor Photograph and hereby voluntarily consent to having my personal data collected and processed as described in the statement. I have been informed of the right to withdraw my consent at any time without giving reasons.",
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
