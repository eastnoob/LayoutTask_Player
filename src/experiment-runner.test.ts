import { describe, expect, it, vi } from "vitest";
import LayoutTaskPlugin from "./plugins/jspsych-layout-task";
import {
  buildExperimentTimeline,
  collectFormalTrialResults,
  createRunnableExperiment,
  saveExperimentCsv,
} from "./experiment-runner";
import type { ExperimentConfig } from "./types/experiment";
import { initJsPsych } from "jspsych";

vi.mock("jspsych", () => ({
  initJsPsych: vi.fn(() => ({ data: { get: () => ({ values: () => [] }) } })),
  ParameterType: {
    OBJECT: "object",
    STRING: "string",
    BOOL: "bool",
  },
}));

vi.mock("@jspsych/plugin-instructions", () => ({
  default: function InstructionsPlugin() {},
}));

function experimentConfig(): ExperimentConfig {
  return {
    schema: "layouttask.experiment.v1",
    experimentId: "layout_task_v1",
    baseUrl: "/layout-task-generated/",
    order: "fixed",
    tutorial: { enabled: true, taskId: "tutorial_room", qid: "QTUTORIAL" },
    confidence: {
      required: true,
      scale: [1, 2, 3, 4, 5],
      labels: { "1": "Very unsure", "2": "Unsure", "3": "Neutral", "4": "Sure", "5": "Very sure" },
    },
    dataSave: {
      mode: "datapipe",
      experimentId: "layout_task_v1",
      endpoint: "https://pipe.jspsych.org/api/data/",
      filenamePrefix: "layout-task",
    },
    trials: [
      { taskId: "scene_001", qid: "Q001" },
      { taskId: "scene_002", qid: "Q002" },
    ],
  };
}

describe("buildExperimentTimeline", () => {
  it("creates tutorial then formal LayoutTask trials in fixed order", () => {
    const timeline = buildExperimentTimeline(experimentConfig());

    expect(timeline).toHaveLength(5);
    expect(timeline[0]).toMatchObject({ type: LayoutTaskPlugin, taskId: "tutorial_room", tutorialMode: true });
    expect(timeline[1]).toMatchObject({
      pages: [
        "<h1>Tutorial complete.</h1><p>The formal experiment must be completed in one sitting. Do not refresh, close, or leave this page temporarily, otherwise you may be unable to receive the required compensation.</p>",
      ],
      button_label_next: "Start formal experiment",
    });
    expect(timeline[2]).toMatchObject({ type: LayoutTaskPlugin, taskId: "scene_001", qid: "Q001" });
    expect(timeline[3]).toMatchObject({ type: LayoutTaskPlugin, taskId: "scene_002", qid: "Q002" });
  });
});

describe("createRunnableExperiment", () => {
  it("uses the provided display element for jsPsych content", () => {
    const root = {} as HTMLElement;
    const previousLocation = globalThis.location;
    const previousLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { href: "https://example.test/experiment/" },
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: () => null, setItem: () => undefined },
    });

    try {
      createRunnableExperiment(experimentConfig(), root);
    } finally {
      Object.defineProperty(globalThis, "location", { configurable: true, value: previousLocation });
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previousLocalStorage });
    }

    expect(initJsPsych).toHaveBeenCalledWith(expect.objectContaining({ display_element: root }));
  });
});

describe("collectFormalTrialResults", () => {
  it("keeps encoded and result fields for formal trials only", () => {
    const results = collectFormalTrialResults([
      { tutorial: true, task_id: "tutorial_room" },
      { task_id: "scene_001", qid: "Q001", encoded: "ENC1", result: { task_id: "scene_001" } },
    ]);

    expect(results).toEqual([
      {
        taskId: "scene_001",
        qid: "Q001",
        encoded: "ENC1",
        result: { task_id: "scene_001" },
      },
    ]);
  });
});

describe("saveExperimentCsv", () => {
  it("posts one participant-level CSV to DataPipe", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK" })) as unknown as typeof fetch;

    const result = await saveExperimentCsv({
      dataSave: experimentConfig().dataSave,
      participantId: "P001",
      sessionId: "S001",
      csv: "a,b\n1,2\n",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith("https://pipe.jspsych.org/api/data/", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String((fetchImpl as never as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[0][1].body))).toEqual({
      experimentID: "layout_task_v1",
      filename: "layout-task_P001_S001.csv",
      data: "a,b\n1,2\n",
    });
  });
});
