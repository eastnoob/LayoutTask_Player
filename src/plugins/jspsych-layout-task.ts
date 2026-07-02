import { ParameterType } from "jspsych";
import type { JsPsych, JsPsychPlugin, TrialType } from "jspsych";
import { ConfigLoader } from "../core/config-loader";
import { createLayoutTaskPlayer } from "../core/layout-task-player";
import type { CompletionPayload } from "../core/completion-controller";
import type { RuntimeTaskConfig } from "../types/runtime";

// Public jsPsych trial parameters.
// 这里是研究者在 timeline 里会直接看到和配置的入口，所以命名保持 explicit。
export interface LayoutTaskPluginParams {
  // Pre-resolved config for programmatic experiments; 如果传入它，就跳过 manifest loading。
  config?: RuntimeTaskConfig | null;
  // Static config root, usually public/layout-task/ after Vite serves public assets.
  baseUrl?: string;
  manifestPath?: string;
  // taskId wins over qid; ConfigLoader keeps the same fallback rule as standalone page.
  taskId?: string;
  qid?: string;
  // autoFinishTrial=true matches the usual jsPsych flow: 完成任务后自动进入下一 trial。
  autoFinishTrial?: boolean;
  // These flags only control jsPsych.data shape, not the internal result generation.
  writeEncodedToData?: boolean;
  writeResultToData?: boolean;
  writeHeaderToData?: boolean;
  title?: string;
  confidence?: {
    required: boolean;
    scale: number[];
    labels: Record<string, string>;
  };
  tutorialMode?: boolean;
}

// jsPsych reads this static metadata to validate and hydrate trial parameters.
// Defaults live here so standalone defaults and plugin defaults do not drift apart silently.
const info = {
  name: "layout-task",
  parameters: {
    config: {
      type: ParameterType.OBJECT,
      default: null,
    },
    baseUrl: {
      type: ParameterType.STRING,
      default: "/layout-task/",
    },
    manifestPath: {
      type: ParameterType.STRING,
      default: "manifest.json",
    },
    taskId: {
      type: ParameterType.STRING,
      default: null,
    },
    qid: {
      type: ParameterType.STRING,
      default: null,
    },
    autoFinishTrial: {
      type: ParameterType.BOOL,
      default: true,
    },
    writeEncodedToData: {
      type: ParameterType.BOOL,
      default: true,
    },
    writeResultToData: {
      type: ParameterType.BOOL,
      default: true,
    },
    writeHeaderToData: {
      type: ParameterType.BOOL,
      default: true,
    },
    title: {
      type: ParameterType.STRING,
      default: "Layout Task",
    },
    confidence: {
      type: ParameterType.OBJECT,
      default: null,
    },
    tutorialMode: {
      type: ParameterType.BOOL,
      default: false,
    },
  },
};

type Info = typeof info;
type LayoutTaskTrial = TrialType<Info>;

export interface LayoutTaskTrialData {
  qid?: string;
  task_id?: string;
  session?: string;
  hash8?: string;
  encoding?: string;
  encoded?: string;
  result?: CompletionPayload["result"];
  error?: boolean;
  message?: string;
}

// jsPsych adapter only owns the trial shell.
// 真正的空间任务行为仍在 createLayoutTaskPlayer()，plugin 只负责接 jsPsych 生命周期。
export class LayoutTaskPlugin implements JsPsychPlugin<Info> {
  static info = info;

  constructor(private readonly jsPsych: JsPsych) {}

  async trial(displayElement: HTMLElement, trial: LayoutTaskTrial): Promise<void> {
    // jsPsych gives us one displayElement per trial; clear it before async loading begins.
    // 这样失败 UI 和正常播放器不会叠在上一个 trial 的 DOM 上。
    displayElement.replaceChildren();

    try {
      // Reuse the same config loading rule as standalone mode:
      // direct config first, then manifest + task selection. 规则统一，少一个隐藏分支。
      const config = await loadPluginConfig(trial);
      let finished = false;

      // The core player owns rendering, interaction, completion, encoding and clipboard.
      // plugin 只监听 onComplete，把结果转换成 jsPsych trial data。
      const player = createLayoutTaskPlayer({
        root: displayElement,
        config,
        confidence: trial.confidence ?? undefined,
        tutorialMode: trial.tutorialMode,
        onComplete: (payload) => {
          if (finished) {
            return;
          }

          const trialData = buildTrialData(config, payload, trial);

          // write* flags decide the payload shape.
          // autoFinishTrial only decides whether jsPsych advances immediately,
          // useful when a researcher wants to inspect/copy data before calling finishTrial manually.
          if (trial.autoFinishTrial) {
            finished = true;
            this.jsPsych.finishTrial(trialData);
          }
        },
      });

      player.start();
    } catch (error) {
      // Fail loudly inside jsPsych: 显示错误，同时把 error trial 写入数据，方便排查配置问题。
      const message = error instanceof Error ? error.message : "Unknown Layout Task plugin error";
      renderPluginError(displayElement, message, trial.title ?? "Layout Task");
      this.jsPsych.finishTrial({
        error: true,
        message,
      });
    }
  }
}

export default LayoutTaskPlugin;

async function loadPluginConfig(trial: LayoutTaskTrial): Promise<RuntimeTaskConfig> {
  // Researcher-provided config is already resolved; 不再二次校验/加载，避免改写调用方输入。
  if (trial.config) {
    return trial.config as RuntimeTaskConfig;
  }

  // Manifest loading path is deliberately delegated to ConfigLoader.
  // plugin 不复制 taskId/qid fallback 逻辑，后面维护只改一个地方。
  const loader = new ConfigLoader({
    baseUrl: trial.baseUrl,
    manifestPath: trial.manifestPath,
  });

  return loader.loadRuntimeConfig({
    taskId: trial.taskId ?? undefined,
    qid: trial.qid ?? undefined,
  });
}

export function buildTrialData(
  config: RuntimeTaskConfig,
  payload: CompletionPayload,
  flags: Pick<LayoutTaskTrial, "writeEncodedToData" | "writeResultToData" | "writeHeaderToData">,
): LayoutTaskTrialData {
  const data: LayoutTaskTrialData = {};

  // Header/meta fields make exported jsPsych CSV easier to scan without decoding the payload.
  // 关闭时仍然不影响 encoded/result 本身。
  if (flags.writeHeaderToData) {
    data.qid = config.qid;
    data.task_id = config.taskId;
    data.session = payload.encoded.sessionId;
    data.hash8 = payload.encoded.hash8;
    data.encoding = payload.encoded.encoding;
  }

  // encoded is the questionnaire-friendly one-line answer.
  // result is the rich object for experiments that keep jsPsych.data locally.
  if (flags.writeEncodedToData) {
    data.encoded = payload.encoded.output;
  }

  if (flags.writeResultToData) {
    data.result = payload.result;
  }

  return data;
}

function renderPluginError(displayElement: HTMLElement, message: string, title: string): void {
  // Keep error UI simple and static-hosting friendly; escape text because config errors may echo paths.
  displayElement.innerHTML = `
    <section class="layout-task-shell">
      <header class="layout-task-header">
        <p class="layout-task-eyebrow">${escapeHtml(title)}</p>
        <h1>Plugin error</h1>
        <p class="layout-task-meta">${escapeHtml(message)}</p>
      </header>
    </section>
  `;
}

function escapeHtml(value: string): string {
  // Tiny local escape helper, enough for diagnostic strings in the plugin error shell.
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
