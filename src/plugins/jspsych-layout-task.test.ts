import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JsPsych } from "jspsych";
import { ConfigLoader } from "../core/config-loader";
import type { CompletionPayload } from "../core/completion-controller";
import type { EncodedLayoutTask } from "../core/encoder";
import { createLayoutTaskPlayer } from "../core/layout-task-player";
import type { LayoutTaskPlayer } from "../core/layout-task-player";
import type { LayoutTaskResult } from "../types/result";
import { createRuntimeConfig } from "../test-support/runtime-config";
import LayoutTaskPlugin, { buildTrialData } from "./jspsych-layout-task";

// Mock jsPsych runtime export so node-side tests do not execute browser-only setup.
// 经测试, 这里只需要 ParameterType；真正的 browser runtime 在 node 测试里反而会报错。
vi.mock("jspsych", () => ({
  ParameterType: {
    OBJECT: "object",
    STRING: "string",
    BOOL: "bool",
  },
}));

// Mock player core so plugin tests stay focused on adapter behavior.
// 这里测的是 jsPsych integration，不重复测 player 内部交互逻辑。
vi.mock("../core/layout-task-player", () => ({
  createLayoutTaskPlayer: vi.fn(),
}));

describe("LayoutTaskPlugin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses an injected runtime config without loading from ConfigLoader", async () => {
    // Direct config path is important for advanced experiments that assemble trials in code.
    const config = createRuntimeConfig();
    const finishTrial = vi.fn();
    const payload = createPayload();
    const start = vi.fn(() => {
      const options = vi.mocked(createLayoutTaskPlayer).mock.calls[0]?.[0];
      options?.onComplete?.(payload);
    });
    vi.mocked(createLayoutTaskPlayer).mockReturnValue(createPlayerStub(start));
    const loadSpy = vi.spyOn(ConfigLoader.prototype, "loadRuntimeConfig");

    const plugin = new LayoutTaskPlugin({ finishTrial } as unknown as JsPsych);
    await plugin.trial(createDisplayElement(), {
      type: LayoutTaskPlugin,
      config,
      baseUrl: "/layout-task/",
      manifestPath: "manifest.json",
      taskId: null,
      qid: null,
      autoFinishTrial: true,
      writeEncodedToData: true,
      writeResultToData: true,
      writeHeaderToData: true,
      title: "Layout Task",
    });

    expect(loadSpy).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledOnce();
    expect(finishTrial).toHaveBeenCalledWith(
      expect.objectContaining({
        qid: "Q1",
        task_id: "room01",
        session: "SESSION1",
        hash8: "HASH0001",
        encoding: "lz-uri",
        encoded: "ENCODED",
        result: payload.result,
      }),
    );
  });

  it("loads config from taskId/qid when config is not injected", async () => {
    // This mirrors the standard researcher workflow: timeline 只给 taskId/qid，plugin 自己去取静态配置。
    const config = createRuntimeConfig();
    vi.spyOn(ConfigLoader.prototype, "loadRuntimeConfig").mockResolvedValue(config);
    vi.mocked(createLayoutTaskPlayer).mockReturnValue(createPlayerStub());
    const plugin = new LayoutTaskPlugin({ finishTrial: vi.fn() } as unknown as JsPsych);

    const trialPromise = plugin.trial(createDisplayElement(), {
      type: LayoutTaskPlugin,
      config: null,
      baseUrl: "/layout-task/",
      manifestPath: "manifest.json",
      taskId: "room01",
      qid: "Q1",
      autoFinishTrial: true,
      writeEncodedToData: true,
      writeResultToData: true,
      writeHeaderToData: true,
      title: "Layout Task",
    });

    await flushPromises();
    expect(ConfigLoader.prototype.loadRuntimeConfig).toHaveBeenCalledWith({
      taskId: "room01",
      qid: "Q1",
    });
    expect(createLayoutTaskPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        config,
      }),
    );
    await expect(Promise.race([trialPromise, Promise.resolve("pending")])).resolves.toBe("pending");
  });

  it("does not auto-finish when autoFinishTrial is false", async () => {
    // Some experiments may want a custom post-task screen before finishTrial.
    const finishTrial = vi.fn();
    vi.mocked(createLayoutTaskPlayer).mockReturnValue(
      createPlayerStub(() => {
        const options = vi.mocked(createLayoutTaskPlayer).mock.calls[0]?.[0];
        options?.onComplete?.(createPayload());
      }),
    );
    const plugin = new LayoutTaskPlugin({ finishTrial } as unknown as JsPsych);

    const trialPromise = plugin.trial(createDisplayElement(), {
      type: LayoutTaskPlugin,
      config: createRuntimeConfig(),
      baseUrl: "/layout-task/",
      manifestPath: "manifest.json",
      taskId: null,
      qid: null,
      autoFinishTrial: false,
      writeEncodedToData: true,
      writeResultToData: true,
      writeHeaderToData: true,
      title: "Layout Task",
    });

    await flushPromises();
    expect(finishTrial).not.toHaveBeenCalled();
    await expect(Promise.race([trialPromise, Promise.resolve("pending")])).resolves.toBe("pending");
  });

  it("passes confidence config into the core player", async () => {
    const config = createRuntimeConfig();
    vi.mocked(createLayoutTaskPlayer).mockReturnValue(createPlayerStub());
    const plugin = new LayoutTaskPlugin({ finishTrial: vi.fn() } as unknown as JsPsych);

    const trialPromise = plugin.trial(createDisplayElement(), {
      type: LayoutTaskPlugin,
      config,
      baseUrl: "/layout-task/",
      manifestPath: "manifest.json",
      taskId: null,
      qid: null,
      autoFinishTrial: true,
      writeEncodedToData: true,
      writeResultToData: true,
      writeHeaderToData: true,
      title: "Layout Task",
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
      tutorialMode: false,
    } as never);

    await flushPromises();
    expect(createLayoutTaskPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        confidence: expect.objectContaining({ required: true }),
      }),
    );
    await expect(Promise.race([trialPromise, Promise.resolve("pending")])).resolves.toBe("pending");
  });

  it("finishes with error data when config loading fails", async () => {
    // Config errors should be visible both in UI and in jsPsych data.
    const finishTrial = vi.fn();
    vi.spyOn(ConfigLoader.prototype, "loadRuntimeConfig").mockRejectedValue(new Error("bad config"));
    const root = createDisplayElement();
    const plugin = new LayoutTaskPlugin({ finishTrial } as unknown as JsPsych);

    await plugin.trial(root, {
      type: LayoutTaskPlugin,
      config: null,
      baseUrl: "/layout-task/",
      manifestPath: "manifest.json",
      taskId: null,
      qid: null,
      autoFinishTrial: true,
      writeEncodedToData: true,
      writeResultToData: true,
      writeHeaderToData: true,
      title: "Layout Task",
    });

    expect(root.innerHTML).toContain("Plugin error");
    expect(finishTrial).toHaveBeenCalledWith({
      error: true,
      message: "bad config",
    });
  });
});

