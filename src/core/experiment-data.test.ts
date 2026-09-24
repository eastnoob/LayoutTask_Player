import { describe, expect, it } from "vitest";
import {
  createExperimentCsvFiles,
  createExperimentDataPipePayloads,
  createExperimentFilename,
} from "./experiment-data";
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
  const result = {
    schema: "layouttask.result.v1",
    exp: "layout_task_v1",
    qid: "Q001",
    task_id: "scene_001",
    session: "trial-session",
    start_time: 100,
    end_time: 900,
    duration_ms: 800,
    flow: { mode: "preview_then_reconstruct", preview_duration_ms: 10000 },
    task_config_hash: "abc123",
    confidence: { group_a: 4 },
    context: {
      world: {
        unit: "px",
        viewBox: { x: 0, y: 0, width: 1000, height: 1000 },
        origin: { x: 0, y: 0 },
        grid_size: 50,
        grid_snap: true,
      },
      objects: {
        group_a: {
          origin: { x: 100, y: 200, r: 90 },
          movement_step: 50,
          rotation_step: 45,
          limits: {},
        },
      },
    },
    events: [
      {
        i: 0,
        t: 12,
        object: "group_a",
        action: "move_right",
        valid: true,
        before: { x: 100, y: 200, r: 90 },
        after: { x: 150, y: 200, r: 90 },
        offsets: { xSteps: 1, ySteps: 0, rotationSteps: 0 },
      },
    ],
    final_state_mode: "absolute",
    final_state: {
      group_a: {
        x: 150,
        y: 200,
        r: 90,
        counts: { left: 0, right: 1, up: 0, down: 0, cw: 0, ccw: 0 },
        offsets: { xSteps: 1, ySteps: 0, rotationSteps: 0 },
      },
    },
    locked: true,
    user_agent: 'Test, "Browser"\nwith newline',
    display: {
      viewport: { width: 1200, height: 800 },
      screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040 },
      devicePixelRatio: 1,
    },
  } as const;

  const rowInput = {
    participantId: "P001",
    sessionId: "S001",
    experimentId: "layout_task_v1",
    startTime: 1000,
    endTime: 3000,
    tutorialCompleted: true,
    tutorialDurationMs: 500,
    trialOrder: ["scene_001"],
    trialResults: [
      {
        trialType: "formal",
        taskId: "scene_001",
        qid: "Q001",
        encoded: "LAYOUTTASK1|Q001|...",
        hash8: "deadbeef",
        result,
      },
      { trialType: "tutorial", taskId: "tutorial", qid: "Q_TUTORIAL" },
    ],
  };

  it("builds session, results, and events CSV files", () => {
    const files = createExperimentCsvFiles(rowInput);

    expect(files.map((file) => file.filename)).toEqual([
      "layout_session_P001_S001.csv",
      "layout_results_P001_S001.csv",
      "layout_raw_results_P001_S001.csv",
      "layout_events_P001_S001.csv",
      "layout_debug_P001_S001.json",
    ]);
    expect(files.map((file) => file.contentType)).toEqual([
      "text/csv",
      "text/csv",
      "text/csv",
      "text/csv",
      "application/json",
    ]);
    expect(files[0].data).toContain("participant_id,session_id,experiment_id,started_at,ended_at,duration_ms");
    expect(files[0].data).toContain("P001,S001,layout_task_v1,1000,3000,2000");
    expect(files[1].data).toContain("trial_index,task_id,qid,object_id,confidence");
    expect(files[1].data).not.toContain(",encoded,");
    expect(files[1].data).toContain("0,scene_001,Q001,group_a,4");
    expect(files[1].data).toContain("100,200,90,50,45,150,200,90,1,0,0");
    expect(files[2].data).toContain("trial_index,task_id,qid,hash8,result_json");
    const rawResultRow = parseCsvRecords(files[2].data)[1];
    expect(rawResultRow).toHaveLength(8);
    expect(JSON.parse(rawResultRow[7])).toEqual(result);
    expect(files[3].data).toContain("event_index,event_time_ms,object_id,action,valid");
    expect(files[3].data).toContain("0,12,group_a,move_right,true");
    expect(JSON.parse(files[4].data)).toMatchObject({
      schema: "layouttask.debug.v1",
      participant_id: "P001",
      session_id: "S001",
      experiment_id: "layout_task_v1",
      trial_count: 2,
    });
  });

  it("uses a configured filename prefix", () => {
    const files = createExperimentCsvFiles({ ...rowInput, filenamePrefix: "layout-task" });

    expect(files.map((file) => file.filename)).toEqual([
      "layout-task_session_P001_S001.csv",
      "layout-task_results_P001_S001.csv",
      "layout-task_raw_results_P001_S001.csv",
      "layout-task_events_P001_S001.csv",
      "layout-task_debug_P001_S001.json",
    ]);
  });

  it("builds one DataPipe payload per CSV file", () => {
    expect(createExperimentFilename("layout_results", "P 001", "S/001")).toBe("layout_results_P-001_S-001.csv");

    const payloads = createExperimentDataPipePayloads({
      experimentId: "mshCnq690sD5",
      files: createExperimentCsvFiles(rowInput),
    });

    expect(payloads.map((payload) => payload.filename)).toEqual([
      "layout_session_P001_S001.csv",
      "layout_results_P001_S001.csv",
      "layout_raw_results_P001_S001.csv",
      "layout_events_P001_S001.csv",
      "layout_debug_P001_S001.json",
    ]);
    expect(payloads.every((payload) => payload.experimentID === "mshCnq690sD5")).toBe(true);
  });
});

function parseCsvRecords(data: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < data.length; index += 1) {
    const character = data[index];
    if (quoted) {
      if (character === '"') {
        if (data[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      records.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    records.push(row);
  }

  return records;
}
