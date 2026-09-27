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
import { selectSequence } from "./core/schedule-generator";
import { createIndexedDbLocalBackupStore, type LocalBackupStore } from "./core/local-backup-store";
import { bootstrapExperimentSession } from "./core/experiment-session";
import { createPauseSummary, ExperimentPauseController } from "./core/experiment-pause";
import { createExperimentPauseUi } from "./core/experiment-pause-ui";
import { CompletionCodeGate } from "./core/completion-code-gate";

type ExperimentTimeline = Array<{ type: any } & Record<string, any>>;

export interface AssignmentRecord {
  assignmentId: string;
  participantNumber: number;
  sequenceId: string;
  scheduleVersion: string;
}

export interface AssignmentRequest {
  endpoint: string;
  submitToken?: string;
  experimentId: string;
  scheduleVersion: string;
  sequenceIds: string[];
  idempotencyToken: string;
}

export function buildExperimentTimeline(
  config: ExperimentConfig,
  options: { developerMode?: boolean; participantId?: string; participantNumber?: number; assignment?: AssignmentRecord; requireAssignment?: boolean; localBackup?: LocalBackupStore; pause?: ExperimentPauseController; practicePause?: ExperimentPauseController } = {},
): ExperimentTimeline {
  const timeline: ExperimentTimeline = [];
  const chinese = config.locale === "zh-CN";
  const taskDataSave = toRuntimeTaskDataSave(config.dataSave, options.participantId);

  if (config.tutorial.enabled) {
    const tutorialBaseUrl = config.tutorial.baseUrl ?? `${config.baseUrl}tutorial/`;
    timeline.push({
      type: InstructionsPlugin,
      css_classes: "layout-task-tutorial-intro-trial",
      pages: [
        `<section class="layout-task-shell layout-task-tutorial-intro-shell">
          <header class="layout-task-header layout-task-tutorial-intro-header">
            <p class="layout-task-eyebrow">${chinese ? "教程" : "Tutorial"}</p>
            <h1>${chinese ? "恢复家具布局" : "Reconstruct the furniture layout"}</h1>
            <p class="layout-task-meta">${chinese ? "图片显示在页面顶部。请观察图片，然后在下方平面图中恢复家具的摆放。" : "The picture is shown at the top of the page. Study it, then rebuild the furniture arrangement on the floor plan below."}</p>
          </header>
          <div class="layout-task-tutorial-intro-note">
            <p><strong>${chinese ? "你的任务是观察页面顶部的每张图片，并尽可能在平面图中恢复家具布局。" : "Your task is to study each picture at the top of the page and reconstruct the furniture layout on the floor plan as closely as possible."}</strong></p>
            <p>${chinese ? "你将练习正式实验中的相同流程：观察家具布局，打开每个黄色家具物体，必要时进行调整，选择位置和旋转的置信度，然后保存。" : "You will practice the same workflow used in the experiment: study the furniture arrangement, open each yellow furniture object, adjust it if needed, choose confidence for its position and rotation, and save it."}</p>
          </div>
        </section>`,
      ],
      show_clickable_nav: true,
      allow_backward: false,
          button_label_next: chinese ? "开始教程" : "Start tutorial",
      data: { tutorial_intro: true },
    });
    if (config.tutorial.referenceBoard?.enabled) {
      const board = config.tutorial.referenceBoard;
      const pages = buildTutorialReferenceBoardPages({ baseUrl: tutorialBaseUrl, board, locale: config.locale });
      const continueLabel = chinese ? "继续" : board.continueLabel ?? "Continue";
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
        locale: config.locale,
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
              <p class="layout-task-eyebrow">${chinese ? "教程" : "Tutorial"}</p>
              <h1>${chinese ? "教程完成。" : "Tutorial complete."}</h1>
              <p class="layout-task-meta">${chinese ? "观察图片 -> 恢复场景 -> 选择置信度 -> 提交" : "Study image -> Reconstruct scene -> Rate confidence -> Submit"}</p>
            </header>
            <div class="layout-task-tutorial-complete-note">
              <ul class="layout-task-tutorial-complete-list">
                <li><strong>${chinese ? "这不是考试，而是实验。" : "This is an experiment, not a test."}</strong> ${chinese ? "犯错和不确定是正常的；如果非常不确定，请报告很低的置信度。" : "Mistakes and uncertainty are normal. If you are very unsure, report very low confidence."}</li>
                <li>${chinese ? "你有一次正式暂停机会，最长15分钟。" : "You have one formal pause opportunity: a one-time 15-minute break."}</li>
                <li>${chinese ? "如果实验让你感到任何不适，您可以简单地通过关闭页面来退出实验，在这种情况下，您将无法获得承诺报酬，但您也不需要为此付出任何代价。如果有任何问题，请通过邮箱 floorplanrestoration.deluxe999@passmail.com 联系我们协助。" : "If the experiment causes you any discomfort, you may simply close the page to withdraw. In that case, you will not receive the promised compensation, but you will not be penalized or incur any cost. If you have any questions, please contact us at floorplanrestoration.deluxe999@passmail.com for assistance."}</li>
                <li>${chinese ? "请如实回答并认真对待每道题。基于行为的注意力检测可能会拒绝不认真完成的回答。" : "Please respond truthfully and take every question seriously. Behavior-based attention checks may reject inattentive responses."}</li>
                <li>${chinese ? "整个研究大约需要15-20分钟。" : "The complete study takes approximately 15-20 minutes."}</li>
              </ul>
            </div>
          </section>`,
        ],
        show_clickable_nav: true,
        button_label_next: chinese ? "开始正式实验" : "Start formal experiment",
        data: { tutorial_complete: true },
      });
    }
  }

  if (options.requireAssignment && config.schedule && !options.assignment) {
    throw new Error("Formal assignment is required before starting the experiment");
  }
  const selectedSequence = config.schedule
    ? selectSequence(config.schedule, options.assignment?.participantNumber ?? options.participantNumber ?? 1)
    : undefined;
  const formalPresentations: ReferencePresentation[] = selectedSequence?.presentations
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
      locale: config.locale,
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

export async function requestAssignment(input: AssignmentRequest): Promise<AssignmentRecord> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.submitToken) headers["X-Submit-Token"] = input.submitToken;
  const response = await fetch(input.endpoint.replace(/\/submit\/?$/, "/assign"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      experiment_id: input.experimentId,
      idempotency_token: input.idempotencyToken,
      schedule_version: input.scheduleVersion,
    }),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok || typeof payload.assignment_id !== "string" || !Number.isInteger(payload.participant_number) || typeof payload.sequence_id !== "string") {
    throw new Error(String(payload.message ?? payload.error ?? `Assignment request failed (${response.status})`));
  }
  return {
    assignmentId: payload.assignment_id,
    participantNumber: payload.participant_number as number,
    sequenceId: payload.sequence_id,
    scheduleVersion: String(payload.schedule_version ?? input.scheduleVersion),
  };
}

export function shouldShowCompletionCodeGate(config: ExperimentConfig): boolean {
  return config.locale === "zh-CN" && config.completionCodeGate.enabled;
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
  completionCode?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  localBackup?: LocalBackupStore;
  pauseSummary?: import("./types/result").PauseSummary;
  assignment?: AssignmentRecord;
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
      completionCode: input.completionCode,
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
                assignment: input.assignment,
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
        completionCode: input.completionCode,
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
      assignment_id: input.assignment?.assignmentId,
      participant_number: input.assignment?.participantNumber,
      sequence_id: input.assignment?.sequenceId,
      schedule_version: input.assignment?.scheduleVersion,
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
      completionCode: input.completionCode,
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
    assignment: input.assignment ? {
      assignment_id: input.assignment.assignmentId,
      participant_number: input.assignment.participantNumber,
      sequence_id: input.assignment.sequenceId,
      schedule_version: input.assignment.scheduleVersion,
    } : undefined,
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
        completionCode: input.completionCode,
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
  options: { participantId?: string; participantNumber?: number; assignment?: AssignmentRecord; requireAssignment?: boolean; developerMode?: boolean; localBackup?: LocalBackupStore } = {},
) {
  const participantId = options.participantId ?? getParticipantId({ storage: globalThis.localStorage });
  const session = bootstrapExperimentSession({
    experimentId: config.experimentId,
    participantId,
    assignment: options.assignment ? {
      assignment_id: options.assignment.assignmentId,
      participant_number: options.assignment.participantNumber,
      sequence_id: options.assignment.sequenceId,
      schedule_version: options.assignment.scheduleVersion,
    } : undefined,
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
      pauseUi.setPageActive(false);
      let completionCode = "";
      if (shouldShowCompletionCodeGate(config)) {
        const gateRoot = displayElement ?? document.body;
        gateRoot.replaceChildren();
        const gate = new CompletionCodeGate({
          minDisplayMs: config.completionCodeGate.minDisplayMs,
        });
        gate.mount(gateRoot);
        completionCode = await gate.waitForCompletion();
        gate.destroy();
      }
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
        completionCode,
        referenceMode: config.referenceMode,
        pauseSummary: createPauseSummary(pause.snapshot()),
        assignment: options.assignment ? {
          assignment_id: options.assignment.assignmentId,
          participant_number: options.assignment.participantNumber,
          sequence_id: options.assignment.sequenceId,
          schedule_version: options.assignment.scheduleVersion,
        } : undefined,
      });
      pauseUi.destroy();
      renderSavingPage(config.locale);
      const saveResult = await saveExperimentFiles({
        dataSave: config.dataSave,
        participantId,
        sessionId,
        files,
        localBackup,
        completionCode,
        pauseSummary: createPauseSummary(pause.snapshot()),
        assignment: options.assignment,
      });
      if (saveResult.ok) {
        session.markCompleted();
      }
      renderEndPage(files, saveResult, config.locale);
    },
  });

  return {
    jsPsych,
    timeline: buildExperimentTimeline(config, {
      developerMode: options.developerMode,
      participantId,
      participantNumber: options.participantNumber,
      assignment: options.assignment,
      requireAssignment: options.requireAssignment,
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

export function createSavingPageHtml(locale: "en-US" | "zh-CN" = "en-US"): string {
  return locale === "zh-CN" ? `
    <section class="layout-task-shell">
      <h1>正在保存数据...</h1>
      <p>请不要关闭或刷新页面。</p>
      <p>通常需要不到1分钟。</p>
    </section>
  ` : `
    <section class="layout-task-shell">
      <h1>Saving your data...</h1>
      <p>Do not close or refresh this page.</p>
      <p>This usually takes less than 1 minute.</p>
    </section>
  `;
}

export function renderSavingPage(locale: "en-US" | "zh-CN" = "en-US"): void {
  document.body.innerHTML = createSavingPageHtml(locale);
}

export function createRecoveryOutput(files: ExperimentCsvFile[]): string {
  return files.map((file) => `--- ${file.filename} ---\n${file.data}`).join("\n");
}

function renderEndPage(
  files: ExperimentCsvFile[],
  saveResult: { ok: boolean; error?: string; failedFilename?: string; recoveryZip?: Blob },
  locale: "en-US" | "zh-CN" = "en-US",
): void {
  document.body.innerHTML = "";
  const section = document.createElement("section");
  section.className = "layout-task-shell";
  const title = document.createElement("h1");
  title.textContent = locale === "zh-CN"
    ? saveResult.ok ? "实验完成，数据已保存。" : "实验完成，但自动保存失败。"
    : saveResult.ok
      ? "Experiment complete. Your data has been saved."
      : "Experiment complete, but automatic saving failed.";
  const detail = document.createElement("p");
  detail.textContent = locale === "zh-CN"
    ? saveResult.ok
      ? "现在可以关闭页面。"
      : `请复制或下载下方显示的数据，然后联系研究者。错误：${[
          saveResult.failedFilename,
          saveResult.error,
        ].filter(Boolean).join(" - ") || "未知错误"}`
    : saveResult.ok
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
  assignment?: AssignmentRecord;
}) {
  return {
    schema: "layouttask.receiver.submission.v1" as const,
    experiment_id: input.dataSave.experimentId,
    participant_id: input.participantId,
    session_id: input.sessionId,
    assignment_id: input.assignment?.assignmentId,
    participant_number: input.assignment?.participantNumber,
    sequence_id: input.assignment?.sequenceId,
    schedule_version: input.assignment?.scheduleVersion,
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
