import InstructionsPlugin from "@jspsych/plugin-instructions";
import { initJsPsych } from "jspsych";
import {
  createExperimentCsvFiles,
  createExperimentDataPipePayloads,
  type ExperimentTrialType,
  type ExperimentCsvFile,
  type ExperimentTrialResultItem,
} from "./core/experiment-data";
import { getParticipantId } from "./core/participant-session";
import { buildTutorialReferenceBoardPages } from "./core/tutorial-reference-board";
import LayoutTaskPlugin from "./plugins/jspsych-layout-task";
import type { ExperimentConfig, ExperimentDataSaveConfig } from "./types/experiment";
import type { RuntimeDataSaveConfig } from "./types/runtime";
import { UploadState } from "./core/upload-state";
import { createCompleteRecoveryZip } from "./core/zip-recovery";
import type { ReferencePresentation } from "./types/schedule";
import { createIndexedDbLocalBackupStore, type LocalBackupStore } from "./core/local-backup-store";
import { bootstrapExperimentSession } from "./core/experiment-session";
import { createPauseSummary, ExperimentPauseController } from "./core/experiment-pause";
import { createExperimentPauseUi } from "./core/experiment-pause-ui";

type ExperimentTimeline = Array<{ type: any } & Record<string, any>>;

export function buildExperimentTimeline(
  config: ExperimentConfig,
  options: { developerMode?: boolean; participantId?: string; localBackup?: LocalBackupStore; pause?: ExperimentPauseController; practicePause?: ExperimentPauseController } = {},
): ExperimentTimeline {
  const timeline: ExperimentTimeline = [];
  const taskDataSave = toRuntimeTaskDataSave(config.dataSave, options.participantId);

  if (config.tutorial.enabled) {
    const tutorialBaseUrl = config.tutorial.baseUrl ?? `${config.baseUrl}tutorial/`;
    timeline.push({
      type: InstructionsPlugin,
      css_classes: "layout-task-tutorial-intro-trial",
      pages: [
        `<section class="layout-task-shell layout-task-tutorial-intro-shell">
          <header class="layout-task-header layout-task-tutorial-intro-header">
            <p class="layout-task-eyebrow">Tutorial</p>
            <h1>Reconstruct the furniture layout</h1>
            <p class="layout-task-meta">Study the image, then rebuild the furniture arrangement shown there.</p>
          </header>
          <div class="layout-task-tutorial-intro-note">
            <p><strong>Your task is to study each reference image and reconstruct the furniture layout on the floor plan as closely as possible.</strong></p>
            <p>You will practice the same workflow used in the experiment: study the furniture arrangement, open each yellow furniture object, adjust it if needed, choose confidence for its position and rotation, and save it.</p>
          </div>
        </section>`,
      ],
      show_clickable_nav: true,
      allow_backward: false,
      button_label_next: "Start tutorial",
      data: { tutorial_intro: true },
    });
    if (config.tutorial.referenceBoard?.enabled) {
      const board = config.tutorial.referenceBoard;
      const pages = buildTutorialReferenceBoardPages({ baseUrl: tutorialBaseUrl, board });
      const continueLabel = board.continueLabel ?? "Continue";
      for (const [index, page] of pages.entries()) {
        const item = board.items[index];
        timeline.push({
          type: InstructionsPlugin,
          css_classes: "layout-task-reference-board-trial",
          pages: [page],
          show_clickable_nav: true,
          allow_backward: false,
          button_label_next: continueLabel,
          on_load: () => {
            startReferenceBoardContinueCountdown({ label: continueLabel });
          },
          data: {
            tutorial_reference_board: true,
            reference_board_item_id: item.id,
            reference_board_page: index + 1,
            reference_board_total: pages.length,
          },
        });
      }
    }

    if (config.tutorial.taskId) {
      timeline.push({
        type: LayoutTaskPlugin,
        baseUrl: tutorialBaseUrl,
        taskId: config.tutorial.taskId,
        qid: config.tutorial.qid,
        tutorialMode: true,
        developerMode: options.developerMode,
        referenceMode: config.referenceMode,
        confidence: config.confidence,
        autoFinishTrial: true,
        writeEncodedToData: true,
        writeResultToData: true,
        writeHeaderToData: true,
        dataSave: taskDataSave,
        localBackup: options.localBackup,
        pause: options.pause,
        practicePause: options.practicePause,
        data: { tutorial: true },
      });
      timeline.push({
        type: InstructionsPlugin,
        css_classes: "layout-task-tutorial-complete-trial",
        pages: [
          `<section class="layout-task-shell layout-task-tutorial-complete-shell">
            <header class="layout-task-header layout-task-tutorial-complete-header">
              <p class="layout-task-eyebrow">Tutorial</p>
              <h1>Tutorial complete.</h1>
              <p class="layout-task-meta">Study image -> Reconstruct scene -> Rate confidence -> Submit</p>
            </header>
            <div class="layout-task-tutorial-complete-note">
              <ul class="layout-task-tutorial-complete-list">
                <li><strong>This is an experiment, not a test.</strong> Mistakes and uncertainty are normal. If you are very unsure, report very low confidence.</li>
                <li>You have one formal pause opportunity: a one-time 15-minute break.</li>
                <li>You may stop if the experiment causes discomfort, without payment or penalty.</li>
                <li>Please respond truthfully and take every question seriously. Behavior-based attention checks may reject inattentive responses.</li>
                <li>The complete study takes about 15 minutes.</li>
              </ul>
            </div>
          </section>`,
        ],
        show_clickable_nav: true,
        button_label_next: "Start formal experiment",
        data: { tutorial_complete: true },
      });
    }
  }

  const formalPresentations: ReferencePresentation[] = config.schedule?.sequences[0]?.presentations
    ?? config.trials.map((trial, index) => ({
      presentationId: `trial-${index + 1}`,
      taskId: trial.taskId,
      repeatGroupId: null,
      repeatIndex: 0,
      repeatOfTaskId: null,
      trialIndex: index + 1,
      trialTotal: config.trials.length,
    }));

  for (const presentation of formalPresentations) {
    const trial = config.trials.find((candidate) => candidate.taskId === presentation.taskId);
    if (!trial) {
      throw new Error(`Scheduled formal task ${presentation.taskId} is missing from experiment trials`);
    }
    timeline.push({
      type: LayoutTaskPlugin,
      baseUrl: config.baseUrl,
      taskId: trial.taskId,
      qid: trial.qid,
      presentation,
      trialIndex: presentation.trialIndex,
      trialTotal: presentation.trialTotal,
      referenceMode: config.referenceMode,
      developerMode: options.developerMode,
      confidence: config.confidence,
      autoFinishTrial: true,
      writeEncodedToData: true,
      writeResultToData: true,
      writeHeaderToData: true,
      dataSave: taskDataSave,
      localBackup: options.localBackup,
      pause: options.pause,
      practicePause: options.practicePause,
      data: { formal: true, taskId: trial.taskId, qid: trial.qid, presentation },
    });
  }

  return timeline;
}

