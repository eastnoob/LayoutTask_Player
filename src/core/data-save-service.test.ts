import { describe, expect, it, vi } from "vitest";
import { DataSaveService } from "./data-save-service";
import type { CompletionPayload } from "./completion-controller";
import { createMemoryLocalBackupStore } from "./local-backup-store";

describe("DataSaveService", () => {
  it("does nothing in copy mode", async () => {
    const fetchImpl = vi.fn();
    const service = new DataSaveService({
      config: { mode: "copy" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(service.save(createPayload())).resolves.toEqual({ ok: true, provider: "copy" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts a self-describing JSON envelope to DataPipe", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
    const service = new DataSaveService({
      config: {
        mode: "datapipe",
        experiment_id: "EXP123",
        endpoint: "https://pipe.jspsych.org/api/data/",
        filename_prefix: "layout-task",
        payload_format: "json-envelope",
        save_encoded: true,
        save_result: false,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await service.save(createPayload());

    expect(result).toEqual({
      ok: true,
      provider: "datapipe",
      filename: "layout-task_room01_Q1_SESSION1.json",
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://pipe.jspsych.org/api/data/", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
    }));

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.experimentID).toBe("EXP123");
    expect(body.filename).toBe("layout-task_room01_Q1_SESSION1.json");
    expect(JSON.parse(body.data)).toMatchObject({
      schema: "layouttask.backup.v1",
      qid: "Q1",
      task_id: "room01",
      session: "SESSION1",
      hash8: "HASH0001",
      encoding: "plain-json",
      encoded: "ENCODED",
    });
    expect(JSON.parse(body.data)).not.toHaveProperty("result");
    expect(JSON.parse(body.data)).toHaveProperty("pause");
  });

  it("persists the exact trial file before a remote request", async () => {
    const backup = createMemoryLocalBackupStore("session-1");
    const fetchImpl = vi.fn(async () => {
      expect((await backup.listFiles()).map((file) => file.filename)).toEqual([
        "layout-task_room01_Q1_SESSION1.json",
      ]);
      return { ok: true, status: 200, statusText: "OK" } as Response;
    });
    const service = new DataSaveService({
      config: {
        mode: "datapipe",
        experiment_id: "EXP123",
        endpoint: "https://pipe.jspsych.org/api/data/",
        filename_prefix: "layout-task",
        payload_format: "json-envelope",
        save_encoded: true,
        save_result: false,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      localBackup: backup,
    });

    await expect(service.save(createPayload())).resolves.toMatchObject({ ok: true });
    expect((await backup.listFiles())[0].data).toContain('"schema":"layouttask.backup.v1"');
  });

  it("keeps copy mode offline while writing the trial backup", async () => {
    const backup = createMemoryLocalBackupStore("session-1");
    const fetchImpl = vi.fn();
    const service = new DataSaveService({
      config: { mode: "copy" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      localBackup: backup,
    });

    await expect(service.save(createPayload())).resolves.toMatchObject({ ok: true, provider: "copy" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await backup.listFiles()).map((file) => file.filename)).toEqual([
      "layout-task_room01_Q1_SESSION1.json",
    ]);
  });

  it("posts each task backup as a receiver submission when receiver mode is configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 201, statusText: "Created" });
    const service = new DataSaveService({
      config: {
        mode: "receiver",
        experiment_id: "EXP123",
        endpoint: "https://data.example.com/submit",
        filename_prefix: "layout-task",
        participant_id: "9999",
        payload_format: "json-envelope",
        save_encoded: true,
        save_result: false,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(service.save(createPayload())).resolves.toMatchObject({
      ok: true,
      provider: "receiver",
    });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).toMatchObject({
      schema: "layouttask.receiver.submission.v1",
      experiment_id: "EXP123",
      participant_id: "9999",
      session_id: "SESSION1",
      files: [{ content_type: "application/json" }],
    });
    expect(body).not.toHaveProperty("experimentID");
  });

  it("can post only the encoded result as a text file", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
    const service = new DataSaveService({
      config: {
        mode: "datapipe",
        experiment_id: "EXP123",
        endpoint: "https://pipe.jspsych.org/api/data/",
        filename_prefix: "layout-task",
        payload_format: "encoded-only",
        save_encoded: true,
        save_result: true,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await service.save(createPayload());
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);

    expect(result.filename).toBe("layout-task_room01_Q1_SESSION1.txt");
    expect(body.data).toBe("ENCODED");
  });

  it("can post a one-row CSV file for tabular DataPipe validation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" });
    const service = new DataSaveService({
      config: {
        mode: "datapipe",
        experiment_id: "EXP123",
        endpoint: "https://pipe.jspsych.org/api/data/",
        filename_prefix: "layout-task",
        payload_format: "csv-row",
        save_encoded: true,
        save_result: true,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await service.save(createPayload());
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);

    expect(result.filename).toBe("layout-task_room01_Q1_SESSION1.csv");
    expect(body.data).toBe("qid,task_id,session,hash8,encoding,encoded\nQ1,room01,SESSION1,HASH0001,plain-json,ENCODED\n");
  });

  it("returns a non-fatal failure when DataPipe rejects the request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      clone: () => ({
        json: async () => ({
          code: "DATA_COLLECTION_NOT_ACTIVE",
          message: "Data collection is not enabled for this experiment.",
        }),
      }),
      text: async () => "",
    });
    const service = new DataSaveService({
      config: {
        mode: "datapipe",
        experiment_id: "EXP123",
        endpoint: "https://pipe.jspsych.org/api/data/",
        filename_prefix: "layout-task",
        payload_format: "json-envelope",
        save_encoded: true,
        save_result: false,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await service.save(createPayload());

    expect(result.ok).toBe(false);
    expect(result.error).toContain("403 Forbidden");
    expect(result.error).toContain("DATA_COLLECTION_NOT_ACTIVE");
  });

  it("returns a timeout so the next task can continue", async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
    const service = new DataSaveService({
      config: {
        mode: "receiver",
        experiment_id: "EXP123",
        endpoint: "https://data.example.com/submit",
        filename_prefix: "layout-task",
        participant_id: "9999",
        payload_format: "json-envelope",
        save_encoded: true,
        save_result: false,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 5,
    });

    await expect(service.save(createPayload())).resolves.toMatchObject({
      ok: false,
      provider: "receiver",
      error: "Data save timed out after 5ms",
    });
  });
});

function createPayload(): CompletionPayload {
  return {
    encoded: {
      version: "LAYOUTTASK1",
      qid: "Q1",
      taskId: "room01",
      sessionId: "SESSION1",
      hash8: "HASH0001",
      encoding: "plain-json",
      encodedData: "{}",
      output: "ENCODED",
    },
    copyResult: { ok: true, method: "clipboard-api" },
    result: {
      schema: "layouttask.result.v1",
      exp: "exp1",
      qid: "Q1",
      task_id: "room01",
      session: "SESSION1",
      start_time: 1_000,
      end_time: 2_000,
      duration_ms: 1_000,
      events: [],
      final_state: {},
      locked: true,
      pause: {
        pause_used: true,
        pause_count: 1,
        pause_duration_ms: 5_000,
        pause_events: [],
      },
    },
  };
}
