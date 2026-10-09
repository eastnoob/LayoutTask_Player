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
    expect(JSON.parse(body.files[0].data).schema).toBe("layouttask.backup.v1");
  });

  it("stores and submits the same formal trial identity with distinct experiment and trial sessions", async () => {
    const backup = createMemoryLocalBackupStore("experiment-session");
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 201, statusText: "Created" });
    const payload = createPayload();
    payload.result.presentation = {
      presentationId: "seq6-trial1",
      taskId: "room01",
      repeatGroupId: null,
      repeatIndex: 0,
      repeatOfTaskId: null,
      trialIndex: 1,
      trialTotal: 25,
    };
    const service = new DataSaveService({
      config: {
        mode: "receiver",
        experiment_id: "EXP123",
        endpoint: "https://data.example.com/submit",
        filename_prefix: "layout-task",
        participant_id: "P047",
        session_id: "EXPERIMENT_SESSION",
        expected_presentation: payload.result.presentation,
        assignment: {
          assignment_id: "assign-47",
          participant_number: 47,
          sequence_id: "6",
          schedule_version: "schedule-v1",
          assignment_mode: "replacement",
          requested_sequence_id: "6",
          replacement_attempt: 2,
          rotation_index: null,
        },
        payload_format: "json-envelope",
        save_encoded: true,
        save_result: false,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      localBackup: backup,
    });

    await expect(service.save(payload)).resolves.toMatchObject({
      ok: true,
      filename: "layout-task_room01_Q1_SESSION1.json",
    });
    const stored = JSON.parse((await backup.listFiles())[0].data);
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const identity = {
      experiment_id: "EXP123",
      participant_id: "P047",
      session_id: "EXPERIMENT_SESSION",
      trial_session_id: "SESSION1",
      assignment_id: "assign-47",
      participant_number: 47,
      sequence_id: "6",
      schedule_version: "schedule-v1",
      assignment_mode: "replacement",
      requested_sequence_id: "6",
      replacement_attempt: 2,
      rotation_index: null,
      trial_type: "formal",
      trial_index: 1,
      task_id: "room01",
      qid: "Q1",
      presentation_id: "seq6-trial1",
    };
    expect(stored).toMatchObject({ schema: "layouttask.backup.v2", ...identity, hash8: "HASH0001", encoded: "ENCODED" });
    expect(request).toMatchObject({
      schema: "layouttask.receiver.submission.v2", submission_kind: "trial", ...identity,
      hash8: "HASH0001", encoding: "plain-json", encoded: "ENCODED",
    });
    expect(request.files[0].data).toBe((await backup.listFiles())[0].data);
    expect(stored.result).toBeUndefined();
  });

  it.each([
    { field: "presentationId", actual: "seq5-trial1" },
    { field: "trialIndex", actual: 2 },
    { field: "taskId", actual: "room02" },
  ] as const)("rejects an assigned trial with a mismatched $field before backup or upload", async ({ field, actual }) => {
    const backup = createMemoryLocalBackupStore("experiment-session");
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 201, statusText: "Created" });
    const payload = createPayload();
    const expected = {
      presentationId: "seq6-trial1", taskId: "room01", trialIndex: 1,
      repeatGroupId: null, repeatIndex: 0, repeatOfTaskId: null, trialTotal: 25,
    };
    payload.result.presentation = { ...expected, [field]: actual };
    const service = new DataSaveService({
      config: {
        mode: "receiver", experiment_id: "EXP123", endpoint: "https://data.example.com/submit",
        filename_prefix: "layout-task", participant_id: "P047", session_id: "EXPERIMENT_SESSION",
        expected_presentation: expected,
        assignment: {
          assignment_id: "assign-47", participant_number: 47, sequence_id: "6", schedule_version: "schedule-v1",
          assignment_mode: "replacement", requested_sequence_id: "6", replacement_attempt: 2, rotation_index: null,
        },
        payload_format: "json-envelope", save_encoded: true, save_result: false,
      },
      localBackup: backup,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(service.save(payload)).resolves.toMatchObject({
      ok: false, provider: "receiver", error: expect.stringContaining("presentation"),
    });
    expect(await backup.listFiles()).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an assigned receiver save with no experiment session before backup or upload", async () => {
    const backup = createMemoryLocalBackupStore("experiment-session");
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 201, statusText: "Created" });
    const service = new DataSaveService({
      config: {
        mode: "receiver", experiment_id: "EXP123", endpoint: "https://data.example.com/submit",
        filename_prefix: "layout-task", participant_id: "P047",
        assignment: {
          assignment_id: "assign-47", participant_number: 47, sequence_id: "6", schedule_version: "schedule-v1",
          assignment_mode: "replacement", requested_sequence_id: "6", replacement_attempt: 2, rotation_index: null,
        },
        payload_format: "json-envelope", save_encoded: true, save_result: false,
      },
      localBackup: backup,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(service.save(createPayload())).resolves.toMatchObject({
      ok: false, provider: "receiver", error: expect.stringContaining("session_id"),
    });
    expect(await backup.listFiles()).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("submits a formal tutorial trial without a presentation position", async () => {
    const backup = createMemoryLocalBackupStore("experiment-session");
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 201, statusText: "Created" });
    const service = new DataSaveService({
      config: {
        mode: "receiver", experiment_id: "EXP123", endpoint: "https://data.example.com/submit",
        filename_prefix: "layout-task", participant_id: "P047", session_id: "EXPERIMENT_SESSION",
        assignment: {
          assignment_id: "assign-47", participant_number: 47, sequence_id: "6", schedule_version: "schedule-v1",
          assignment_mode: "replacement", requested_sequence_id: "6", replacement_attempt: 2, rotation_index: null,
        },
        payload_format: "json-envelope", save_encoded: true, save_result: false,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      localBackup: backup,
    });

    await service.save(createPayload());
    const stored = JSON.parse((await backup.listFiles())[0].data);
    const request = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(stored).toMatchObject({ schema: "layouttask.backup.v2", trial_type: "tutorial", session_id: "EXPERIMENT_SESSION", trial_session_id: "SESSION1" });
    expect(request).toMatchObject({ schema: "layouttask.receiver.submission.v2", submission_kind: "trial", trial_type: "tutorial" });
    for (const item of [stored, request]) {
      expect(item).not.toHaveProperty("presentation_id");
      expect(item).not.toHaveProperty("trial_index");
    }
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
