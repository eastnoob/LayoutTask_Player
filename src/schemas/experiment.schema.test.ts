import { describe, expect, it } from "vitest";
import { parseExperimentConfig } from "./experiment.schema";

function baseExperiment() {
  return {
    schema: "layouttask.experiment.v1",
    experiment_id: "layout_task_v1",
    baseUrl: "/layout-task-generated/",
    order: "fixed",
    tutorial: {
      enabled: true,
      taskId: "tutorial_room",
      qid: "QTUTORIAL",
    },
    confidence: {
      required: true,
      scale: [1, 2, 3, 4, 5],
      labels: {
        "1": "Very unsure",
        "2": "Unsure",
        "3": "Neutral",
        "4": "Sure",
        "5": "Very sure",
      },
    },
    data_save: {
      mode: "datapipe",
      experiment_id: "layout_task_v1",
      endpoint: "https://pipe.jspsych.org/api/data/",
      filename_prefix: "layout-task",
    },
    trials: [
      { taskId: "scene_001", qid: "Q001" },
      { taskId: "scene_002", qid: "Q002" },
    ],
  };
}

describe("parseExperimentConfig", () => {
  it("accepts the v1 experiment config shape", () => {
    expect(parseExperimentConfig(baseExperiment())).toMatchObject({
      schema: "layouttask.experiment.v1",
      experimentId: "layout_task_v1",
      baseUrl: "/layout-task-generated/",
      order: "fixed",
      tutorial: {
        enabled: true,
        taskId: "tutorial_room",
        qid: "QTUTORIAL",
      },
      confidence: {
        required: true,
        scale: [1, 2, 3, 4, 5],
      },
      trials: [
        { taskId: "scene_001", qid: "Q001" },
        { taskId: "scene_002", qid: "Q002" },
      ],
    });
  });

  it("applies defaults for tutorial, confidence, and data save", () => {
    const input = baseExperiment();
    delete (input as { tutorial?: unknown }).tutorial;
    delete (input as { confidence?: unknown }).confidence;
    delete (input as { data_save?: unknown }).data_save;

    expect(parseExperimentConfig(input)).toMatchObject({
      tutorial: { enabled: false },
      confidence: {
        required: true,
        scale: [1, 2, 3, 4, 5],
        labels: {
          "1": "Very unsure",
          "5": "Very sure",
        },
      },
      dataSave: {
        mode: "copy",
        filenamePrefix: "layout-task",
      },
    });
  });

  it("rejects non-fixed order in v1", () => {
    const input = baseExperiment();
    (input as { order: string }).order = "random";

    expect(() => parseExperimentConfig(input)).toThrow(/order/i);
  });

  it("rejects invalid confidence scales", () => {
    const input = baseExperiment();
    input.confidence.scale = [0, 1, 2];

    expect(() => parseExperimentConfig(input)).toThrow(/confidence/i);
  });

  it("requires at least one formal trial", () => {
    const input = baseExperiment();
    input.trials = [];

    expect(() => parseExperimentConfig(input)).toThrow(/trials/i);
  });
});