export function toRuntimeTaskDataSave(
  dataSave: ExperimentDataSaveConfig,
  participantId = "unknown",
): RuntimeDataSaveConfig {
  if (dataSave.mode === "copy") {
    return { mode: "copy" };
  }
  if (dataSave.mode === "receiver") {
    return {
      mode: "receiver",
      experiment_id: dataSave.experimentId,
      endpoint: dataSave.endpoint,
      filename_prefix: dataSave.filenamePrefix,
      participant_id: participantId,
      submit_token: dataSave.submitToken,
      payload_format: "json-envelope",
      save_encoded: true,
      save_result: false,
    };
  }
  return {
    mode: "datapipe",
    experiment_id: dataSave.experimentId,
    endpoint: dataSave.endpoint,
    filename_prefix: dataSave.filenamePrefix,
    payload_format: "json-envelope",
    save_encoded: true,
    save_result: false,
  };
}

export function startReferenceBoardContinueCountdown(input: {
  documentRef?: Document;
  windowRef?: Pick<Window, "setInterval" | "clearInterval">;
  label: string;
  seconds?: number;
}): void {
  const documentRef = input.documentRef ?? document;
  const windowRef = input.windowRef ?? window;
  const seconds = input.seconds ?? 5;
  const nav = documentRef.querySelector<HTMLElement>(".layout-task-reference-board-trial .jspsych-instructions-nav");
  const nextButton = documentRef.querySelector<HTMLButtonElement>(
    ".layout-task-reference-board-trial #jspsych-instructions-next",
  );
  if (!nav || !nextButton) {
    return;
  }

  nav.style.visibility = "visible";
  let remaining = seconds;
  const update = () => {
    nextButton.disabled = remaining > 0;
    nextButton.textContent = remaining > 0 ? `${input.label} (${remaining})` : input.label;
  };

  update();
  if (remaining <= 0) {
    return;
  }

  const timer = windowRef.setInterval(() => {
    remaining -= 1;
    update();
    if (remaining <= 0) {
      windowRef.clearInterval(timer);
    }
  }, 1_000);
}

