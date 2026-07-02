import { describe, expect, it } from "vitest";
import { createExperimentCsv, createExperimentDataPipePayload, createExperimentFilename } from "./experiment-data";
import { createSessionId, formatTimestampForId, getParticipantId } from "./participant-session";

describe("participant/session ids", () => {
  it("reads participant id from URL params by priority", () => {
    const url = new URL("https://example.test/?subject=SUB2&participant=P1&PROLIFIC_PID=PX");

    expect(getParticipantId({ url, storage: undefined, now: new Date("2026-07-02T12:00:00Z") })).toBe("P1");
  });

  it("generates and stores a fallback participant id", () => {
    const storage = new Map<string, string>();
    const cryptoImpl = { getRandomValues: (array: Uint32Array) => ((array[0] = 123456789), array) } as Crypto;

    const id = getParticipantId({
      url: new URL("https://example.test/"),
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, value);
        },
      },
      now: new Date("2026-07-02T12:34:56Z"),
      cryptoImpl,
    });

    expect(id).toMatch(/^P_20260702_123456_/);
    expect(storage.get("layoutTaskParticipantId")).toBe(id);
  });

  it("always generates a new session id", () => {
    const cryptoImpl = { getRandomValues: (array: Uint32Array) => ((array[0] = 987654321), array) } as Crypto;

    expect(createSessionId({ now: new Date("2026-07-02T12:34:56Z"), cryptoImpl })).toMatch(/^S_20260702_123456_/);
  });

  it("formats timestamps for ids", () => {
    expect(formatTimestampForId(new Date("2026-07-02T03:04:05Z"))).toBe("20260702_030405");
  });
});

describe("experiment data export", () => {
  const rowInput = {
    participantId: "P001",
    sessionId: "S001",
    experimentId: "layout_task_v1",
    startTime: 1000,
    endTime: 2000,
    tutorialCompleted: true,
    tutorialDurationMs: 1234,
    trialOrder: ["scene_001", "scene_002"],
    trialResults: [
      {
        taskId: "scene_001",
        qid: "Q001",
        encoded: "LAYOUTTASK1|Q001|...",
        result: { schema: "layouttask.result.v1", qid: "Q001", task_id: "scene_001" },
      },
    ],
  };

  it("builds a one-row participant CSV with plain JSON columns", () => {
    const csv = createExperimentCsv(rowInput);

    expect(csv).toContain("participant_id,session_id,experiment_id,start_time,end_time,n_trials");
    expect(csv).toContain("P001,S001,layout_task_v1,1000,2000,1");
    expect(csv).toContain('""scene_001""');
    expect(csv).toContain('""encoded"":""LAYOUTTASK1|Q001|...""');
  });

  it("builds the DataPipe filename and payload", () => {
    const data = createExperimentCsv(rowInput);

    expect(createExperimentFilename("layout-task", "P001", "S001")).toBe("layout-task_P001_S001.csv");
    expect(
      createExperimentDataPipePayload({
        experimentId: "layout_task_v1",
        filenamePrefix: "layout-task",
        participantId: "P001",
        sessionId: "S001",
        data,
      }),
    ).toEqual({
      experimentID: "layout_task_v1",
      filename: "layout-task_P001_S001.csv",
      data,
    });
  });
});
