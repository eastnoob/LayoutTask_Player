import { createSessionId } from "./participant-session";
import { FORMAL_PAUSE_LIMIT_MS } from "./experiment-pause";
import type { ExperimentPauseSnapshot } from "./experiment-pause";

export interface ExperimentSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredSessionRecord {
  schema_version: 1;
  experiment_id: string;
  participant_id: string;
  session_id: string;
  session_status: "active" | "completed";
  pause_used: boolean;
  pause_started_at?: number;
  pause_ended_at?: number;
  pause_duration_ms: number;
  pause_end_reason?: ExperimentPauseSnapshot["pauseEndReason"];
  updated_at: number;
  pause_snapshot?: ExperimentPauseSnapshot;
}

export interface ExperimentSession {
  experimentId: string;
  participantId: string;
  sessionId: string;
  pauseSnapshot?: ExperimentPauseSnapshot;
  savePauseSnapshot(snapshot: ExperimentPauseSnapshot, updatedAt?: number): void;
  markCompleted(updatedAt?: number): void;
}

export interface BootstrapExperimentSessionOptions {
  experimentId: string;
  participantId: string;
  storage?: ExperimentSessionStorage;
  now?: () => number;
  createSessionId?: () => string;
}

const SESSION_PREFIX = "layouttask:session:";

export function bootstrapExperimentSession(options: BootstrapExperimentSessionOptions): ExperimentSession {
  const storage = options.storage ?? getDefaultStorage();
  const now = options.now ?? (() => Date.now());
  const key = sessionKey(options.experimentId, options.participantId);
  const existing = readRecord(storage, key);
  const record = existing?.session_status === "active"
    ? existing
    : createRecord(options, now());
  let pauseSnapshot = record.pause_snapshot
    ? restorePauseSnapshot(record.pause_snapshot, now())
    : undefined;

  if (pauseSnapshot && pauseSnapshot !== record.pause_snapshot) {
    record.pause_snapshot = pauseSnapshot;
    applyPauseFields(record, pauseSnapshot, now());
    storage.setItem(key, JSON.stringify(record));
  }

  const session: ExperimentSession = {
    experimentId: options.experimentId,
    participantId: options.participantId,
    sessionId: record.session_id,
    pauseSnapshot,
    savePauseSnapshot(snapshot, updatedAt = now()) {
      pauseSnapshot = cloneSnapshot(snapshot);
      session.pauseSnapshot = pauseSnapshot;
      const next = readRecord(storage, key) ?? record;
      next.pause_snapshot = pauseSnapshot;
      applyPauseFields(next, pauseSnapshot, updatedAt);
      storage.setItem(key, JSON.stringify(next));
    },
    markCompleted(updatedAt = now()) {
      const next = readRecord(storage, key) ?? record;
      next.session_status = "completed";
      next.updated_at = updatedAt;
      storage.setItem(key, JSON.stringify(next));
    },
  };

  if (!existing || existing.session_status === "completed") {
    storage.setItem(key, JSON.stringify(record));
  }
  return session;
}

function getDefaultStorage(): ExperimentSessionStorage {
  if (typeof globalThis.sessionStorage !== "undefined") {
    return globalThis.sessionStorage;
  }
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

export function restorePauseSnapshot(snapshot: ExperimentPauseSnapshot, now: number): ExperimentPauseSnapshot {
  const restored = cloneSnapshot(snapshot);
  if (restored.mode !== "formal" || restored.status !== "paused" || restored.pauseStartedAt === undefined) {
    return restored;
  }
  if (now - restored.pauseStartedAt < FORMAL_PAUSE_LIMIT_MS) {
    return restored;
  }
  const endedAt = restored.pauseStartedAt + FORMAL_PAUSE_LIMIT_MS;
  restored.status = "consumed";
  restored.pauseEndedAt = endedAt;
  restored.pauseDurationMs = FORMAL_PAUSE_LIMIT_MS;
  restored.pauseEndReason = "auto_resume_15m";
  if (!restored.events.some((event) => event.type === "pause_resumed")) {
    restored.events.push({ type: "pause_resumed", mode: "formal", at: endedAt, reason: "auto_resume_15m" });
  }
  return restored;
}

function createRecord(options: BootstrapExperimentSessionOptions, updatedAt: number): StoredSessionRecord {
  return {
    schema_version: 1,
    experiment_id: options.experimentId,
    participant_id: options.participantId,
    session_id: (options.createSessionId ?? createSessionId)(),
    session_status: "active",
    pause_used: false,
    pause_duration_ms: 0,
    updated_at: updatedAt,
  };
}

function applyPauseFields(record: StoredSessionRecord, snapshot: ExperimentPauseSnapshot, updatedAt: number): void {
  record.pause_used = snapshot.pauseUsed;
  record.pause_started_at = snapshot.pauseStartedAt;
  record.pause_ended_at = snapshot.pauseEndedAt;
  record.pause_duration_ms = snapshot.pauseDurationMs;
  record.pause_end_reason = snapshot.pauseEndReason;
  record.updated_at = updatedAt;
}

function readRecord(storage: ExperimentSessionStorage, key: string): StoredSessionRecord | undefined {
  const raw = storage.getItem(key);
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as StoredSessionRecord;
  } catch {
    return undefined;
  }
}

function sessionKey(experimentId: string, participantId: string): string {
  return `${SESSION_PREFIX}${experimentId}:${participantId}`;
}

function cloneSnapshot(snapshot: ExperimentPauseSnapshot): ExperimentPauseSnapshot {
  return { ...snapshot, events: snapshot.events.map((event) => ({ ...event })) };
}
