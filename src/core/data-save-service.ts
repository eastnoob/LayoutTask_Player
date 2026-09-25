import type { RuntimeDataSaveConfig } from "../types/runtime";
import type { CompletionPayload } from "./completion-controller";
import type { UploadState } from "./upload-state";
import type { LocalBackupStore } from "./local-backup-store";

export interface DataSaveResult {
  ok: boolean;
  provider: "copy" | "datapipe" | "receiver";
  filename?: string;
  error?: string;
  backupId?: string;
  attempts?: number;
}

export interface DataSaveServiceOptions {
  config: RuntimeDataSaveConfig;
  fetchImpl?: typeof fetch;
  uploadState?: UploadState;
  timeoutMs?: number;
  localBackup?: LocalBackupStore;
}

// Optional browser-side cloud save. 默认 copy-only；Datapipe 只是额外保存，不替代复制兜底。
export class DataSaveService {
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(private readonly options: DataSaveServiceOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  }

  async save(payload: CompletionPayload): Promise<DataSaveResult> {
    const filenamePrefix = this.options.config.mode === "copy" ? "layout-task" : this.options.config.filename_prefix;
    const filename = createDataPipeFilename(
      filenamePrefix,
      this.options.config.mode === "copy" ? "json-envelope" : this.options.config.payload_format,
      payload,
    );

    if (this.options.config.mode === "copy") {
      try {
        await this.options.localBackup?.saveFile({
          filename,
          contentType: "application/json",
          data: createDataPipeData({
            mode: "datapipe",
            experiment_id: "local-copy",
            endpoint: "",
            filename_prefix: filenamePrefix,
            payload_format: "json-envelope",
            save_encoded: true,
            save_result: true,
          }, payload),
        });
      } catch (error) {
        return { ok: false, provider: "copy", filename, error: error instanceof Error ? error.message : String(error) };
      }
      return { ok: true, provider: "copy" };
    }

    const data = createDataPipeData(this.options.config, payload);
    try {
      await this.options.localBackup?.saveFile({
        filename,
        contentType: this.options.config.payload_format === "encoded-only" ? "text/plain" : "application/json",
        data,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.withAttempt({ ok: false, provider: this.options.config.mode, filename, error: message }, filename, "failed", message);
    }

    if (!this.fetchImpl) {
      return this.withAttempt({
        ok: false,
        provider: this.options.config.mode,
        error: "fetch is unavailable",
        filename,
      }, filename, "failed", "fetch is unavailable");
    }

    const request = this.options.config.mode === "receiver"
      ? {
          schema: "layouttask.receiver.submission.v1" as const,
          experiment_id: this.options.config.experiment_id,
          participant_id: this.options.config.participant_id,
          session_id: payload.result.session,
          files: [{ filename, content_type: "application/json", data }],
        }
      : {
          experimentID: this.options.config.experiment_id,
          filename,
          data,
        };

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.options.config.mode === "receiver" && this.options.config.submit_token) {
        headers["X-Submit-Token"] = this.options.config.submit_token;
      }
      const response = await fetchWithTimeout(
        this.fetchImpl,
        this.options.config.endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify(request),
        },
        this.options.timeoutMs ?? 15_000,
      );

      if (!response.ok) {
        const errorDetail = await readDataPipeError(response);
        return this.withAttempt({
          ok: false,
          provider: this.options.config.mode,
          filename,
          error: `Data save failed: ${response.status} ${response.statusText}${errorDetail}`,
        }, filename, "failed", `Data save failed: ${response.status} ${response.statusText}${errorDetail}`);
      }

      return this.withAttempt({ ok: true, provider: this.options.config.mode, filename }, filename, "success");
    } catch (error) {
      return this.withAttempt({
        ok: false,
        provider: this.options.config.mode,
        filename,
        error: error instanceof Error ? error.message : "Unknown DataPipe save error",
      }, filename, "failed", error instanceof Error ? error.message : "Unknown DataPipe save error");
    }
  }

  private withAttempt(
    result: DataSaveResult,
    filename: string,
    status: "success" | "failed" | "timeout",
    error?: string,
  ): DataSaveResult {
    if (!this.options.uploadState) {
      return result;
    }
    const attempt = this.options.uploadState.recordAttempt(filename, status, error);
    return { ...result, backupId: attempt.backupId, attempts: attempt.attempts };
  }
}

function createDataPipeFilename(
  prefix: string,
  payloadFormat: Extract<RuntimeDataSaveConfig, { mode: "datapipe" | "receiver" }>["payload_format"],
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

function createDataPipeData(
  config: Extract<RuntimeDataSaveConfig, { mode: "datapipe" | "receiver" }>,
  payload: CompletionPayload,
): string {
  // DataPipe 只接收 data string；这里集中决定文件内容格式，方便不同研究项目按配置切换。
  if (config.payload_format === "encoded-only") {
    return payload.encoded.output;
  }

  if (config.payload_format === "csv-row") {
    return createCsvRow(payload);
  }

  // Store the compressed trial backup in a self-describing envelope.
  // lz-uri is compression/transport encoding, not encryption.
  return JSON.stringify({
    schema: "layouttask.backup.v1",
    saved_at: new Date().toISOString(),
    qid: payload.result.qid,
    task_id: payload.result.task_id,
    session: payload.result.session,
    hash8: payload.encoded.hash8,
    encoding: payload.encoded.encoding,
    encoded: config.save_encoded ? payload.encoded.output : undefined,
    pause: payload.result.pause,
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

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = typeof AbortController === "undefined" ? undefined : new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<Response>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller?.abort();
      reject(new Error(`Data save timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      fetchImpl(input, controller ? { ...init, signal: controller.signal } : init),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}
