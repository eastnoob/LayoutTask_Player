import InstructionsPlugin from "@jspsych/plugin-instructions";
import { initJsPsych } from "jspsych";
import {
  createExperimentCsvFiles,
  createExperimentDataPipePayloads,
  type ExperimentTrialType,
  type ExperimentCsvFile,
  type ExperimentTrialResultItem,
} from "./core/experiment-data";
import { createSessionId, getParticipantId } from "./core/participant-session";
import { buildTutorialReferenceBoardPages } from "./core/tutorial-reference-board";
import LayoutTaskPlugin from "./plugins/jspsych-layout-task";
import type { ExperimentConfig, ExperimentDataSaveConfig } from "./types/experiment";

type ExperimentTimeline = Array<{ type: any } & Record<string, any>>;

export function buildExperimentTimeline(config: ExperimentConfig): ExperimentTimeline {
  const timeline: ExperimentTimeline = [];

  if (config.tutorial.enabled) {
    if (config.tutorial.referenceBoard?.enabled) {
      const board = config.tutorial.referenceBoard;
      const pages = buildTutorialReferenceBoardPages({ baseUrl: config.baseUrl, board });
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
        baseUrl: config.tutorial.baseUrl ?? config.baseUrl,
        taskId: config.tutorial.taskId,
        qid: config.tutorial.qid,
        tutorialMode: true,
        confidence: config.confidence,
        autoFinishTrial: true,
        writeEncodedToData: true,
        writeResultToData: true,
        writeHeaderToData: true,
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
              <p>The formal experiment must be completed in one sitting. Do not refresh, close, or leave this page temporarily, otherwise you may be unable to receive the required compensation.</p>
            </div>
          </section>`,
        ],
        show_clickable_nav: true,
        button_label_next: "Start formal experiment",
        data: { tutorial_complete: true },
      });
    }
  }

  for (const trial of config.trials) {
    timeline.push({
      type: LayoutTaskPlugin,
      baseUrl: config.baseUrl,
      taskId: trial.taskId,
      qid: trial.qid,
      confidence: config.confidence,
      autoFinishTrial: true,
      writeEncodedToData: true,
      writeResultToData: true,
      writeHeaderToData: true,
      data: { formal: true, taskId: trial.taskId, qid: trial.qid },
    });
  }

  return timeline;
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
}): Promise<{ ok: boolean; error?: string; saved: number; failedFilename?: string }> {
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
    const timeoutMs = input.timeoutMs ?? 60_000;
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
      return {
        ok: false,
        saved: 0,
        failedFilename: "receiver batch",
        error: `${response.status} ${response.statusText}${await readSaveError(response)}`,
      };
    }

    return { ok: true, saved: input.files.length };
  }

  const payloads = createExperimentDataPipePayloads({
    experimentId: input.dataSave.experimentId,
    files: input.files,
  });
  const dataSave = input.dataSave;

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
        return {
          ok: false,
          saved,
          failedFilename: payload.filename,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      if (!response.ok) {
        return {
          ok: false,
          saved,
          failedFilename: payload.filename,
          error: `${response.status} ${response.statusText}${await readSaveError(response)}`,
        };
      }
      saved += 1;
    }
    return { ok: true, saved };
  } catch (error) {
    return { ok: false, saved: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

export function createRunnableExperiment(config: ExperimentConfig, displayElement?: HTMLElement) {
  const participantId = getParticipantId({ storage: globalThis.localStorage });
  const sessionId = createSessionId();
  const startTime = Date.now();
  const jsPsych = initJsPsych({
    display_element: displayElement,
    on_finish: async () => {
      const rows = jsPsych.data.get().values() as Array<Record<string, unknown>>;
      const trialResults = collectFormalTrialResults(rows);
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
      });
      renderSavingPage();
      renderEndPage(files, await saveExperimentFiles({ dataSave: config.dataSave, participantId, sessionId, files }));
    },
  });

  return { jsPsych, timeline: buildExperimentTimeline(config) };
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

function renderEndPage(
  files: ExperimentCsvFile[],
  saveResult: { ok: boolean; error?: string; failedFilename?: string },
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
    const output = document.createElement("textarea");
    output.className = "layout-task-output";
    output.value = files.map((file) => `--- ${file.filename} ---\n${file.data}`).join("\n");
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
