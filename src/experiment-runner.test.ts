import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import InstructionsPlugin from "@jspsych/plugin-instructions";
import LayoutTaskPlugin from "./plugins/jspsych-layout-task";
import {
  buildExperimentTimeline,
  isTutorialTrial,
  collectTutorialTrialResult,
  collectFormalTrialResults,
  createSavingPageHtml,
  createRunnableExperiment,
  startReferenceBoardContinueCountdown,
  saveExperimentFiles,
  createRecoveryOutput,
  formatRewardSummary,
  getExperimentStudyCopyOptions,
  getFormalTrialOrder,
  shouldShowCompletionCodeGate,
  requestAssignment,
} from "./experiment-runner";
import type { ExperimentConfig } from "./types/experiment";
import { parseExperimentConfig } from "./schemas/experiment.schema";
import { initJsPsych } from "jspsych";
import { createPresentationSchedule, generateWilliamsBaseSequences } from "./core/schedule-generator";
import { createMemoryLocalBackupStore } from "./core/local-backup-store";
import { DataSaveService } from "./core/data-save-service";
import { createConsentRecord } from "./core/experiment-consent";

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
    referenceMode: "preview_10s",
    baseUrl: "/layout-task-generated/",
    locale: "en-US",
    completionCodeGate: { enabled: false, minDisplayMs: 15_000 },
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

function receiverDataSave(): Extract<ExperimentConfig["dataSave"], { mode: "receiver" }> {
  const dataSave = receiverExperimentConfig().dataSave;
  if (dataSave.mode !== "receiver") throw new Error("test receiver config must use receiver mode");
  return dataSave;
}

