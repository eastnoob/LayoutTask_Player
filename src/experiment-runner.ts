import InstructionsPlugin from "@jspsych/plugin-instructions";
import { initJsPsych } from "jspsych";
import { createExperimentCsv, createExperimentDataPipePayload, type ExperimentTrialResultItem } from "./core/experiment-data";
import { createSessionId, getParticipantId } from "./core/participant-session";
import LayoutTaskPlugin from "./plugins/jspsych-layout-task";
import type { ExperimentConfig, ExperimentDataSaveConfig } from "./types/experiment";

type ExperimentTimeline = Array<{ type: any } & Record<string, any>>;

export function buildExperimentTimeline(config: ExperimentConfig): ExperimentTimeline {
  const timeline: ExperimentTimeline = [];

  if (config.tutorial.enabled) {
    timeline.push({
      type: LayoutTaskPlugin,
      baseUrl: config.baseUrl,
      taskId: config.tutorial.taskId,
      qid: config.tutorial.qid,
      tutorialMode: true,
      confidence: config.confidence,
      autoFinishTrial: true,
      writeEncodedToData: false,
      writeResultToData: false,
      writeHeaderToData: true,
      data: { tutorial: true },
    });
    timeline.push({
      type: InstructionsPlugin,
      pages: [
        "<h1>Tutorial complete.</h1><p>The formal experiment must be completed in one sitting. Do not refresh, close, or leave this page temporarily, otherwise you may be unable to receive the required compensation.</p>",
      ],
      show_clickable_nav: true,
      button_label_next: "Start formal experiment",
    });
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

  timeline.push({
    type: InstructionsPlugin,
    pages: ["Experiment complete. Data is being saved."],
    show_clickable_nav: true,
    button_label_next: "Finish",
  });

  return timeline;
}

export function collectFormalTrialResults(rows: Array<Record<string, unknown>>): ExperimentTrialResultItem[] {
  return rows
    .filter((row) => !row.tutorial && (row.encoded || row.result))
    .map((row) => ({
      taskId: String(row.task_id ?? row.taskId ?? ""),
      qid: row.qid ? String(row.qid) : undefined,
      encoded: row.encoded ? String(row.encoded) : undefined,
      result: row.result,
    }));
}

export async function saveExperimentCsv(input: {
  dataSave: ExperimentDataSaveConfig;
  participantId: string;
  sessionId: string;
  csv: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; error?: string }> {
  if (input.dataSave.mode === "copy") {
    return { ok: true };
  }

  const payload = createExperimentDataPipePayload({
    experimentId: input.dataSave.experimentId,
    filenamePrefix: input.dataSave.filenamePrefix,
    participantId: input.participantId,
    sessionId: input.sessionId,
    data: input.csv,
  });

  try {
    const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const response = await fetchImpl(input.dataSave.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.ok ? { ok: true } : { ok: false, error: `${response.status} ${response.statusText}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
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
      const csv = createExperimentCsv({
        participantId,
        sessionId,
        experimentId: config.experimentId,
        startTime,
        endTime: Date.now(),
        tutorialCompleted: Boolean(tutorialRow),
        tutorialDurationMs: Number(tutorialRow?.rt ?? 0),
        trialOrder: config.trials.map((trial) => trial.taskId),
        trialResults,
      });
      renderEndPage(csv, await saveExperimentCsv({ dataSave: config.dataSave, participantId, sessionId, csv }));
    },
  });

  return { jsPsych, timeline: buildExperimentTimeline(config) };
}

function renderEndPage(csv: string, saveResult: { ok: boolean; error?: string }): void {
  document.body.innerHTML = "";
  const section = document.createElement("section");
  section.className = "layout-task-shell";
  const title = document.createElement("h1");
  title.textContent = saveResult.ok ? "Experiment complete. Data saved." : "Experiment complete, but automatic saving failed.";
  const detail = document.createElement("p");
  detail.textContent = saveResult.ok
    ? "Thank you for participating."
    : `Please copy or download the data. Error: ${saveResult.error ?? "Unknown error"}`;
  const output = document.createElement("textarea");
  output.className = "layout-task-output";
  output.value = csv;
  output.readOnly = true;
  section.append(title, detail, output);
  document.body.append(section);
}
