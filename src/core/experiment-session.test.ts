import { describe, expect, it } from "vitest";
import {
  bootstrapExperimentSession,
  type ExperimentSessionStorage,
  restorePauseSnapshot,
} from "./experiment-session";
import type { ExperimentPauseSnapshot } from "./experiment-pause";
import type { ConsentRecord } from "./experiment-consent";

function memoryStorage(): ExperimentSessionStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

describe("experiment session persistence", () => {
  it("persists assignment metadata with the active session", () => {
    const storage = memoryStorage();
    const assignment = {
      assignment_id: "assign-1",
      participant_number: 2,
      sequence_id: "sequence-02",
      schedule_version: "run12-williams-v1",
      assignment_mode: "replacement" as const,
      requested_sequence_id: "sequence-02",
      replacement_attempt: 1,
      rotation_index: null,
    };
    bootstrapExperimentSession({ experimentId: "exp", participantId: "P1", storage, assignment, createSessionId: () => "S1" });
    const reloaded = bootstrapExperimentSession({ experimentId: "exp", participantId: "P1", storage, createSessionId: () => "S2" });
    expect(reloaded.assignment).toEqual(assignment);
  });

  it("persists the independently collected Prolific ID with the active session", () => {
    const storage = memoryStorage();
    bootstrapExperimentSession({
      experimentId: "exp",
      participantId: "P1",
      prolificId: " 5f2a-original ",
      storage,
      createSessionId: () => "S1",
    });
    const reloaded = bootstrapExperimentSession({
      experimentId: "exp",
      participantId: "P1",
      storage,
      createSessionId: () => "S2",
    });

    expect(reloaded.prolificId).toBe(" 5f2a-original ");
  });

  it("persists the accepted informed-consent record with the active session", () => {
    const storage = memoryStorage();
    const consent: ConsentRecord = {
      consent_version: "informed-consent-2026-10-03-v1",
      notice_version: "data-protection-2026-10-03-v1",
      locale: "en-US",
      consented_at: "2026-10-03T12:00:00.000Z",
      signature_method: "checkbox_confirmation",
      voluntary_participation_confirmed: true,
      questions_answered_confirmed: true,
    prestudy_document_confirmed: true,
    withdrawal_right_understood_confirmed: true,
    data_protection_statement_confirmed: true,
    developer_mode: false,
    };
    const session = bootstrapExperimentSession({
      experimentId: "exp",
      participantId: "P1",
      consent,
      storage,
      createSessionId: () => "S1",
    });
    const reloaded = bootstrapExperimentSession({ experimentId: "exp", participantId: "P1", storage, createSessionId: () => "S2" });

    expect(session.consent).toEqual(consent);
    expect(reloaded.consent).toEqual(consent);
  });

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