describe("buildTrialData", () => {
  it("respects data writing flags", () => {
    const config = createRuntimeConfig();
    const payload = createPayload();

    expect(
      buildTrialData(config, payload, {
        writeEncodedToData: false,
        writeResultToData: false,
        writeHeaderToData: false,
      }),
    ).toEqual({});

    expect(
      buildTrialData(config, payload, {
        writeEncodedToData: true,
        writeResultToData: false,
        writeHeaderToData: true,
      }),
    ).toEqual({
      qid: "Q1",
      task_id: "room01",
      session: "SESSION1",
      hash8: "HASH0001",
      encoding: "lz-uri",
      encoded: "ENCODED",
    });
  });
});

function createPlayerStub(start: () => void = vi.fn()): LayoutTaskPlayer {
  // Minimal fake player contract; enough for plugin lifecycle tests.
  return {
    start,
    destroy: vi.fn(),
    getState: vi.fn(),
    isLocked: vi.fn(),
  } as unknown as LayoutTaskPlayer;
}

function createPayload(): CompletionPayload {
  // Shared completion payload fixture keeps plugin assertions compact.
  return {
    result: createResult(),
    encoded: createEncoded(),
    copyResult: {
      ok: true,
      method: "clipboard-api",
    },
  };
}

function createResult(): LayoutTaskResult {
  return {
    schema: "layouttask.result.v1",
    exp: "test_exp",
    qid: "Q1",
    task_id: "room01",
    session: "SESSION1",
    start_time: 1_000,
    end_time: 2_000,
    duration_ms: 1_000,
    events: [],
    final_state: {
      chair_01: {
        x: 0,
        y: 0,
        r: 0,
        counts: { left: 0, right: 0, up: 0, down: 0, cw: 0, ccw: 0 },
        offsets: { xSteps: 0, ySteps: 0, rotationSteps: 0 },
      },
    },
    locked: true,
  };
}

function createEncoded(): EncodedLayoutTask {
  return {
    version: "LAYOUTTASK1",
    qid: "Q1",
    taskId: "room01",
    sessionId: "SESSION1",
    hash8: "HASH0001",
    encoding: "lz-uri",
    encodedData: "DATA",
    output: "ENCODED",
  };
}

function createDisplayElement(): HTMLElement {
  // Tiny fake HTMLElement for node environment.
  // 这里只实现 plugin 用到的两个成员，避免引入 jsdom 成本。
  const element = {
    innerHTML: "",
    replaceChildren() {
      element.innerHTML = "";
    },
  };

  return element as unknown as HTMLElement;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
