import InstructionsPlugin from "@jspsych/plugin-instructions";
import { initJsPsych } from "jspsych";
import {
  createExperimentCsvFiles,
  createExperimentDataPipePayloads,
  type ExperimentCsvFile,
  type ExperimentTrialResultItem,
} from "./core/experiment-data";
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
        "<h1>Tutorial complete.</h1><pre>Study image -> Reconstruct scene -> Rate confidence -> Submit</pre><p>The formal experiment must be completed in one sitting. Do not refresh, close, or leave this page temporarily, otherwise you may be unable to receive the required compensation.</p>",
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

  return timeline;
}

export function collectFormalTrialResults(rows: Array<Record<string, unknown>>): ExperimentTrialResultItem[] {
  return rows
    .filter((row) => !row.tutorial && (row.encoded || row.result))
    .map((row) => ({
      taskId: String(row.task_id ?? row.taskId ?? ""),
      qid: row.qid ? String(row.qid) : undefined,
      encoded: row.encoded ? String(row.encoded) : undefined,
      hash8: row.hash8 ? String(row.hash8) : undefined,
      result: row.result,
    }));
}

export async function saveExperimentFiles(input: {
  dataSave: ExperimentDataSaveConfig;
  files: ExperimentCsvFile[];
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; error?: string; saved: number; failedFilename?: string }> {
  if (input.dataSave.mode === "copy") {
    return { ok: true, saved: 0 };
  }

  const payloads = createExperimentDataPipePayloads({
    experimentId: input.dataSave.experimentId,
    files: input.files,
  });

  try {
    const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);
    let saved = 0;
    for (const payload of payloads) {
      const response = await fetchImpl(input.dataSave.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        return {
          ok: false,
          saved,
          failedFilename: payload.filename,
          error: `${response.status} ${response.statusText}`,
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
        startTime,
        endTime: Date.now(),
        tutorialCompleted: Boolean(tutorialRow),
        tutorialDurationMs: Number(tutorialRow?.rt ?? 0),
        trialOrder: config.trials.map((trial) => trial.taskId),
        trialResults,
      });
      renderSavingPage();
      renderEndPage(files, await saveExperimentFiles({ dataSave: config.dataSave, files }));
    },
  });

  return { jsPsych, timeline: buildExperimentTimeline(config) };
}

export function createSavingPageHtml(): string {
  return `
    <section class="layout-task-shell">
      <h1>Saving your data...</h1>
      <p>Do not close or refresh this page.</p>
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
