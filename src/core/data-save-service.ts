import type { RuntimeDataSaveConfig } from "../types/runtime";
import type { CompletionPayload } from "./completion-controller";

export interface DataSaveResult {
  ok: boolean;
  provider: "copy" | "datapipe";
  filename?: string;
  error?: string;
}

export interface DataSaveServiceOptions {
  config: RuntimeDataSaveConfig;
  fetchImpl?: typeof fetch;
}

// Optional browser-side cloud save. 默认 copy-only；Datapipe 只是额外保存，不替代复制兜底。
export class DataSaveService {
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(private readonly options: DataSaveServiceOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  }

  async save(payload: CompletionPayload): Promise<DataSaveResult> {
    if (this.options.config.mode === "copy") {
      return { ok: true, provider: "copy" };
    }

    if (!this.fetchImpl) {
      return {
        ok: false,
        provider: "datapipe",
        error: "fetch is unavailable",
      };
    }

    const filename = createDataPipeFilename(this.options.config.filename_prefix, this.options.config.payload_format, payload);
    const data = createDataPipeData(this.options.config, payload);

    try {
      const response = await this.fetchImpl(this.options.config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experimentID: this.options.config.experiment_id,
          filename,
          data,
        }),
      });

      if (!response.ok) {
        const errorDetail = await readDataPipeError(response);
        return {
          ok: false,
          provider: "datapipe",
          filename,
          error: `DataPipe save failed: ${response.status} ${response.statusText}${errorDetail}`,
        };
      }

      return { ok: true, provider: "datapipe", filename };
    } catch (error) {
      return {
        ok: false,
        provider: "datapipe",
        filename,
        error: error instanceof Error ? error.message : "Unknown DataPipe save error",
      };
    }
  }
}

function createDataPipeFilename(
  prefix: string,
  payloadFormat: Extract<RuntimeDataSaveConfig, { mode: "datapipe" }>["payload_format"],
  payload: CompletionPayload,
): string {
  const safePrefix = sanitizeFilenamePart(prefix);
  const parts = [
    safePrefix,
    sanitizeFilenamePart(payload.result.task_id),
    sanitizeFilenamePart(payload.result.qid),
    sanitizeFilenamePart(payload.result.session),
  ];

  const extensionByFormat = {
    "json-envelope": "json",
    "encoded-only": "txt",
    "csv-row": "csv",
  } satisfies Record<typeof payloadFormat, string>;

  return `${parts.join("_")}.${extensionByFormat[payloadFormat]}`;
}

function createDataPipeData(config: Extract<RuntimeDataSaveConfig, { mode: "datapipe" }>, payload: CompletionPayload): string {
  // DataPipe 只接收 data string；这里集中决定文件内容格式，方便不同研究项目按配置切换。
  if (config.payload_format === "encoded-only") {
    return payload.encoded.output;
  }

  if (config.payload_format === "csv-row") {
    return createCsvRow(payload);
  }

  // Store a compact envelope so OSF files remain self-describing.
  // encoded 适合直接回填问卷；result 适合后期 JSON 检查，两者都可配置开关。
  return JSON.stringify({
    schema: "layouttask.datapipe.payload.v1",
    saved_at: new Date().toISOString(),
    qid: payload.result.qid,
    task_id: payload.result.task_id,
    session: payload.result.session,
    hash8: payload.encoded.hash8,
    encoding: payload.encoded.encoding,
    encoded: config.save_encoded ? payload.encoded.output : undefined,
    result: config.save_result ? payload.result : undefined,
  });
}

function createCsvRow(payload: CompletionPayload): string {
  const header = ["qid", "task_id", "session", "hash8", "encoding", "encoded"];
  const row = [
    payload.result.qid,
    payload.result.task_id,
    payload.result.session,
    payload.encoded.hash8,
    payload.encoded.encoding,
    payload.encoded.output,
  ];

  return `${header.join(",")}\n${row.map(formatCsvCell).join(",")}\n`;
}

function formatCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "layout-task";
}

async function readDataPipeError(response: Response): Promise<string> {
  // DataPipe returns JSON errors with code/message. 读出来显示在页面上，方便研究者现场排查。
  try {
    const body = await response.clone().json() as { code?: string; message?: string; error?: string };
    const code = body.code ?? body.error;
    const message = body.message;
    if (code || message) {
      return ` (${[code, message].filter(Boolean).join(": ")})`;
    }
  } catch {
    // Some proxies return plain text/HTML; fall through to text best-effort.
  }

  try {
    const text = await response.text();
    return text ? ` (${text.slice(0, 240)})` : "";
  } catch {
    return "";
  }
}
