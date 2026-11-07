import type { RuntimeDataSaveConfig, RuntimeReceiverSaveConfig } from "../types/runtime";
import type { CompletionPayload } from "./completion-controller";
import type { UploadState } from "./upload-state";
import type { LocalBackupStore, ReceiverSubmissionBackup } from "./local-backup-store";
import type { ConsentRecord, ParticipantProfile } from "./experiment-consent";
import type { ExperimentCsvFile } from "./experiment-data";

const metadataUploads = new WeakMap<LocalBackupStore, Promise<DataSaveResult>>();
const metadataFiles = new WeakMap<LocalBackupStore, ExperimentCsvFile>();
const IDENTITY_FIELDS = ["experiment_id", "participant_id", "session_id", "assignment_id", "participant_number", "sequence_id", "schedule_version", "assignment_mode", "requested_sequence_id", "replacement_attempt", "rotation_index"] as const;
const TRIAL_FIELDS = ["trial_session_id", "trial_type", "trial_index", "task_id", "qid", "presentation_id", "hash8", "encoding", "encoded"] as const;

interface SessionMetadataInput {
  prolificId: string;
  participantProfile: ParticipantProfile;
  consent: ConsentRecord;
}

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

  saveSessionMetadata(input?: SessionMetadataInput): Promise<DataSaveResult> {
    const config = this.options.config;
    const backup = this.options.localBackup;
    if (config.mode !== "receiver" || !config.assignment || !config.session_id) {
      return Promise.resolve({ ok: true, provider: config.mode });
    }
    if (!backup) {
      return Promise.resolve({ ok: false, provider: "receiver", error: "Local metadata backup is unavailable" });
    }
    const active = metadataUploads.get(backup);
    if (active) return active;
    const filename = `layouttask_session_metadata_${config.session_id}.json`;
    const identity = { experiment_id: config.experiment_id, participant_id: config.participant_id, session_id: config.session_id, ...config.assignment };
    const data = input && JSON.stringify({
      schema: "layouttask.session-metadata.v1", ...identity,
      prolific_id: input.prolificId, participant_profile: input.participantProfile, consent: input.consent,
    });
    if (data && !metadataFiles.has(backup)) metadataFiles.set(backup, { filename, contentType: "application/json", data });
    const pending = (async (): Promise<DataSaveResult> => {
      try {
        let submission = await backup.getReceiverSubmission(filename);
        if (submission?.acknowledged) return { ok: true, provider: "receiver", filename };
        if (!submission) {
          const existing = (await backup.listFiles()).find((file) => file.filename === filename);
          const file = existing ?? metadataFiles.get(backup);
          if (!file) return { ok: true, provider: "receiver" };
          await backup.saveFile(file);
          const content = JSON.parse(file.data) as Record<string, unknown>;
          submission = {
            filename, acknowledged: false,
            body: JSON.stringify({ schema: "layouttask.receiver.submission.v2", submission_kind: "metadata", ...Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, content[field]])), files: [{ filename, content_type: file.contentType, data: file.data }] }),
          };
          await backup.saveReceiverSubmission(submission);
        }
        return await this.uploadReceiverSubmission(submission);
      } catch (error) {
        return { ok: false, provider: "receiver", filename, error: error instanceof Error ? error.message : String(error) };
      }
    })();
    metadataUploads.set(backup, pending);
    void pending.then(() => metadataUploads.delete(backup));
    return pending;
  }

  async retryReceiverSubmissions(): Promise<{ metadataPending: boolean; failed?: DataSaveResult }> {
    const metadata = await this.saveSessionMetadata();
    const metadataPending = !metadata.ok;
    const config = this.options.config;
    const backup = this.options.localBackup;
    if (config.mode !== "receiver" || !backup) return { metadataPending };
    try {
      for (const file of await backup.listFiles()) {
        let submission = await backup.getReceiverSubmission(file.filename);
        if (submission?.acknowledged) continue;
        if (!submission) {
          const request = createTrialReplayRequest(file, config);
          if (!request) continue;
          submission = { filename: file.filename, body: JSON.stringify(request), acknowledged: false };
          await backup.saveReceiverSubmission(submission);
        }
        if (JSON.parse(submission.body).submission_kind === "metadata") continue;
        const result = await this.uploadReceiverSubmission(submission);
        if (!result.ok) return { metadataPending, failed: result };
      }
      return { metadataPending };
    } catch (error) {
      return { metadataPending, failed: { ok: false, provider: "receiver", filename: "local backup", error: error instanceof Error ? error.message : String(error) } };
    }
  }

  async save(payload: CompletionPayload): Promise<DataSaveResult> {
    const filenamePrefix = this.options.config.mode === "copy" ? "layout-task" : this.options.config.filename_prefix;
    const filename = createDataPipeFilename(
      filenamePrefix,
      this.options.config.mode === "copy" ? "json-envelope" : this.options.config.payload_format,
      payload,
    );

    if (this.options.config.mode === "receiver" && this.options.config.assignment) {
      if (!this.options.config.session_id) {
        return { ok: false, provider: "receiver", filename, error: "Experiment session_id is required for assigned receiver saves" };
      }
      const expected = this.options.config.expected_presentation;
      const actual = payload.result.presentation;
      if ((expected || actual) && (!expected || !actual
        || actual.presentationId !== expected.presentationId
        || actual.trialIndex !== expected.trialIndex
        || actual.taskId !== expected.taskId
        || payload.result.task_id !== expected.taskId)) {
        return { ok: false, provider: "receiver", filename, error: "Trial presentation does not match the assigned sequence position" };
      }
    }

    const trialIdentity = this.options.config.mode === "receiver" && this.options.config.assignment
      ? createReceiverTrialIdentity(this.options.config, payload)
      : undefined;

    if (this.options.config.mode === "receiver") void this.saveSessionMetadata();

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

    const data = createDataPipeData(this.options.config, payload, trialIdentity);
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
          schema: trialIdentity ? "layouttask.receiver.submission.v2" as const : "layouttask.receiver.submission.v1" as const,
          ...(trialIdentity
            ? {
                submission_kind: "trial" as const,
                ...trialIdentity,
                hash8: payload.encoded.hash8,
                encoding: payload.encoded.encoding,
                encoded: payload.encoded.output,
              }
            : {
                experiment_id: this.options.config.experiment_id,
                participant_id: this.options.config.participant_id,
                session_id: payload.result.session,
              }),
          files: [{ filename, content_type: "application/json", data }],
        }
      : {
          experimentID: this.options.config.experiment_id,
          filename,
          data,
        };

    if (this.options.config.mode === "receiver") {
      const submission = { filename, body: JSON.stringify(request), acknowledged: false };
      try {
        await this.options.localBackup?.saveReceiverSubmission(submission);
        const result = await this.uploadReceiverSubmission(submission);
        return this.withAttempt(result, filename, result.ok ? "success" : "failed", result.error);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return this.withAttempt({ ok: false, provider: "receiver", filename, error: message }, filename, "failed", message);
      }
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
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

  private async uploadReceiverSubmission(submission: ReceiverSubmissionBackup): Promise<DataSaveResult> {
    const filename = submission.filename;
    try {
      if (!this.fetchImpl) throw new Error("fetch is unavailable");
      const config = this.options.config as RuntimeReceiverSaveConfig;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.submit_token) headers["X-Submit-Token"] = config.submit_token;
      const response = await fetchWithTimeout(this.fetchImpl, config.endpoint, {
        method: "POST", headers, body: submission.body,
      }, this.options.timeoutMs ?? 15_000);
      if (!response.ok) throw new Error(`Data save failed: ${response.status} ${response.statusText}${await readDataPipeError(response)}`);
      await this.options.localBackup?.saveReceiverSubmission({ ...submission, acknowledged: true });
      return { ok: true, provider: "receiver", filename };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, provider: "receiver", filename, error: message };
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

function createTrialReplayRequest(file: ExperimentCsvFile, config: RuntimeReceiverSaveConfig) {
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(file.data);
  } catch {
    return undefined;
  }
  if (!envelope || (envelope.schema !== "layouttask.backup.v1" && envelope.schema !== "layouttask.backup.v2")) return undefined;
  const v2 = envelope.schema === "layouttask.backup.v2";
  return {
    schema: v2 ? "layouttask.receiver.submission.v2" : "layouttask.receiver.submission.v1",
    ...(v2 ? {
      submission_kind: "trial",
      ...Object.fromEntries([...IDENTITY_FIELDS, ...TRIAL_FIELDS].filter((field) => field in envelope).map((field) => [field, envelope[field]])),
    } : { experiment_id: config.experiment_id, participant_id: config.participant_id, session_id: envelope.session }),
    files: [{ filename: file.filename, content_type: file.contentType, data: file.data }],
  };
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
  trialIdentity?: ReturnType<typeof createReceiverTrialIdentity>,
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
    schema: trialIdentity ? "layouttask.backup.v2" : "layouttask.backup.v1",
    saved_at: new Date().toISOString(),
    ...trialIdentity,
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

function createReceiverTrialIdentity(config: RuntimeReceiverSaveConfig, payload: CompletionPayload) {
  const presentation = payload.result.presentation;
  return {
    experiment_id: config.experiment_id,
    participant_id: config.participant_id,
    session_id: config.session_id,
    trial_session_id: payload.result.session,
    ...config.assignment,
    trial_type: presentation ? "formal" as const : "tutorial" as const,
    trial_index: presentation?.trialIndex,
    task_id: payload.result.task_id,
    qid: payload.result.qid,
    presentation_id: presentation?.presentationId,
  };
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
