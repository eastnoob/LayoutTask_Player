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

  it("accepts a tutorial reference board with four named dual-animation items", () => {
    const input = baseExperiment();
    (input as { tutorial: unknown }).tutorial = {
      enabled: true,
      referenceBoard: {
        enabled: true,
        items: [
          {
            id: "m01",
            name: "Armchairs and Coffee Table",
            allSvg: "assets/tutorial-reference/tutorial/whole/svg/armchairAndTeatable.svg",
            variableSvg: "assets/tutorial-reference/tutorial/variable/svg/armchairAndTeatable.svg",
            allAnimation: "assets/tutorial-reference/tutorial/whole/armchairAndTeatable.gif",
            variableAnimation: "assets/tutorial-reference/tutorial/variable/armchairAndTeatable.gif",
          },
          {
            id: "m03",
            name: "Dining Table and Chairs",
            allSvg: "assets/tutorial-reference/tutorial/whole/svg/diningTable.svg",
            variableSvg: "assets/tutorial-reference/tutorial/variable/svg/dining tablle_VARIABLE.svg",
            allAnimation: "assets/tutorial-reference/tutorial/whole/diningTable.gif",
            variableAnimation: "assets/tutorial-reference/tutorial/variable/dining tablle_VARIABLE.gif",
          },
          {
            id: "m04",
            name: "Bookcase",
            allSvg: "assets/tutorial-reference/tutorial/whole/svg/shortBookShelf.svg",
            variableSvg: "assets/tutorial-reference/tutorial/variable/svg/shortBookShelf.svg",
            allAnimation: "assets/tutorial-reference/tutorial/whole/shortBookShelf.gif",
            variableAnimation: "assets/tutorial-reference/tutorial/variable/shortBookShelf.gif",
          },
          {
            id: "m05",
            name: "Sofa and Coffee Table",
            allSvg: "assets/tutorial-reference/tutorial/whole/svg/sofaAndTeatable_FIXED.svg",
            variableSvg: "assets/tutorial-reference/tutorial/variable/svg/sofaAndTeatable_VARIABLE.svg",
            allAnimation: "assets/tutorial-reference/tutorial/whole/sofaAndTeatable_FIXED.gif",
            variableAnimation: "assets/tutorial-reference/tutorial/variable/sofaAndTeatable_VARIABLE.gif",
          },
        ],
      },
    };

    const board = parseExperimentConfig(input).tutorial.referenceBoard;

    expect(board).toMatchObject({
      enabled: true,
      continueLabel: "Continue",
      items: expect.arrayContaining([
        expect.objectContaining({
          id: "m01",
          name: "Armchairs and Coffee Table",
          allSvg: "assets/tutorial-reference/tutorial/whole/svg/armchairAndTeatable.svg",
          variableSvg: "assets/tutorial-reference/tutorial/variable/svg/armchairAndTeatable.svg",
          allAnimation: "assets/tutorial-reference/tutorial/whole/armchairAndTeatable.gif",
          variableAnimation: "assets/tutorial-reference/tutorial/variable/armchairAndTeatable.gif",
        }),
      ]),
    });
    expect(board?.items).toHaveLength(4);
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
