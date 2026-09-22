import { describe, expect, it, vi } from "vitest";
import InstructionsPlugin from "@jspsych/plugin-instructions";
import LayoutTaskPlugin from "./plugins/jspsych-layout-task";
import {
  buildExperimentTimeline,
  collectFormalTrialResults,
  createSavingPageHtml,
  createRunnableExperiment,
  saveExperimentFiles,
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

function receiverExperimentConfig(): ExperimentConfig {
  return {
    ...experimentConfig(),
    dataSave: {
      mode: "receiver",
      experimentId: "layout_task_v1",
      endpoint: "https://data.example.com/submit",
      filenamePrefix: "layout-task",
      submitToken: "public-study-token",
    },
  };
}

describe("buildExperimentTimeline", () => {
  it("creates tutorial then formal LayoutTask trials in fixed order", () => {
    const timeline = buildExperimentTimeline(experimentConfig());

    expect(timeline).toHaveLength(4);
    expect(timeline[0]).toMatchObject({ type: LayoutTaskPlugin, taskId: "tutorial_room", tutorialMode: true });
    expect(timeline[1].pages[0]).toContain("Study image -> Reconstruct scene -> Rate confidence -> Submit");
    expect(timeline[1]).toMatchObject({
      button_label_next: "Start formal experiment",
      css_classes: "layout-task-tutorial-complete-trial",
      data: { tutorial_complete: true },
    });
    expect(String(timeline[1].pages[0])).toContain("layout-task-tutorial-complete-shell");
    expect(String(timeline[1].pages[0])).toContain("Study image -> Reconstruct scene -> Rate confidence -> Submit");
    expect(timeline[2]).toMatchObject({ type: LayoutTaskPlugin, taskId: "scene_001", qid: "Q001" });
    expect(timeline[3]).toMatchObject({ type: LayoutTaskPlugin, taskId: "scene_002", qid: "Q002" });
  });

  it("shows the reference board before the interactive tutorial room", () => {
    const config = experimentConfig();
    config.tutorial.referenceBoard = {
      enabled: true,
      continueLabel: "Continue",
      items: ["m01", "m03", "m04", "m05"].map((id) => ({
        id,
        name: id === "m01" ? "Armchairs and Coffee Table" : id,
        allSvg: `assets/tutorial-reference/tutorial/whole/svg/${id}.svg`,
        variableSvg: `assets/tutorial-reference/tutorial/variable/svg/${id}.svg`,
        allAnimation: `assets/tutorial-reference/tutorial/whole/${id}.gif`,
        variableAnimation: `assets/tutorial-reference/tutorial/variable/${id}.gif`,
      })),
    };

    const timeline = buildExperimentTimeline(config);

    expect(timeline[0]).toMatchObject({
      type: InstructionsPlugin,
      allow_backward: false,
      button_label_next: "Continue",
      css_classes: "layout-task-reference-board-trial",
    });
    expect(typeof timeline[0].on_load).toBe("function");
    expect(timeline[0].data).toEqual({ tutorial_reference_board: true });
    expect(String(timeline[0].pages[0])).toContain("/layout-task-generated/assets/tutorial-reference/tutorial/whole/m01.gif");
    expect(String(timeline[0].pages[0])).toContain("/layout-task-generated/assets/tutorial-reference/tutorial/variable/m01.gif");
    expect(String(timeline[0].pages[0])).toContain("/layout-task-generated/assets/tutorial-reference/tutorial/whole/svg/m01.svg");
    expect(timeline[1]).toMatchObject({ type: LayoutTaskPlugin, taskId: "tutorial_room", tutorialMode: true });
    expect(timeline[2]).toMatchObject({ button_label_next: "Start formal experiment" });
    expect(timeline[3]).toMatchObject({ type: LayoutTaskPlugin, taskId: "scene_001" });
  });

  it("can run a board-only tutorial before formal trials", () => {
    const config = experimentConfig();
    config.tutorial = {
      enabled: true,
      referenceBoard: {
        enabled: true,
        items: ["m01", "m03", "m04", "m05"].map((id) => ({
          id,
          name: id,
          allSvg: `assets/tutorial-reference/tutorial/whole/svg/${id}.svg`,
          variableSvg: `assets/tutorial-reference/tutorial/variable/svg/${id}.svg`,
          allAnimation: `assets/tutorial-reference/tutorial/whole/${id}.gif`,
          variableAnimation: `assets/tutorial-reference/tutorial/variable/${id}.gif`,
        })),
      },
    };

    const timeline = buildExperimentTimeline(config);

    expect(timeline[0]).toMatchObject({ type: InstructionsPlugin, button_label_next: "Continue" });
    expect(timeline[1]).toMatchObject({ type: LayoutTaskPlugin, taskId: "scene_001" });
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

describe("createSavingPageHtml", () => {
  it("returns a nonblank saving state while DataPipe requests are in flight", () => {
    const html = createSavingPageHtml();

    expect(html).toContain("Saving your data");
    expect(html).toContain("Do not close or refresh this page");
    expect(html).toContain("usually takes less than 1 minute");
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

describe("saveExperimentFiles", () => {
  it("posts one batch submission to the self-hosted receiver", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, statusText: "Created" })) as unknown as typeof fetch;

    const result = await saveExperimentFiles({
      dataSave: receiverExperimentConfig().dataSave,
      participantId: "P001",
      sessionId: "S001",
      files: [
        { filename: "layout-task_session_P001_S001.csv", contentType: "text/csv", data: "a\n1\n" },
        { filename: "layout-task_results_P001_S001.csv", contentType: "text/csv", data: "b\n2\n" },
        { filename: "layout-task_events_P001_S001.csv", contentType: "text/csv", data: "c\n3\n" },
        { filename: "layout-task_debug_P001_S001.json", contentType: "application/json", data: "{}" },
      ],
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, saved: 4 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("https://data.example.com/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Submit-Token": "public-study-token",
      },
      body: expect.any(String),
    });

    const body = JSON.parse(
      String((fetchImpl as never as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[0][1].body),
    );
    expect(body).toEqual({
      schema: "layouttask.receiver.submission.v1",
      experiment_id: "layout_task_v1",
      participant_id: "P001",
      session_id: "S001",
      files: [
        { filename: "layout-task_session_P001_S001.csv", content_type: "text/csv", data: "a\n1\n" },
        { filename: "layout-task_results_P001_S001.csv", content_type: "text/csv", data: "b\n2\n" },
        { filename: "layout-task_events_P001_S001.csv", content_type: "text/csv", data: "c\n3\n" },
        { filename: "layout-task_debug_P001_S001.json", content_type: "application/json", data: "{}" },
      ],
    });
  });

  it("reports receiver JSON error details", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 413,
      statusText: "Payload Too Large",
      clone: () => ({
        json: async () => ({ error: "body_too_large", message: "Request body is too large." }),
      }),
      text: async () => "",
    })) as unknown as typeof fetch;

    const result = await saveExperimentFiles({
      dataSave: receiverExperimentConfig().dataSave,
      participantId: "P001",
      sessionId: "S001",
      files: [{ filename: "layout_session_P001_S001.csv", contentType: "text/csv", data: "a\n1\n" }],
      fetchImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      saved: 0,
      failedFilename: "receiver batch",
    });
    expect(result.error).toContain("413 Payload Too Large");
    expect(result.error).toContain("body_too_large");
  });

  it("posts every generated CSV file to DataPipe", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK" })) as unknown as typeof fetch;

    const result = await saveExperimentFiles({
      dataSave: experimentConfig().dataSave,
      files: [
        { filename: "layout_session_P001_S001.csv", contentType: "text/csv", data: "a\n1\n" },
        { filename: "layout_results_P001_S001.csv", contentType: "text/csv", data: "b\n2\n" },
        { filename: "layout_events_P001_S001.csv", contentType: "text/csv", data: "c\n3\n" },
      ],
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(result.saved).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String((fetchImpl as never as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[1][1].body))).toEqual({
      experimentID: "layout_task_v1",
      filename: "layout_results_P001_S001.csv",
      data: "b\n2\n",
    });
  });

  it("fails a DataPipe file that takes longer than the timeout", async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;

    const result = await saveExperimentFiles({
      dataSave: experimentConfig().dataSave,
      files: [{ filename: "layout_session_P001_S001.csv", contentType: "text/csv", data: "a\n1\n" }],
      fetchImpl,
      timeoutMs: 5,
    });

    expect(result).toMatchObject({
      ok: false,
      saved: 0,
      failedFilename: "layout_session_P001_S001.csv",
    });
    expect(result.error).toContain("timed out");
  });
});