export function collectFormalTrialResults(rows: Array<Record<string, unknown>>): ExperimentTrialResultItem[] {
  return rows
    .filter((row) => getTrialType(row) === "formal" && (row.encoded || row.result))
    .map((row) => ({
      trialType: "formal",
      taskId: String(row.task_id ?? row.taskId ?? ""),
      qid: row.qid ? String(row.qid) : undefined,
      encoded: row.encoded ? String(row.encoded) : undefined,
      hash8: row.hash8 ? String(row.hash8) : undefined,
      result: row.result,
      presentation: row.presentation as ReferencePresentation | undefined,
    }));
}

export function collectTutorialTrialResult(
  rows: Array<Record<string, unknown>>,
): ExperimentTrialResultItem | undefined {
  const row = rows.find((candidate) => getTrialType(candidate) === "tutorial" && (candidate.encoded || candidate.result));
  if (!row) {
    return undefined;
  }

  return {
    trialType: "tutorial",
    taskId: String(row.task_id ?? row.taskId ?? ""),
    qid: row.qid ? String(row.qid) : undefined,
    encoded: row.encoded ? String(row.encoded) : undefined,
    hash8: row.hash8 ? String(row.hash8) : undefined,
    result: row.result,
    presentation: row.presentation as ReferencePresentation | undefined,
  };
}

function getTrialType(row: Record<string, unknown>): ExperimentTrialType | undefined {
  if (row.trial_type === "tutorial" || row.trial_type === "formal") {
    return row.trial_type;
  }
  if (row.tutorial === true) {
    return "tutorial";
  }
  if (row.formal === true) {
    return "formal";
  }
  return undefined;
}

