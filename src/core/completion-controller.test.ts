import { describe, expect, it, vi } from "vitest";
import type { CopyResult } from "./clipboard-service";
import type { EncodedLayoutTask } from "./encoder";
import type { LayoutTaskResult } from "../types/result";
import type { LayoutTaskRenderer } from "./renderer";
import { CompletionController } from "./completion-controller";
import { StateStore } from "./state-store";
import { createRuntimeConfig } from "../test-support/runtime-config";

describe("CompletionController", () => {
  const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  it("locks, encodes, copies, and reuses the same payload for copy again", async () => {
    const config = createRuntimeConfig();
    const store = new StateStore(config);
    store.applyAction("chair_01", "move_left");
    const result = createResult();
    const encoded = createEncoded("PAYLOAD1");
    const copyResult: CopyResult = { ok: true, method: "clipboard-api" };
    const renderer = createCompletionRendererStub();
    const recorder = { finish: vi.fn().mockResolvedValue(result) };
    const encoder = { encode: vi.fn().mockResolvedValue(encoded) };
    const clipboard = {
      copy: vi.fn().mockResolvedValue(copyResult),
    };
    const dataSave = { save: vi.fn().mockResolvedValue({ ok: true, provider: "copy" }) };
    const onComplete = vi.fn();

    const controller = new CompletionController({
      config,
      store,
      recorder: recorder as never,
      renderer,
      encoder: encoder as never,
      clipboard: clipboard as never,
      dataSave: dataSave as never,
      onComplete,
      confirmImpl: () => true,
    });

    await controller.requestComplete();
    expect(store.isLocked()).toBe(true);
    expect(renderer.setLocked).toHaveBeenCalledWith(true);
    expect(encoder.encode).toHaveBeenCalledWith(result, config.output);
    expect(renderer.showCompletion).toHaveBeenCalledWith(encoded.output, copyResult);
    expect(dataSave.save).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete.mock.calls[0][0].dataSaveResult).toEqual({ ok: true, provider: "copy" });
    expect(encoder.encode).toHaveBeenCalledTimes(1);

    await controller.copyAgain();
    expect(clipboard.copy).toHaveBeenNthCalledWith(1, "PAYLOAD1");
    expect(clipboard.copy).toHaveBeenNthCalledWith(2, "PAYLOAD1");
  });

  it("shows DataPipe failure details without undoing the locked result", async () => {
    const config = createRuntimeConfig();
    const store = new StateStore(config);
    store.applyAction("chair_01", "move_left");
    const renderer = createCompletionRendererStub();
    const recorder = { finish: vi.fn().mockResolvedValue(createResult()) };
    const encoder = { encode: vi.fn().mockResolvedValue(createEncoded("PAYLOAD1")) };
    const clipboard = { copy: vi.fn().mockResolvedValue({ ok: true, method: "clipboard-api" }) };
    const dataSave = {
      save: vi.fn().mockResolvedValue({
        ok: false,
        provider: "datapipe",
        filename: "layout-task.json",
        error: "DataPipe save failed: 403 Forbidden",
      }),
    };

    const controller = new CompletionController({
      config,
      store,
      recorder: recorder as never,
      renderer,
      encoder: encoder as never,
      clipboard: clipboard as never,
      dataSave: dataSave as never,
      confirmImpl: () => true,
    });

    await controller.requestComplete();

    expect(store.isLocked()).toBe(true);
    expect(renderer.showCompletion).toHaveBeenCalled();
    expect(renderer.setStatus).toHaveBeenLastCalledWith(
      "Locked and copied. DataPipe save failed: DataPipe save failed: 403 Forbidden",
    );
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it("stops when confirmation is rejected", async () => {
    const config = createRuntimeConfig();
    const store = new StateStore(config);
    const renderer = createCompletionRendererStub();
    const recorder = { finish: vi.fn() };
    const encoder = { encode: vi.fn() };
    const clipboard = { copy: vi.fn() };

    const controller = new CompletionController({
      config,
      store,
      recorder: recorder as never,
      renderer,
      encoder: encoder as never,
      clipboard: clipboard as never,
      confirmImpl: () => false,
    });

    await controller.requestComplete();
    expect(store.isLocked()).toBe(false);
    expect(recorder.finish).not.toHaveBeenCalled();
  });

  it("asks for one extra confirmation when no object has been edited", async () => {
    const config = createRuntimeConfig({
      messages: {
        ...createRuntimeConfig().messages,
        confirm_no_edit: "Custom no-edit confirm",
      },
    });
    const store = new StateStore(config);
    const renderer = createCompletionRendererStub();
    const recorder = { finish: vi.fn().mockResolvedValue(createResult()) };
    const encoder = { encode: vi.fn().mockResolvedValue(createEncoded("PAYLOAD1")) };
    const clipboard = { copy: vi.fn().mockResolvedValue({ ok: true, method: "clipboard-api" }) };
    const confirmImpl = vi.fn(() => true);

    const controller = new CompletionController({
      config,
      store,
      recorder: recorder as never,
      renderer,
      encoder: encoder as never,
      clipboard: clipboard as never,
      confirmImpl,
    });

    await controller.requestComplete();

    expect(confirmImpl).toHaveBeenCalledTimes(3);
    expect(confirmImpl).toHaveBeenLastCalledWith("Custom no-edit confirm");
    expect(store.isLocked()).toBe(true);
  });

  it("does not finish when the no-edit confirmation is rejected", async () => {
    const config = createRuntimeConfig();
    const store = new StateStore(config);
    const renderer = createCompletionRendererStub();
    const recorder = { finish: vi.fn() };
    const encoder = { encode: vi.fn() };
    const clipboard = { copy: vi.fn() };
    const confirmImpl = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    const controller = new CompletionController({
      config,
      store,
      recorder: recorder as never,
      renderer,
      encoder: encoder as never,
      clipboard: clipboard as never,
      confirmImpl,
    });

    await controller.requestComplete();

    expect(confirmImpl).toHaveBeenCalledTimes(3);
    expect(store.isLocked()).toBe(false);
    expect(recorder.finish).not.toHaveBeenCalled();
  });
});

function createCompletionRendererStub(): LayoutTaskRenderer {
  return {
    setLocked: vi.fn(),
    showCompletion: vi.fn(),
    setStatus: vi.fn(),
  } as unknown as LayoutTaskRenderer;
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

function createEncoded(output: string): EncodedLayoutTask {
  return {
    version: "LAYOUTTASK1",
    qid: "Q1",
    taskId: "room01",
    sessionId: "SESSION1",
    hash8: "HASH0001",
    encoding: "lz-uri",
    encodedData: "DATA",
    output,
  };
}