describe("buildExperimentTimeline", () => {
  it("uses the Chinese release configs as the default experiment entries", () => {
    const productionRaw = JSON.parse(readFileSync(resolve("public/experiment/experiment.json"), "utf8"));
    const debugRaw = JSON.parse(readFileSync(resolve("public/experiment/experiment-debug.json"), "utf8"));
    const production = parseExperimentConfig(productionRaw);
    const debug = parseExperimentConfig(debugRaw);

    expect(productionRaw.locale).toBe("zh-CN");
    expect(debugRaw.locale).toBe("zh-CN");
    expect(production.locale).toBe("zh-CN");
    expect(debug.locale).toBe("zh-CN");
    expect(production.completionCodeGate.enabled).toBe(false);
    expect(debug.completionCodeGate.enabled).toBe(false);
  });

  it("provides equivalent English production and debug configurations", () => {
    const productionRaw = JSON.parse(readFileSync(resolve("public/experiment/experiment-en.json"), "utf8"));
    const debugRaw = JSON.parse(readFileSync(resolve("public/experiment/experiment-debug-en.json"), "utf8"));
    const production = parseExperimentConfig(productionRaw);
    const debug = parseExperimentConfig(debugRaw);

    expect(production.locale).toBe("en-US");
    expect(debug.locale).toBe("en-US");
    expect(production.baseUrl).toBe(debug.baseUrl);
    expect(production.schedulePath).toBe(debug.schedulePath);
    expect(production.scheduleVersion).toBe(debug.scheduleVersion);
    expect(production.trials).toHaveLength(23);
    expect(debug.trials).toHaveLength(23);
    expect(productionRaw.data_save.endpoint).toBe("https://datapipe.eastnoob.top/submit");
    expect(debugRaw.data_save.endpoint).toBe("https://datapipe.eastnoob.top/submit");
    expect(production.completionCodeGate.enabled).toBe(false);
    expect(debug.completionCodeGate.enabled).toBe(false);
    for (const config of [production, debug]) {
      expect(config.reward).toMatchObject({
        baseRewardCents: 400,
        movementRewardCents: 4,
        rotationRewardCents: 4,
      });
    }
  });

  it("keeps the Chinese completion gate and the shared pound reward settings", () => {
    const production = parseExperimentConfig(JSON.parse(readFileSync(resolve("public/experiment/experiment-zh.json"), "utf8")));
    const debug = parseExperimentConfig(JSON.parse(readFileSync(resolve("public/experiment/experiment-debug-zh.json"), "utf8")));

    expect(production.locale).toBe("zh-CN");
    expect(debug.locale).toBe("zh-CN");
    expect(production.completionCodeGate.enabled).toBe(true);
    expect(debug.completionCodeGate.enabled).toBe(true);
    for (const config of [production, debug]) {
      expect(config.reward).toMatchObject({
        baseRewardCents: 400,
        movementRewardCents: 4,
        rotationRewardCents: 4,
      });
    }
  });

  it("uses the receiver sequence id instead of deriving sequence from participant number", () => {
    const config = experimentConfig();
    config.trials = Array.from({ length: 23 }, (_, index) => ({
      taskId: `scene_${String(index + 1).padStart(3, "0")}`,
      qid: `Q${String(index + 1).padStart(3, "0")}`,
    }));
    config.schedule = createPresentationSchedule(generateWilliamsBaseSequences(config.trials.map((trial) => trial.taskId)));
    const sequenceSix = config.schedule.sequences.find((sequence) => sequence.sequenceId === 6)!;
    const timeline = buildExperimentTimeline(config, {
      assignment: {
        assignmentId: "a6",
        participantNumber: 47,
        sequenceId: "6",
        scheduleVersion: "v1",
      },
      requireAssignment: true,
    });
    const formal = timeline.filter((trial) => trial.type === LayoutTaskPlugin && trial.tutorialMode !== true);
    expect(formal[0].presentation).toEqual(sequenceSix.presentations[0]);
    expect(formal.at(-1)!.presentation).toEqual(sequenceSix.presentations.at(-1));
  });

  it("passes one assigned experiment identity to tutorial and formal trial saves", () => {
    const timeline = buildExperimentTimeline(receiverExperimentConfig(), {
      participantId: "P047",
      sessionId: "EXPERIMENT_SESSION",
      assignment: {
        assignmentId: "assign-47", participantNumber: 47, sequenceId: "6", scheduleVersion: "schedule-v1",
        assignmentMode: "replacement", requestedSequenceId: "6", replacementAttempt: 2, rotationIndex: null,
      },
    });
    const taskTrials = timeline.filter((trial) => trial.type === LayoutTaskPlugin);
    expect(taskTrials).toHaveLength(3);
    for (const trial of taskTrials) {
      expect(trial.dataSave).toMatchObject({
        mode: "receiver", participant_id: "P047", session_id: "EXPERIMENT_SESSION",
        assignment: {
          assignment_id: "assign-47", participant_number: 47, sequence_id: "6", schedule_version: "schedule-v1",
          assignment_mode: "replacement", requested_sequence_id: "6", replacement_attempt: 2, rotation_index: null,
        },
      });
    }
    expect(taskTrials[0].dataSave.expected_presentation).toBeUndefined();
    for (const trial of taskTrials.slice(1)) {
      expect(trial.dataSave.expected_presentation).toEqual(trial.presentation);
    }
  });

  it("uses the same v2 trial identity for developer saves without a formal slot", () => {
    const timeline = buildExperimentTimeline(receiverExperimentConfig(), {
      developerMode: true,
      participantId: "DEBUG",
      participantNumber: 47,
      sessionId: "DEBUG_SESSION",
    });
    const taskTrials = timeline.filter((trial) => trial.type === LayoutTaskPlugin);
    expect(taskTrials).toHaveLength(3);
    expect(taskTrials.every((trial) => trial.dataSave.participant_id === "9999" && trial.dataSave.assignment)).toBe(true);
    expect(taskTrials[0].dataSave.assignment).toEqual({
      assignment_id: "developer-9999",
      participant_number: 9999,
      sequence_id: "developer",
      schedule_version: "developer",
      assignment_mode: "developer",
      requested_sequence_id: null,
      replacement_attempt: 0,
      rotation_index: null,
    });
  });

  it("uses the assigned participant number to select the configured sequence", () => {
    const config = experimentConfig();
    config.schedule = createPresentationSchedule(
      generateWilliamsBaseSequences(config.trials.map((trial) => trial.taskId)),
    );
    const timeline = buildExperimentTimeline(config, { assignment: {
      assignmentId: "a1",
      participantNumber: 2,
      sequenceId: String(config.schedule.sequences[1].sequenceId),
      scheduleVersion: "v1",
    } });
    const formal = timeline.filter((trial) => trial.type === LayoutTaskPlugin && trial.tutorialMode !== true);
    expect(formal[0].presentation).toEqual(config.schedule.sequences[1].presentations[0]);
  });

  it("rejects a formal timeline when assignment is explicitly required but missing", () => {
    const config = experimentConfig();
    config.schedule = createPresentationSchedule(generateWilliamsBaseSequences(config.trials.map((trial) => trial.taskId)));
    expect(() => buildExperimentTimeline(config, { requireAssignment: true })).toThrow("Formal assignment is required");
  });

  it("rejects a formal assignment whose returned sequence is absent", () => {
    const config = experimentConfig();
    config.schedule = createPresentationSchedule(generateWilliamsBaseSequences(config.trials.map((trial) => trial.taskId)));
    expect(() => buildExperimentTimeline(config, {
      assignment: { assignmentId: "bad", participantNumber: 1, sequenceId: "999", scheduleVersion: "v1" },
      requireAssignment: true,
    })).toThrow("missing from the configured schedule");
  });
  it("only enables the completion-code gate for explicit Chinese configuration", () => {
    const english = experimentConfig();
    expect(shouldShowCompletionCodeGate(english)).toBe(false);

    const disabledChinese = { ...english, locale: "zh-CN" as const };
    expect(shouldShowCompletionCodeGate(disabledChinese)).toBe(false);

    expect(shouldShowCompletionCodeGate({
      ...disabledChinese,
      completionCodeGate: { enabled: true, minDisplayMs: 15_000 },
    })).toBe(true);
  });

  it("uses Chinese participant copy only for Chinese experiments", () => {
    const chinese = { ...experimentConfig(), locale: "zh-CN" as const };
    const chineseTimeline = buildExperimentTimeline(chinese);
    const intro = String(chineseTimeline[0].pages[0]);
    expect(intro).toContain("观察透视图，尽可能在平面图中还原家具的位置和方向。");
    expect(intro).toContain("教程将带你练习编辑、置信度评分、保存、放大镜和暂停。");
    expect(intro).not.toContain("图片显示在页面顶部");
    expect(chineseTimeline[0].button_label_next).toBe("开始教程");
    expect(String(chineseTimeline[2].pages[0])).toContain("这不是考试，而是实验");
    expect(String(chineseTimeline[2].pages[0])).toContain("整个研究大约需要20-45分钟");
    expect(String(chineseTimeline[2].pages[0])).toContain("最多可获得 £12");
    expect(String(chineseTimeline[2].pages[0])).toContain("正式实验期间可暂停一次，最长15分钟");
    expect(String(chineseTimeline[2].pages[0])).not.toContain("ftian@uni-muenster.de");
    expect(String(chineseTimeline[2].pages[0])).toContain("通过 Prolific 的消息系统联系研究者");
    expect(String(chineseTimeline[2].pages[0])).toContain("您可以随时关闭本页面并停止参与。");
    expect(String(chineseTimeline[2].pages[0])).toContain("我们可能会请您在 Prolific 上退回本次提交。退回提交不会对您的 Prolific 账户产生不良影响。");
    expect(String(chineseTimeline[2].pages[0])).not.toContain("您可能因此无法获得报酬。");
    expect(String(chineseTimeline[2].pages[0])).not.toContain("您也不需要为此付出任何代价。");
    expect(String(chineseTimeline[2].pages[0])).not.toContain("您将无法获得承诺报酬");
    expect(String(chineseTimeline[2].pages[0])).not.toContain("floorplanrestoration.deluxe999@passmail.com");

    expect(createSavingPageHtml("zh-CN")).toContain("正在保存数据");
    expect(createSavingPageHtml()).toContain("Saving your data");
  });

  it("shows the configured formal count and exact maximum reward", () => {
    const config = experimentConfig();
    config.trials = Array.from({ length: 23 }, (_, index) => ({ taskId: `scene_${index + 1}`, qid: `Q${index + 1}` }));
    config.schedule = createPresentationSchedule(
      generateWilliamsBaseSequences(config.trials.map((trial) => trial.taskId)),
      ["scene_1"],
      7,
    );
    config.reward = { enabled: true, baseRewardCents: 400, movementRewardCents: 4, rotationRewardCents: 4 };
    config.rewardReference = Object.fromEntries(config.trials.map((trial) => [trial.taskId, {
      qid: trial.qid!,
      objects: Object.fromEntries(["a", "b", "c", "d"].map((suffix) => [
        `${trial.taskId}-${suffix}`,
        { role: "variable", target: { relative: { dx_steps: 0, dy_steps: 0, rotation_steps: 0 } } },
      ])),
    }]));

    expect(getExperimentStudyCopyOptions(config)).toMatchObject({ formalTaskCount: 24, maximumRewardCents: 1168 });
    const complete = String(buildExperimentTimeline(config)[2].pages[0]);
    expect(complete).toContain("24 tasks; the tutorial is not included in this count.");
    expect(complete).toContain("£11.68");
    expect(complete).not.toContain("£12");
  });

  it("uses one concise bilingual opening task and body without duplicate headers", () => {
    const englishIntro = String(buildExperimentTimeline(experimentConfig())[0].pages[0]);
    const chineseIntro = String(buildExperimentTimeline({ ...experimentConfig(), locale: "zh-CN" as const })[0].pages[0]);

    for (const [intro, task, body] of [
      [englishIntro, "Study the perspective image and reconstruct the furniture positions and orientations on the floor plan.", "The tutorial guides you through editing, confidence ratings, saving, the magnifier, and Pause."],
      [chineseIntro, "观察透视图，尽可能在平面图中还原家具的位置和方向。", "教程将带你练习编辑、置信度评分、保存、放大镜和暂停。"],
    ] as const) {
      expect(intro).toContain(task);
      expect(intro).toContain(body);
      expect(intro).not.toContain("layout-task-meta");
      expect(intro.match(/layout-task-tutorial-task/g)).toHaveLength(1);
    }
  });

  it("uses the cross-language withdrawal and contact wording", () => {
    const english = buildExperimentTimeline(experimentConfig());
    const complete = String(english[2].pages[0]);
    expect(complete).toContain("approximately 20-45 minutes");
    expect(complete).toContain("you may stop participating at any time by closing this page.");
    expect(complete).toContain("We may ask you to return your submission on Prolific. Returning a submission will not negatively affect your Prolific account.");
    expect(complete).not.toContain("You may not receive payment as a result of this.");
    expect(complete).not.toContain("You will not be penalized or incur any cost.");
    expect(complete).not.toContain("you will not receive the promised compensation");
    expect(complete).toContain("maximum £12 in total");
    expect(complete).toContain("During the formal experiment, you may pause once for up to 15 minutes.");
    expect(complete).not.toContain("ftian@uni-muenster.de");
    expect(complete).toContain("contact the researcher through Prolific's messaging system");
    expect(complete).not.toContain("floorplanrestoration.deluxe999@passmail.com");
  });

  it("recognizes tutorial trials from the started trial callback data", () => {
    expect(isTutorialTrial({ data: { tutorial: true } })).toBe(true);
    expect(isTutorialTrial({ data: { tutorial_reference_board: true } })).toBe(false);
    expect(isTutorialTrial({ data: { tutorial: false } })).toBe(false);
  });
  it("passes the developer shortcut only when explicitly enabled", () => {
    const normal = buildExperimentTimeline(experimentConfig());
    const debug = buildExperimentTimeline(experimentConfig(), { developerMode: true });

    expect(normal.filter((trial) => trial.type === LayoutTaskPlugin).every((trial) => trial.developerMode !== true)).toBe(true);
    expect(debug.filter((trial) => trial.type === LayoutTaskPlugin).every((trial) => trial.developerMode === true)).toBe(true);
  });

  it("wires readiness callbacks only to interactive Layout Task trials", () => {
    const ready = vi.fn();
    const timeline = buildExperimentTimeline(experimentConfig(), { onTaskReady: ready } as never);
    const taskTrials = timeline.filter((trial) => trial.type === LayoutTaskPlugin);
    const nonTaskTrials = timeline.filter((trial) => trial.type !== LayoutTaskPlugin);

    expect(taskTrials).not.toHaveLength(0);
    expect(taskTrials.every((trial) => typeof trial.onReady === "function")).toBe(true);
    expect(nonTaskTrials.every((trial) => trial.onReady === undefined)).toBe(true);
  });

  it("keeps the real static flow split between tutorial and 23 formal trials", () => {
    const config = parseExperimentConfig(
      JSON.parse(readFileSync(resolve(process.cwd(), "public/experiment/experiment.json"), "utf8")),
    );
    const timeline = buildExperimentTimeline(config);
    const layoutTaskTrials = timeline.filter((trial) => trial.type === LayoutTaskPlugin);
    const tutorialTrial = layoutTaskTrials.find((trial) => trial.tutorialMode === true);
    const boardPages = timeline.filter((trial) => trial.data?.tutorial_reference_board);

    expect(config.referenceMode).toBe("persistent");
    expect(config.tutorial.baseUrl).toContain("layout-task-run12-core23-persistent/tutorial");
    expect(config.baseUrl).toContain("layout-task-run12-core23-persistent");
    expect(config.trials).toHaveLength(23);
    expect(tutorialTrial).toMatchObject({
      baseUrl: config.tutorial.baseUrl,
      taskId: "scene_edc634ac7856",
      writeEncodedToData: true,
      writeResultToData: true,
    });
    expect(layoutTaskTrials.filter((trial) => trial.tutorialMode !== true)).toHaveLength(23);
    expect(layoutTaskTrials.filter((trial) => trial.tutorialMode !== true).every((trial) => trial.baseUrl === config.baseUrl)).toBe(true);
    expect(boardPages).toHaveLength(0);
    expect(tutorialTrial?.tutorialReferenceBoard.pages).toHaveLength(4);
    expect(tutorialTrial?.tutorialReferenceBoard.pages.every((page: string) => page.includes("layout-task-run12-core23-persistent/tutorial"))).toBe(true);
  });

  it("passes persistent mode to the tutorial and every formal trial", () => {
    const config = experimentConfig();
    config.referenceMode = "persistent";
    const timeline = buildExperimentTimeline(config);
    const tasks = timeline.filter((trial) => trial.type === LayoutTaskPlugin);

    expect(tasks.every((trial) => trial.referenceMode === "persistent")).toBe(true);
  });

  it("uses the selected 25-presentation schedule and preserves repeat metadata", () => {
    const config = experimentConfig();
    config.trials = Array.from({ length: 23 }, (_, index) => ({
      taskId: `scene_${String(index + 1).padStart(3, "0")}`,
      qid: `Q${String(index + 1).padStart(3, "0")}`,
    }));
    const base = generateWilliamsBaseSequences(config.trials.map((trial) => trial.taskId));
    config.schedule = createPresentationSchedule(base, ["scene_001", "scene_002"], 7);

    const timeline = buildExperimentTimeline(config);
    const formal = timeline.filter((trial) => trial.type === LayoutTaskPlugin && trial.tutorialMode !== true);

    expect(formal).toHaveLength(25);
    expect(formal[0]).toMatchObject({
      taskId: config.schedule.sequences[0].presentations[0].taskId,
      trialIndex: config.schedule.sequences[0].presentations[0].trialIndex,
      trialTotal: 25,
      presentation: config.schedule.sequences[0].presentations[0],
    });
    expect(formal.filter((trial) => trial.presentation?.repeatIndex === 2)).toHaveLength(2);
  });

  it("uses the separate tutorial package only for the interactive tutorial task", () => {
    const config = experimentConfig();
    config.tutorial.baseUrl = "/layout-task-run12-core23-preview/tutorial/";

    const timeline = buildExperimentTimeline(config);

    expect(timeline[1]).toMatchObject({
      type: LayoutTaskPlugin,
      baseUrl: "/layout-task-run12-core23-preview/tutorial/",
      taskId: "tutorial_room",
      writeEncodedToData: true,
      writeResultToData: true,
    });
    expect(timeline[3]).toMatchObject({
      type: LayoutTaskPlugin,
      baseUrl: "/layout-task-generated/",
      taskId: "scene_001",
    });
  });

  it("creates tutorial then formal LayoutTask trials in fixed order", () => {
    const timeline = buildExperimentTimeline(experimentConfig());

    expect(timeline).toHaveLength(5);
    expect(timeline[0]).toMatchObject({
      type: InstructionsPlugin,
      css_classes: "layout-task-tutorial-intro-trial",
      allow_backward: false,
      data: { tutorial_intro: true },
    });
    expect(String(timeline[0].pages[0])).toContain("Study the perspective image and reconstruct the furniture positions and orientations on the floor plan.");
    expect(String(timeline[0].pages[0])).toContain("The tutorial guides you through editing, confidence ratings, saving, the magnifier, and Pause.");
    expect(timeline[1]).toMatchObject({ type: LayoutTaskPlugin, taskId: "tutorial_room", tutorialMode: true });
    expect(timeline[2].pages[0]).toContain("Study image -> Reconstruct scene -> Rate confidence -> Submit");
    expect(timeline[2]).toMatchObject({
      button_label_next: "Start formal experiment",
      css_classes: "layout-task-tutorial-complete-trial",
      data: { tutorial_complete: true },
    });
    expect(String(timeline[2].pages[0])).toContain("layout-task-tutorial-complete-shell");
    expect(String(timeline[2].pages[0])).toContain("Study image -> Reconstruct scene -> Rate confidence -> Submit");
    expect(String(timeline[2].pages[0])).toContain("This is an experiment, not a test");
    expect(String(timeline[2].pages[0])).toContain("During the formal experiment, you may pause once for up to 15 minutes.");
    expect(String(timeline[2].pages[0])).toContain("stop participating at any time by closing this page");
    expect(String(timeline[2].pages[0])).toContain("truthfully");
    expect(timeline[3]).toMatchObject({ type: LayoutTaskPlugin, taskId: "scene_001", qid: "Q001" });
    expect(timeline[4]).toMatchObject({ type: LayoutTaskPlugin, taskId: "scene_002", qid: "Q002" });
  });

  it("shows the reference board before the interactive tutorial room", () => {
    const config = experimentConfig();
    config.tutorial.baseUrl = "/layout-task-run12-core23-preview/tutorial/";
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

    expect(timeline.filter((trial) => trial.data?.tutorial_reference_board)).toHaveLength(0);
    expect(timeline[1]).toMatchObject({
      type: LayoutTaskPlugin, taskId: "tutorial_room", tutorialMode: true,
      tutorialReferenceBoard: { continueLabel: "Continue", pages: expect.any(Array) },
    });
    const pages = timeline[1].tutorialReferenceBoard.pages;
    expect(pages).toHaveLength(4);
    expect(pages[0]).toContain("/layout-task-run12-core23-preview/tutorial/assets/tutorial-reference/tutorial/whole/m01.gif");
    expect(pages[0]).toContain("/layout-task-run12-core23-preview/tutorial/assets/tutorial-reference/tutorial/variable/m01.gif");
    expect(pages[0]).toContain("/layout-task-run12-core23-preview/tutorial/assets/tutorial-reference/tutorial/whole/svg/m01.svg");
    expect(pages[0]).toContain(">1 / 4<");
    expect(pages[1]).toContain(">2 / 4<");
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

    expect(timeline.slice(1, 5).every((trial) => trial.type === InstructionsPlugin)).toBe(true);
    expect(timeline[0]).toMatchObject({ button_label_next: "Start tutorial" });
    expect(timeline[1]).toMatchObject({ button_label_next: "Continue" });
    expect(timeline[4].data).toEqual({
      tutorial_reference_board: true,
      reference_board_item_id: "m05",
      reference_board_page: 4,
      reference_board_total: 4,
    });
    expect(String(timeline[0].pages[0])).toContain("Study the perspective image and reconstruct the furniture positions and orientations on the floor plan.");
    expect(String(timeline[0].pages[0])).toContain("The tutorial guides you through editing, confidence ratings, saving, the magnifier, and Pause.");
    expect(timeline[5]).toMatchObject({ type: LayoutTaskPlugin, taskId: "scene_001" });
  });

  it("keeps each reference-board continue button locked for five seconds", () => {
    vi.useFakeTimers();
    const nav = { style: { visibility: "hidden" } } as HTMLElement;
    const button = { disabled: false, textContent: "Continue" } as HTMLButtonElement;
    const documentRef = {
      querySelector: vi.fn((selector: string) => {
        if (selector === ".layout-task-reference-board-trial .jspsych-instructions-nav") {
          return nav;
        }
        if (selector === ".layout-task-reference-board-trial #jspsych-instructions-next") {
          return button;
        }
        return null;
      }),
    } as unknown as Document;
    const windowRef = {
      setInterval: globalThis.setInterval.bind(globalThis),
      clearInterval: globalThis.clearInterval.bind(globalThis),
    } as unknown as Window;

    try {
      startReferenceBoardContinueCountdown({ documentRef, windowRef, label: "Continue", seconds: 5 });

      expect(nav.style.visibility).toBe("visible");
      expect(button.disabled).toBe(true);
      expect(button.textContent).toBe("Continue (5)");

      vi.advanceTimersByTime(4_000);
      expect(button.disabled).toBe(true);
      expect(button.textContent).toBe("Continue (1)");

      vi.advanceTimersByTime(1_000);
      expect(button.disabled).toBe(false);
      expect(button.textContent).toBe("Continue");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("requestAssignment", () => {
  it("sends the requested sequence to the receiver", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      assignment_id: "a1",
      participant_number: 1,
      sequence_id: "6",
      schedule_version: "v1",
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await requestAssignment({
      endpoint: "https://data.example.com/submit",
      experimentId: "exp",
      scheduleVersion: "v1",
      sequenceIds: ["1", "6"],
      idempotencyToken: "token-1",
      requestedSequenceId: "6",
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ requested_sequence_id: "6" });
    vi.unstubAllGlobals();
  });
});

describe("createRunnableExperiment", () => {
  it("does not send incomplete metadata before participant fields are available", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchImpl);
    try {
      createRunnableExperiment(receiverExperimentConfig(), undefined, {
        participantId: "P047", localBackup: createMemoryLocalBackupStore("incomplete"),
        assignment: { assignmentId: "assign-47", participantNumber: 47, sequenceId: "6", scheduleVersion: "v1" },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("starts one immutable metadata upload after bootstrap without waiting or adding timeline steps", async () => {
    const values = new Map<string, string>();
    const backup = createMemoryLocalBackupStore("metadata-start");
    const consent = createConsentRecord({ locale: "en-US", mode: "agreed", consentedAt: "2026-11-07T12:00:00.000Z" });
    const participantProfile = { participant_age: 31, participant_sex_assigned_at_birth: "female" as const, requires_corrective_eyewear: true };
    let finishUpload!: (response: Response) => void;
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const stored = JSON.parse(values.get("layouttask:session:layout_task_v1:P047")!);
      expect(body.session_id).toBe(stored.session_id);
      expect(await backup.listFiles()).toEqual([{
        filename: `layouttask_session_metadata_${stored.session_id}.json`,
        contentType: "application/json",
        data: body.files[0].data,
      }]);
      return new Promise<Response>((resolve) => { finishUpload = resolve; });
    });
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    vi.stubGlobal("fetch", fetchImpl);
    const assignment = { assignmentId: "assign-47", participantNumber: 47, sequenceId: "6", scheduleVersion: "v1", assignmentMode: "replacement" as const, requestedSequenceId: "6", replacementAttempt: 2, rotationIndex: null };
    try {
      const { timeline } = createRunnableExperiment(receiverExperimentConfig(), undefined, {
        participantId: "P047", assignment, localBackup: backup, prolificId: " original-id ", consent, participantProfile,
      });
      expect(timeline).toHaveLength(buildExperimentTimeline(receiverExperimentConfig(), { assignment }).length);
      expect(initJsPsych).toHaveBeenCalledWith(expect.objectContaining({ on_trial_start: expect.any(Function), on_finish: expect.any(Function) }));
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
      const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
      expect(fetchImpl.mock.calls[0][0]).toBe("https://data.example.com/submit");
      expect(body).toEqual({
        schema: "layouttask.receiver.submission.v2", submission_kind: "metadata",
        experiment_id: "layout_task_v1", participant_id: "P047", session_id: expect.any(String),
        assignment_id: "assign-47", participant_number: 47, sequence_id: "6", schedule_version: "v1",
        assignment_mode: "replacement", requested_sequence_id: "6", replacement_attempt: 2, rotation_index: null,
        files: [{ filename: `layouttask_session_metadata_${body.session_id}.json`, content_type: "application/json", data: expect.any(String) }],
      });
      const { files: _files, schema: _schema, submission_kind: _kind, ...identity } = body;
      expect(JSON.parse(body.files[0].data)).toEqual({ schema: "layouttask.session-metadata.v1", ...identity, prolific_id: " original-id ", participant_profile: participantProfile, consent });
      const pause = timeline.find((trial) => trial.type === LayoutTaskPlugin && !trial.tutorialMode)!.pause;
      pause.requestPause();
      createRunnableExperiment(receiverExperimentConfig(), undefined, { participantId: "P047", assignment, localBackup: backup, prolificId: "changed", consent, participantProfile });
      await Promise.resolve();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      finishUpload?.(new Response("{}", { status: 201 }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      vi.unstubAllGlobals();
    }
  });

  it("contains rejected local metadata writes at bootstrap and pause without blocking the timeline", async () => {
    const backup = createMemoryLocalBackupStore("rejected-metadata");
    backup.saveSessionMetadata = async () => { throw new Error("IndexedDB denied"); };
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    try {
      const { timeline } = createRunnableExperiment(receiverExperimentConfig(), undefined, { participantId: "P047", localBackup: backup });
      timeline.find((trial) => trial.type === LayoutTaskPlugin && !trial.tutorialMode)!.pause.requestPause();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(timeline.filter((trial) => trial.type === LayoutTaskPlugin)).toHaveLength(3);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

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

  it("passes its bootstrapped session ID into trial save configuration", () => {
    const previousSessionStorage = globalThis.sessionStorage;
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
    });
    try {
      const { timeline } = createRunnableExperiment(receiverExperimentConfig(), undefined, { participantId: "P047" });
      const stored = JSON.parse(values.get("layouttask:session:layout_task_v1:P047")!);
      const tasks = timeline.filter((trial) => trial.type === LayoutTaskPlugin);
      expect(tasks).toHaveLength(3);
      expect(tasks.every((trial) => trial.dataSave.session_id === stored.session_id)).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: previousSessionStorage });
    }
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

describe("formatRewardSummary", () => {
  it("renders pound-denominated payment and correctness totals", () => {
    const text = formatRewardSummary({
      enabled: true,
      baseRewardCents: 400,
      earnedRewardCents: 28,
      totalRewardCents: 428,
      formalTrialCount: 25,
      rewardedGroupCount: 100,
      correctPositionCount: 12,
      correctRotationCount: 10,
      fullyCorrectCount: 8,
      fullyFailedCount: 4,
      scorableGroupCount: 20,
    }, "en-US");

    expect(text).toContain("£4.00");
    expect(text).toContain("£0.28");
    expect(text).toContain("£4.28");
    expect(text).toContain("12");
    expect(text).toContain("10");
    expect(text).toContain("8");
    expect(text).toContain("4");
  });
});

describe("formal trial order", () => {
  it("keeps repeated presentations in the exported order", () => {
    expect(getFormalTrialOrder([
      { trialType: "formal", taskId: "scene-a", presentation: undefined },
      { trialType: "formal", taskId: "scene-b", presentation: undefined },
      { trialType: "formal", taskId: "scene-a", presentation: undefined },
    ])).toEqual(["scene-a", "scene-b", "scene-a"]);
  });
});

describe("collectFormalTrialResults", () => {
  it("keeps encoded and result fields for formal trials only", () => {
    const results = collectFormalTrialResults([
      { tutorial: true, trial_type: "tutorial", task_id: "tutorial_room" },
      { formal: true, trial_type: "formal", task_id: "scene_001", qid: "Q001", encoded: "ENC1", result: { task_id: "scene_001" } },
    ]);

    expect(results).toEqual([
      {
        trialType: "formal",
        taskId: "scene_001",
        qid: "Q001",
        encoded: "ENC1",
        result: { task_id: "scene_001" },
      },
    ]);
  });
});

describe("trial classification", () => {
  const tutorialResult = { schema: "layouttask.result.v1", task_id: "tutorial_room" };

  it("collects an explicitly classified tutorial result and preserves its payload", () => {
    const rows = [
      {
        tutorial: true,
        trial_type: "tutorial",
        task_id: "tutorial_room",
        qid: "QTUTORIAL",
        encoded: "TUTORIAL_ENC",
        hash8: "TUT_HASH",
        result: tutorialResult,
      },
      { formal: true, trial_type: "formal", task_id: "scene_001", encoded: "FORMAL_1" },
      { formal: true, trial_type: "formal", task_id: "scene_002", encoded: "FORMAL_2" },
    ];

    expect(collectTutorialTrialResult(rows)).toEqual({
      trialType: "tutorial",
      taskId: "tutorial_room",
      qid: "QTUTORIAL",
      encoded: "TUTORIAL_ENC",
      hash8: "TUT_HASH",
      result: tutorialResult,
    });
    expect(collectFormalTrialResults(rows)).toEqual([
      expect.objectContaining({ trialType: "formal", taskId: "scene_001" }),
      expect.objectContaining({ trialType: "formal", taskId: "scene_002" }),
    ]);
  });

  it("ignores an unclassified row instead of inferring it as formal", () => {
    expect(
      collectFormalTrialResults([
        { task_id: "scene_unclassified", encoded: "ENCODED", result: { task_id: "scene_unclassified" } },
      ]),
    ).toEqual([]);
  });

  it("lets explicit trial_type metadata win over legacy boolean flags", () => {
    expect(
      collectFormalTrialResults([
        { tutorial: true, trial_type: "formal", task_id: "scene_001", encoded: "FORMAL_1" },
      ]),
    ).toEqual([expect.objectContaining({ trialType: "formal", taskId: "scene_001" })]);
  });
});

describe("saveExperimentFiles", () => {
  it.each([201, 409])("retries pending metadata before final and preserves local backup on metadata status %s", async (metadataStatus) => {
    const backup = createMemoryLocalBackupStore("P001:S001");
    const config = receiverExperimentConfig().dataSave;
    const assignment = { assignmentId: "assign-1", participantNumber: 1, sequenceId: "1", scheduleVersion: "v1", rotationIndex: 0 };
    const service = new DataSaveService({ config: {
      mode: "receiver", experiment_id: "layout_task_v1", participant_id: "P001", session_id: "S001",
      endpoint: "https://data.example.com/submit", filename_prefix: "layout-task", payload_format: "json-envelope", save_encoded: true, save_result: false,
      assignment: { assignment_id: "assign-1", participant_number: 1, sequence_id: "1", schedule_version: "v1", assignment_mode: "automatic", requested_sequence_id: null, replacement_attempt: 0, rotation_index: 0 },
    }, localBackup: backup, fetchImpl: async () => new Response("{}", { status: 503 }) });
    await service.saveSessionMetadata({ prolificId: "original", consent: createConsentRecord({ locale: "en-US", mode: "agreed", consentedAt: "2026-11-07T12:00:00.000Z" }), participantProfile: { participant_age: 31, requires_corrective_eyewear: true } });
    const metadata = (await backup.listFiles())[0];
    const requests: any[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      return new Response(JSON.stringify(String(url).endsWith("/archive") ? { ok: true, data_complete: true } : {}), {
        status: body.submission_kind === "metadata" ? metadataStatus : 202,
      });
    };
    const files = [{ filename: "results.csv", contentType: "text/csv", data: "unchanged\r\n" }];
    const result = await saveExperimentFiles({ dataSave: config, participantId: "P001", sessionId: "S001", assignment, files, localBackup: backup, fetchImpl });
    expect(result).toEqual({ ok: true, saved: 1 });
    expect(requests.map((body) => body.submission_kind ?? body.schema)).toEqual(["metadata", "final", "layouttask.receiver.archive.v1"]);
    expect(requests[0].files[0].data).toBe(metadata.data);
    expect(requests[1].files).toEqual([{ filename: "results.csv", content_type: "text/csv", data: "unchanged\r\n" }]);
    expect(await backup.listFiles()).toEqual(metadataStatus === 201 ? [] : [metadata, files[0]]);
  });

  it("replays an existing unacknowledged trial envelope byte for byte before final and archive", async () => {
    const backup = createMemoryLocalBackupStore("P001:S001");
    const identity = { experiment_id: "layout_task_v1", participant_id: "P001", session_id: "S001", assignment_id: "assign-1", participant_number: 1, sequence_id: "1", schedule_version: "v1", assignment_mode: "automatic", requested_sequence_id: null, replacement_attempt: 0, rotation_index: 0 };
    const trial = { filename: "layout-task_room_Q1_TRIAL.json", contentType: "application/json", data: JSON.stringify({ schema: "layouttask.backup.v2", saved_at: "2026-11-07T12:00:00.000Z", ...identity, trial_session_id: "TRIAL", trial_type: "formal", trial_index: 1, task_id: "room", qid: "Q1", presentation_id: "seq1-trial1", hash8: "HASH0001", encoding: "plain-json", encoded: "ENCODED", pause: { pause_used: false } }) };
    await backup.saveFile(trial);
    const requests: Array<{ url: string; body: any }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(String(url).endsWith("/archive") ? { ok: true, data_complete: true } : {}), { status: 201 });
    };
    const files = [{ filename: "results.csv", contentType: "text/csv", data: "qid\nq1\n" }];
    const result = await saveExperimentFiles({ dataSave: receiverExperimentConfig().dataSave, participantId: "P001", sessionId: "S001", assignment: { assignmentId: "assign-1", participantNumber: 1, sequenceId: "1", scheduleVersion: "v1", rotationIndex: 0 }, files, localBackup: backup, fetchImpl });
    expect(result).toEqual({ ok: true, saved: 1 });
    expect(requests.map(({ body }) => body.submission_kind ?? body.schema)).toEqual(["trial", "final", "layouttask.receiver.archive.v1"]);
    expect(requests[0].body).toEqual({ schema: "layouttask.receiver.submission.v2", submission_kind: "trial", ...identity, trial_session_id: "TRIAL", trial_type: "formal", trial_index: 1, task_id: "room", qid: "Q1", presentation_id: "seq1-trial1", hash8: "HASH0001", encoding: "plain-json", encoded: "ENCODED", files: [{ filename: trial.filename, content_type: "application/json", data: trial.data }] });
    expect(requests[1].body.files).toEqual([{ filename: "results.csv", content_type: "text/csv", data: "qid\nq1\n" }]);
    expect(await backup.listFiles()).toEqual([]);
  });

  it("retains trial and final backups when the trial replay is still rejected", async () => {
    const backup = createMemoryLocalBackupStore("P001:S001");
    const trial = { filename: "trial.json", contentType: "application/json", data: JSON.stringify({ schema: "layouttask.backup.v1", task_id: "room", qid: "Q1", session: "TRIAL", hash8: "HASH0001", encoding: "plain-json", encoded: "ENCODED" }) };
    await backup.saveFile(trial);
    const requests: any[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      return new Response("{}", { status: body.files?.[0]?.filename === "trial.json" ? 503 : 201 });
    };
    const files = [{ filename: "results.csv", contentType: "text/csv", data: "qid\nq1\n" }];
    const result = await saveExperimentFiles({ dataSave: receiverExperimentConfig().dataSave, participantId: "P001", sessionId: "S001", files, localBackup: backup, fetchImpl });
    expect(result).toMatchObject({ ok: false, failedFilename: "trial.json", saved: 1, recoveryZip: expect.any(Blob) });
    expect(requests.some((body) => body.schema === "layouttask.receiver.archive.v1")).toBe(false);
    expect(await backup.listFiles()).toEqual([files[0], trial]);
  });

  it("persists final files before receiver upload and clears them after archive success", async () => {
    const backup = createMemoryLocalBackupStore("P001:S001");
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith("/archive")
      ? new Response(JSON.stringify({ ok: true, data_complete: true }), { status: 201 })
      : ({ ok: true, status: 201, statusText: "Created" })) as unknown as typeof fetch;
    const files = [{ filename: "results.csv", contentType: "text/csv", data: "qid\nq1\n" }];

    const result = await saveExperimentFiles({
      dataSave: receiverExperimentConfig().dataSave,
      files,
      participantId: "P001",
      sessionId: "S001",
      fetchImpl,
      localBackup: backup,
    });

    expect(result).toEqual({ ok: true, saved: 1 });
    expect(await backup.listFiles()).toEqual([]);
  });

  it("builds recovery data from all local files when receiver archive fails", async () => {
    const backup = createMemoryLocalBackupStore("P001:S001");
    await backup.saveFile({ filename: "trial.json", contentType: "application/json", data: '{"trial":1}' });
    let archiveAttempts = 0;
    const fetchImpl = async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/archive")) {
        archiveAttempts += 1;
        return new Response(JSON.stringify({ error: "archive_unavailable" }), { status: 503, statusText: "Unavailable" });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    };

    const result = await saveExperimentFiles({
      dataSave: receiverExperimentConfig().dataSave,
      files: [{ filename: "results.csv", contentType: "text/csv", data: "qid\nq1\n" }],
      participantId: "P001",
      sessionId: "S001",
      fetchImpl,
      localBackup: backup,
    });

    expect(archiveAttempts).toBe(2);
    expect(result.recoveryZip).toBeInstanceOf(Blob);
    expect(await backup.listFiles()).toHaveLength(2);
  });

  it("posts one batch submission to the self-hosted receiver", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith("/archive")
      ? new Response(JSON.stringify({ ok: true, data_complete: true }), { status: 201 })
      : ({ ok: true, status: 201, statusText: "Created" })) as unknown as typeof fetch;
    const assignment = {
      assignmentId: "assign-1",
      participantNumber: 47,
      sequenceId: "6",
      scheduleVersion: "v1",
      assignmentMode: "replacement" as const,
      requestedSequenceId: "6",
      replacementAttempt: 1,
      rotationIndex: null,
    };

    const result = await saveExperimentFiles({
      dataSave: receiverExperimentConfig().dataSave,
      participantId: "P001",
      prolificId: " 5f2a-original ",
      sessionId: "S001",
      assignment,
      files: [
        { filename: "layout-task_session_P001_S001.csv", contentType: "text/csv", data: "a\n1\n" },
        { filename: "layout-task_results_P001_S001.csv", contentType: "text/csv", data: "b\n2\n" },
        { filename: "layout-task_events_P001_S001.csv", contentType: "text/csv", data: "c\n3\n" },
        { filename: "layout-task_debug_P001_S001.json", contentType: "application/json", data: "{}" },
        { filename: "layout-task_tutorial_result_P001_S001.json", contentType: "application/json", data: '{"tutorial":true}' },
      ],
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, saved: 5 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
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
      schema: "layouttask.receiver.submission.v2",
      submission_kind: "final",
      experiment_id: "layout_task_v1",
      participant_id: "P001",
      prolific_id: " 5f2a-original ",
      session_id: "S001",
      assignment_id: "assign-1",
      participant_number: 47,
      sequence_id: "6",
      schedule_version: "v1",
      assignment_mode: "replacement",
      requested_sequence_id: "6",
      replacement_attempt: 1,
      rotation_index: null,
      files: [
        { filename: "layout-task_session_P001_S001.csv", content_type: "text/csv", data: "a\n1\n" },
        { filename: "layout-task_results_P001_S001.csv", content_type: "text/csv", data: "b\n2\n" },
        { filename: "layout-task_events_P001_S001.csv", content_type: "text/csv", data: "c\n3\n" },
        { filename: "layout-task_debug_P001_S001.json", content_type: "application/json", data: "{}" },
        { filename: "layout-task_tutorial_result_P001_S001.json", content_type: "application/json", data: '{"tutorial":true}' },
      ],
    });
    expect(body).not.toHaveProperty("trial_session_id");
    expect(body).not.toHaveProperty("trial_index");
    expect(body).not.toHaveProperty("presentation_id");
    expect(JSON.parse(String((fetchImpl as never as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[1][1].body)).schema).toBe(
      "layouttask.receiver.archive.v1",
    );
    expect(JSON.parse(String((fetchImpl as never as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[1][1].body))).toMatchObject({
      assignment_id: "assign-1",
      assignment_mode: "replacement",
      replacement_attempt: 1,
      rotation_index: null,
    });
  });

  it("keeps the final receiver request in the same v2 format in developer mode", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith("/archive")
      ? new Response(JSON.stringify({ ok: true, data_complete: true }), { status: 201 })
      : ({ ok: true, status: 201, statusText: "Created" })) as unknown as typeof fetch;
    const result = await saveExperimentFiles({
      dataSave: { ...receiverDataSave(), experimentId: "layout_task_v1_debug" },
      files: [{ filename: "results.csv", contentType: "text/csv", data: "qid\nq1\n" }],
      participantId: "9999",
      sessionId: "DEBUG_SESSION",
      developerMode: true,
      assignment: { assignmentId: "developer-9999", participantNumber: 9999, sequenceId: "developer", scheduleVersion: "developer", assignmentMode: "developer" },
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    const body = JSON.parse(String((fetchImpl as never as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[0][1].body));
    expect(body).toMatchObject({
      schema: "layouttask.receiver.submission.v2",
      submission_kind: "final",
      experiment_id: "layout_task_v1_debug",
      participant_id: "9999",
      session_id: "DEBUG_SESSION",
      assignment_id: "developer-9999",
      participant_number: 9999,
      sequence_id: "developer",
      schedule_version: "developer",
      assignment_mode: "developer",
    });
  });

  it("refuses a developer receiver final save without an isolated developer assignment", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith("/archive")
      ? new Response(JSON.stringify({ ok: true, data_complete: true }), { status: 201 })
      : ({ ok: true, status: 201, statusText: "Created" })) as unknown as typeof fetch;
    const result = await saveExperimentFiles({
      dataSave: { ...receiverDataSave(), experimentId: "layout_task_v1_debug" },
      files: [{ filename: "results.csv", contentType: "text/csv", data: "qid\nq1\n" }],
      participantId: "9999",
      sessionId: "DEBUG_SESSION",
      developerMode: true,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("isolated developer assignment");
    expect(fetchImpl).not.toHaveBeenCalled();
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
        { filename: "layout_tutorial_result_P001_S001.json", contentType: "application/json", data: '{"tutorial":true}' },
      ],
      assignment: {
        assignmentId: "assign-1",
        participantNumber: 2,
        sequenceId: "6",
        scheduleVersion: "v1",
        assignmentMode: "replacement",
        requestedSequenceId: "6",
        replacementAttempt: 1,
        rotationIndex: null,
      },
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(result.saved).toBe(4);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String((fetchImpl as never as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[1][1].body))).toEqual({
      experimentID: "layout_task_v1",
      filename: "layout_results_P001_S001.csv",
      data: "b\n2\n",
      assignment_id: "assign-1",
      participant_number: 2,
      sequence_id: "6",
      schedule_version: "v1",
      assignment_mode: "replacement",
      requested_sequence_id: "6",
      replacement_attempt: 1,
      rotation_index: null,
    });
    expect(JSON.parse(String((fetchImpl as never as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[3][1].body))).toMatchObject({
      filename: "layout_tutorial_result_P001_S001.json",
      data: '{"tutorial":true}',
    });
  });

  it("archives a receiver session after the final upload", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(JSON.stringify({ ok: true, data_complete: true, archive_status: "archived" }), { status: 201 });
    };

    const result = await saveExperimentFiles({
      dataSave: receiverExperimentConfig().dataSave,
      files: [{ filename: "results.csv", contentType: "text/csv", data: "qid\nq1\n" }],
      participantId: "P001",
      sessionId: "S001",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe("https://data.example.com/submit");
    expect(requests[0].body).toMatchObject({ schema: "layouttask.receiver.submission.v1", session_id: "S001" });
    expect(requests[0].body).not.toHaveProperty("submission_kind");
    expect(requests[1].url).toBe("https://data.example.com/archive");
    expect(requests[1].body).toMatchObject({
      schema: "layouttask.receiver.archive.v1",
      experiment_id: "layout_task_v1",
      participant_id: "P001",
      session_id: "S001",
    });
  });

  it("keeps recovery data when the receiver does not confirm complete local data", async () => {
    const backup = createMemoryLocalBackupStore("P001:S001");
    const fetchImpl = async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/archive")) {
        return new Response(JSON.stringify({ ok: true, data_complete: false, finalization_status: "incomplete" }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    };

    const files = [{ filename: "results.csv", contentType: "text/csv", data: "qid\nq1\n" }];
    const result = await saveExperimentFiles({
      dataSave: receiverExperimentConfig().dataSave,
      files,
      participantId: "P001",
      sessionId: "S001",
      fetchImpl,
      localBackup: backup,
    });

    expect(result).toMatchObject({ ok: false, failedFilename: "receiver archive", recoveryZip: expect.any(Blob) });
    expect(await backup.listFiles()).toEqual(files);
  });

  it("retries receiver archive once and returns recovery data after the second failure", async () => {
    let archiveAttempts = 0;
    const fetchImpl = async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/archive")) {
        archiveAttempts += 1;
        return new Response(JSON.stringify({ error: "archive_unavailable" }), { status: 503, statusText: "Unavailable" });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    };

    const result = await saveExperimentFiles({
      dataSave: receiverExperimentConfig().dataSave,
      files: [{ filename: "results.csv", contentType: "text/csv", data: "qid\nq1\n" }],
      participantId: "P001",
      sessionId: "S001",
      fetchImpl,
    });

    expect(archiveAttempts).toBe(2);
    expect(result.ok).toBe(false);
    expect(result.recoveryZip).toBeInstanceOf(Blob);
    expect(result.error).toContain("archive");
  });

  it("keeps tutorial files in copy mode and recovery output", async () => {
    const files = [{ filename: "layout_tutorial_result_P001_S001.json", contentType: "application/json", data: '{"tutorial":true}' }];
    const backup = createMemoryLocalBackupStore("P001:S001");
    await expect(
      saveExperimentFiles({
        dataSave: { mode: "copy", filenamePrefix: "layout-task" },
        files,
        localBackup: backup,
      }),
    ).resolves.toEqual({ ok: true, saved: 0 });
    expect(await backup.listFiles()).toEqual(files);
    expect(createRecoveryOutput(files)).toContain("layout_tutorial_result_P001_S001.json");
    expect(createRecoveryOutput(files)).toContain('{"tutorial":true}');
  });

  it("clears local final files after all DataPipe uploads succeed", async () => {
    const backup = createMemoryLocalBackupStore("P001:S001");
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK" })) as unknown as typeof fetch;
    const files = [{ filename: "results.csv", contentType: "text/csv", data: "formal\n" }];

    await expect(saveExperimentFiles({
      dataSave: experimentConfig().dataSave,
      files,
      fetchImpl,
      localBackup: backup,
    })).resolves.toMatchObject({ ok: true });
    expect(await backup.listFiles()).toEqual([]);
  });

  it("keeps local final files after a DataPipe upload failure", async () => {
    const backup = createMemoryLocalBackupStore("P001:S001");
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, statusText: "Unavailable" })) as unknown as typeof fetch;
    const files = [{ filename: "results.csv", contentType: "text/csv", data: "formal\n" }];

    await expect(saveExperimentFiles({
      dataSave: experimentConfig().dataSave,
      files,
      fetchImpl,
      localBackup: backup,
    })).resolves.toMatchObject({ ok: false });
    expect(await backup.listFiles()).toEqual(files);
  });

  it("keeps tutorial data available after a failed DataPipe save", async () => {
    const files = [
      { filename: "layout_results_P001_S001.csv", contentType: "text/csv", data: "formal\n" },
      { filename: "layout_tutorial_result_P001_S001.json", contentType: "application/json", data: '{"tutorial":true}' },
    ];
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, statusText: "Unavailable" })) as unknown as typeof fetch;

    const result = await saveExperimentFiles({
      dataSave: experimentConfig().dataSave,
      files,
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(createRecoveryOutput(files)).toContain("layout_tutorial_result_P001_S001.json");
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