export async function saveExperimentFiles(input: {
  dataSave: ExperimentDataSaveConfig;
  files: ExperimentCsvFile[];
  participantId?: string;
  sessionId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  localBackup?: LocalBackupStore;
  pauseSummary?: import("./types/result").PauseSummary;
}): Promise<{
  ok: boolean;
  error?: string;
  saved: number;
  failedFilename?: string;
  recoveryZip?: Blob;
  uploadManifest?: ReturnType<UploadState["getManifest"]>;
}> {
  try {
    await input.localBackup?.saveFiles(input.files);
  } catch (error) {
    const recoveryZip = await createCompleteRecoveryZip(input.files, {
      participantId: input.participantId ?? "unknown",
      sessionId: input.sessionId ?? "unknown",
      experimentId: input.dataSave.mode === "copy" ? "layout-task" : input.dataSave.experimentId,
      failedFilenames: input.files.map((file) => file.filename),
      pauseSummary: input.pauseSummary,
    });
    return {
      ok: false,
      saved: 0,
      failedFilename: "local backup",
      error: error instanceof Error ? error.message : String(error),
      recoveryZip,
    };
  }

  if (input.dataSave.mode === "copy") {
    return { ok: true, saved: 0 };
  }

  if (input.dataSave.mode === "receiver") {
    const dataSave = input.dataSave;
    if (!input.participantId || !input.sessionId) {
      return {
        ok: false,
        saved: 0,
        failedFilename: "receiver batch",
        error: "participantId and sessionId are required for receiver mode",
      };
    }

    const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const timeoutMs = input.timeoutMs ?? 30_000;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (dataSave.submitToken) {
      headers["X-Submit-Token"] = dataSave.submitToken;
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(
        () =>
          fetchImpl(dataSave.endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(
              createReceiverSubmission({
                dataSave,
                participantId: input.participantId!,
                sessionId: input.sessionId!,
                files: input.files,
              }),
            ),
          }),
        timeoutMs,
        "receiver batch",
      );
    } catch (error) {
      return {
        ok: false,
        saved: 0,
        failedFilename: "receiver batch",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    if (!response.ok) {
      const recoveryZip = await createCompleteRecoveryZip(await getRecoveryFiles(input), {
        participantId: input.participantId,
        sessionId: input.sessionId,
        experimentId: dataSave.experimentId,
        failedFilenames: ["receiver batch"],
        pauseSummary: input.pauseSummary,
      });
      return {
        ok: false,
        saved: 0,
        failedFilename: "receiver batch",
        error: `${response.status} ${response.statusText}${await readSaveError(response)}`,
        recoveryZip,
      };
    }

    const archiveEndpoint = deriveArchiveEndpoint(dataSave.endpoint);
    const archiveRequest = {
      schema: "layouttask.receiver.archive.v1" as const,
      experiment_id: dataSave.experimentId,
      participant_id: input.participantId,
      session_id: input.sessionId,
    };
    let archiveError = "archive failed";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const archiveResponse = await fetchWithTimeout(
          () => fetchImpl(archiveEndpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(archiveRequest),
          }),
          timeoutMs,
          "receiver archive",
        );
        if (archiveResponse.ok) {
          await input.localBackup?.clear();
          return { ok: true, saved: input.files.length };
        }
        archiveError = `${archiveResponse.status} ${archiveResponse.statusText}${await readSaveError(archiveResponse)}`;
      } catch (error) {
        archiveError = error instanceof Error ? error.message : String(error);
      }
    }
    const recoveryZip = await createCompleteRecoveryZip(await getRecoveryFiles(input), {
      participantId: input.participantId,
      sessionId: input.sessionId,
      experimentId: dataSave.experimentId,
      failedFilenames: ["receiver archive"],
      pauseSummary: input.pauseSummary,
    });
    return {
      ok: false,
      saved: input.files.length,
      failedFilename: "receiver archive",
      error: `Archive failed after 2 attempts: ${archiveError}. A complete recovery ZIP is available.`,
      recoveryZip,
    };
  }

  const payloads = createExperimentDataPipePayloads({
    experimentId: input.dataSave.experimentId,
    files: input.files,
  });
  const dataSave = input.dataSave;
  const uploadState = new UploadState({ pauseSummary: input.pauseSummary });
  const failedFilenames: string[] = [];
  const failureMessages: string[] = [];

  try {
    const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const timeoutMs = input.timeoutMs ?? 60_000;
    let saved = 0;
    for (const payload of payloads) {
      let response: Response;
      try {
        response = await fetchWithTimeout(
          () =>
            fetchImpl(dataSave.endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }),
          timeoutMs,
          payload.filename,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        uploadState.recordAttempt(payload.filename, "timeout", message);
        failedFilenames.push(payload.filename);
        failureMessages.push(message);
        continue;
      }
      if (!response.ok) {
        const message = `${response.status} ${response.statusText}${await readSaveError(response)}`;
        uploadState.recordAttempt(payload.filename, "failed", message);
        failedFilenames.push(payload.filename);
        failureMessages.push(message);
        continue;
      }
      uploadState.recordAttempt(payload.filename, "success");
      saved += 1;
    }
    if (failedFilenames.length > 0) {
      const recoveryZip = await createCompleteRecoveryZip(await getRecoveryFiles(input), {
        participantId: input.participantId ?? "unknown",
        sessionId: input.sessionId ?? "unknown",
        experimentId: dataSave.experimentId,
        failedFilenames,
        pauseSummary: input.pauseSummary,
      });
      return {
        ok: false,
        saved,
        failedFilename: failedFilenames[0],
        error: `Upload failed for ${failedFilenames.length} file(s): ${failureMessages.join("; ")}. A complete recovery ZIP is available.`,
        recoveryZip,
        uploadManifest: uploadState.getManifest(),
      };
    }
    await input.localBackup?.clear();
    return { ok: true, saved };
  } catch (error) {
    return { ok: false, saved: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function getRecoveryFiles(input: {
  files: ExperimentCsvFile[];
  localBackup?: LocalBackupStore;
}): Promise<ExperimentCsvFile[]> {
  if (!input.localBackup) {
    return input.files;
  }
  try {
    const files = await input.localBackup.listFiles();
    return files.length > 0 ? files : input.files;
  } catch {
    return input.files;
  }
}

export function createRunnableExperiment(
  config: ExperimentConfig,
  displayElement?: HTMLElement,
  options: { participantId?: string; developerMode?: boolean; localBackup?: LocalBackupStore } = {},
) {
  const participantId = options.participantId ?? getParticipantId({ storage: globalThis.localStorage });
  const session = bootstrapExperimentSession({
    experimentId: config.experimentId,
    participantId,
  });
  const sessionId = session.sessionId;
  const localBackup = options.localBackup ?? createBrowserLocalBackup(config.experimentId, participantId, sessionId);
  const pause = new ExperimentPauseController({
    mode: "formal",
    restore: session.pauseSnapshot,
    onChange: (snapshot) => {
      session.savePauseSnapshot(snapshot);
      void localBackup?.saveSessionMetadata?.({ session_id: sessionId, pause: snapshot });
    },
  });
  const practicePause = new ExperimentPauseController({ mode: "tutorial_practice" });
  const pauseUi = typeof document === "undefined"
    ? createNoopPauseUi()
    : createExperimentPauseUi({ controller: pause, practiceController: practicePause });
  pauseUi.mount();
  const startTime = Date.now();
  const jsPsych = initJsPsych({
    display_element: displayElement,
    on_trial_start: (startedTrial: unknown) => {
      const currentTrial = (jsPsych as unknown as {
        getCurrentTrial?: () => { tutorialMode?: boolean; data?: Record<string, unknown> };
      }).getCurrentTrial?.();
      const trial = (startedTrial ?? currentTrial) as { tutorialMode?: boolean; data?: Record<string, unknown> } | undefined;
      const data = trial?.data;
      pauseUi.setPageActive(!data?.tutorial_intro && !data?.tutorial_reference_board);
      pauseUi.setTutorialPracticeEnabled(isTutorialPausePage(trial));
    },
    on_finish: async () => {
      const rows = jsPsych.data.get().values() as Array<Record<string, unknown>>;
      const trialResults = collectFormalTrialResults(rows);
      const tutorialResult = collectTutorialTrialResult(rows);
      const tutorialRow = rows.find((row) => row.tutorial);
      const files = createExperimentCsvFiles({
        participantId,
        sessionId,
        experimentId: config.experimentId,
        filenamePrefix: config.dataSave.filenamePrefix,
        startTime,
        endTime: Date.now(),
        tutorialCompleted: Boolean(tutorialRow),
        tutorialDurationMs: Number(tutorialRow?.rt ?? 0),
        trialOrder: config.trials.map((trial) => trial.taskId),
        trialResults,
        tutorialResult,
        tutorialPackageVersion: config.tutorial.packageVersion,
        referenceMode: config.referenceMode,
        pauseSummary: createPauseSummary(pause.snapshot()),
      });
      pauseUi.setPageActive(false);
      pauseUi.destroy();
      renderSavingPage();
      const saveResult = await saveExperimentFiles({
        dataSave: config.dataSave,
        participantId,
        sessionId,
        files,
        localBackup,
        pauseSummary: createPauseSummary(pause.snapshot()),
      });
      if (saveResult.ok) {
        session.markCompleted();
      }
      renderEndPage(files, saveResult);
    },
  });

  return {
    jsPsych,
    timeline: buildExperimentTimeline(config, {
      developerMode: options.developerMode,
      participantId,
      localBackup,
      pause,
      practicePause,
    }),
  };
}

function createBrowserLocalBackup(
  experimentId: string,
  participantId: string,
  sessionId: string,
): LocalBackupStore | undefined {
  if (typeof globalThis.indexedDB === "undefined") {
    return undefined;
  }
  return createIndexedDbLocalBackupStore(`${experimentId}:${participantId}:${sessionId}`);
}

export function isTutorialPausePage(trial: { tutorialMode?: boolean; data?: Record<string, unknown> } | undefined): boolean {
  const data = trial?.data;
  return Boolean(trial?.tutorialMode || data?.tutorial);
}

function createNoopPauseUi() {
  return {
    mount: () => undefined,
    setPageActive: (_active: boolean) => undefined,
    setTutorialPracticeEnabled: (_enabled: boolean) => undefined,
    destroy: () => undefined,
  };
}

export function createSavingPageHtml(): string {
  return `
    <section class="layout-task-shell">
      <h1>Saving your data...</h1>
      <p>Do not close or refresh this page.</p>
      <p>This usually takes less than 1 minute.</p>
    </section>
  `;
}

export function renderSavingPage(): void {
  document.body.innerHTML = createSavingPageHtml();
}

export function createRecoveryOutput(files: ExperimentCsvFile[]): string {
  return files.map((file) => `--- ${file.filename} ---\n${file.data}`).join("\n");
}

function renderEndPage(
  files: ExperimentCsvFile[],
  saveResult: { ok: boolean; error?: string; failedFilename?: string; recoveryZip?: Blob },
): void {
  document.body.innerHTML = "";
  const section = document.createElement("section");
  section.className = "layout-task-shell";
  const title = document.createElement("h1");
  title.textContent = saveResult.ok
    ? "Experiment complete. Your data has been saved."
    : "Experiment complete, but automatic saving failed.";
  const detail = document.createElement("p");
  detail.textContent = saveResult.ok
    ? "You may now close this page."
    : `Please copy or download the data shown below, then contact the researcher. Error: ${[
        saveResult.failedFilename,
        saveResult.error,
      ].filter(Boolean).join(" - ") || "Unknown error"}`;
  const closeButton = document.createElement("button");
  closeButton.textContent = "Close page";
  closeButton.addEventListener("click", () => {
    window.close();
    setTimeout(() => {
      detail.textContent = "If this tab did not close automatically, please close it manually.";
    }, 250);
  });
  section.append(title, detail, closeButton);
  if (!saveResult.ok) {
    if (saveResult.recoveryZip) {
      const recoveryLink = document.createElement("a");
      recoveryLink.className = "layout-task-recovery-download";
      recoveryLink.textContent = "Download recovery ZIP";
      recoveryLink.download = "layout-task-recovery.zip";
      recoveryLink.href = URL.createObjectURL(saveResult.recoveryZip);
      section.append(recoveryLink);
    }
    const output = document.createElement("textarea");
    output.className = "layout-task-output";
    output.value = createRecoveryOutput(files);
    output.readOnly = true;
    section.append(output);
  }
  document.body.append(section);
}

function createReceiverSubmission(input: {
  dataSave: Extract<ExperimentDataSaveConfig, { mode: "receiver" }>;
  participantId: string;
  sessionId: string;
  files: ExperimentCsvFile[];
}) {
  return {
    schema: "layouttask.receiver.submission.v1" as const,
    experiment_id: input.dataSave.experimentId,
    participant_id: input.participantId,
    session_id: input.sessionId,
    files: input.files.map((file) => ({
      filename: file.filename,
      content_type: file.contentType,
      data: file.data,
    })),
  };
}

function deriveArchiveEndpoint(endpoint: string): string {
  const url = new URL(endpoint, globalThis.location?.href ?? "http://localhost/");
  url.pathname = url.pathname.replace(/\/$/, "").replace(/\/submit$/, "") + "/archive";
  return url.toString();
}

async function readSaveError(response: Response): Promise<string> {
  try {
    const body = (await response.clone().json()) as { code?: string; error?: string; message?: string };
    const code = body.code ?? body.error;
    const message = body.message;
    if (code || message) {
      return ` (${[code, message].filter(Boolean).join(": ")})`;
    }
  } catch {
  }

  try {
    const text = await response.text();
    return text ? ` (${text.slice(0, 240)})` : "";
  } catch {
    return "";
  }
}

async function fetchWithTimeout(
  fetchRequest: () => Promise<Response>,
  timeoutMs: number,
  filename: string,
): Promise<Response> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${filename} upload timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fetchRequest(), timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
