import { describe, expect, it } from "vitest";
import {
  bootstrapExperimentSession,
  type ExperimentSessionStorage,
  restorePauseSnapshot,
} from "./experiment-session";
import type { ExperimentPauseSnapshot } from "./experiment-pause";

function memoryStorage(): ExperimentSessionStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

describe("experiment session persistence", () => {
  it("reuses an active session in the same tab and creates a new one after completion", () => {
    const storage = memoryStorage();
    const first = bootstrapExperimentSession({ experimentId: "exp", participantId: "P1", storage, createSessionId: () => "S1" });
    const reloaded = bootstrapExperimentSession({ experimentId: "exp", participantId: "P1", storage, now: () => 12_000, createSessionId: () => "S2" });

    expect(reloaded.sessionId).toBe(first.sessionId);
    reloaded.markCompleted();
    expect(bootstrapExperimentSession({ experimentId: "exp", participantId: "P1", storage, createSessionId: () => "S3" }).sessionId).toBe("S3");
  });

  it("isolates sessions by experiment and participant", () => {
    const storage = memoryStorage();
    const first = bootstrapExperimentSession({ experimentId: "exp-a", participantId: "P1", storage, createSessionId: () => "S1" });
    const other = bootstrapExperimentSession({ experimentId: "exp-b", participantId: "P1", storage, createSessionId: () => "S2" });
    const participant = bootstrapExperimentSession({ experimentId: "exp-a", participantId: "P2", storage, createSessionId: () => "S3" });

    expect([first.sessionId, other.sessionId, participant.sessionId]).toEqual(["S1", "S2", "S3"]);
  });

  it("persists a pause snapshot and restores it without a second opportunity", () => {
    const storage = memoryStorage();
    const session = bootstrapExperimentSession({ experimentId: "exp", participantId: "P1", storage, createSessionId: () => "S1" });
    const snapshot: ExperimentPauseSnapshot = {
      mode: "formal",
      status: "paused",
      pauseUsed: true,
      pauseStartedAt: 10_000,
      pauseDurationMs: 0,
      events: [{ type: "pause_confirmed", mode: "formal", at: 10_000 }],
    };

    session.savePauseSnapshot(snapshot, 12_000);
    const reloaded = bootstrapExperimentSession({ experimentId: "exp", participantId: "P1", storage, now: () => 12_000, createSessionId: () => "S2" });
    expect(reloaded.sessionId).toBe("S1");
    expect(reloaded.pauseSnapshot).toMatchObject({ status: "paused", pauseUsed: true });
  });

  it("auto-resumes a persisted pause at the fifteen-minute cap", () => {
    const snapshot: ExperimentPauseSnapshot = {
      mode: "formal",
      status: "paused",
      pauseUsed: true,
      pauseStartedAt: 10_000,
      pauseDurationMs: 0,
      events: [{ type: "pause_confirmed", mode: "formal", at: 10_000 }],
    };
    const restored = restorePauseSnapshot(snapshot, 910_000);

    expect(restored).toMatchObject({ status: "consumed", pauseUsed: true, pauseEndReason: "auto_resume_15m", pauseDurationMs: 900_000 });
    expect(restored.events.filter((event) => event.type === "pause_resumed")).toHaveLength(1);
  });
});
