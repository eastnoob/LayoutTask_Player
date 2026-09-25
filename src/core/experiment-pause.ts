import type { PauseEndReason, PauseEvent, PauseMode } from "../types/result";

export type PauseStatus =
  | "available"
  | "confirming"
  | "paused"
  | "consumed"
  | "practice_available"
  | "practice_paused"
  | "practice_consumed";

export interface ExperimentPauseSnapshot {
  mode: PauseMode;
  status: PauseStatus;
  pauseUsed: boolean;
  pauseStartedAt?: number;
  pauseEndedAt?: number;
  pauseDurationMs: number;
  pauseEndReason?: PauseEndReason;
  events: PauseEvent[];
}

export interface ExperimentPauseControllerOptions {
  mode: PauseMode;
  now?: () => number;
  onChange?: (snapshot: ExperimentPauseSnapshot) => void;
  restore?: ExperimentPauseSnapshot;
}

const FORMAL_PAUSE_LIMIT_MS = 15 * 60 * 1_000;
const PRACTICE_PAUSE_LIMIT_MS = 10 * 1_000;

export class ExperimentPauseController {
  private readonly mode: PauseMode;
  private readonly now: () => number;
  private readonly onChange?: (snapshot: ExperimentPauseSnapshot) => void;
  private current: ExperimentPauseSnapshot;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<(snapshot: ExperimentPauseSnapshot) => void>();

  constructor(options: ExperimentPauseControllerOptions) {
    this.mode = options.mode;
    this.now = options.now ?? (() => Date.now());
    this.onChange = options.onChange;
    this.current = options.restore ? cloneSnapshot(options.restore) : {
      mode: options.mode,
      status: options.mode === "formal" ? "available" : "practice_available",
      pauseUsed: false,
      pauseDurationMs: 0,
      events: [],
    };

    if (this.current.status === "paused") {
      this.scheduleAutoResume();
      this.advance();
    }
  }

  snapshot(): ExperimentPauseSnapshot {
    return cloneSnapshot(this.current);
  }

  isPaused(): boolean {
    return this.current.status === "paused" || this.current.status === "practice_paused";
  }

  subscribe(listener: (snapshot: ExperimentPauseSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  requestPause(): void {
    if (this.mode === "tutorial_practice") {
      if (this.current.status !== "practice_available") {
        throw new Error("tutorial pause is already consumed");
      }
      this.startPause("practice_paused");
      return;
    }
    if (this.current.status !== "available") {
      throw new Error("formal pause is already consumed");
    }
    this.current.status = "confirming";
    this.emit();
  }

  cancelConfirmation(): void {
    if (this.current.status !== "confirming") {
      return;
    }
    this.current.status = "available";
    this.emit();
  }

  confirmPause(): void {
    if (this.mode === "tutorial_practice") {
      if (this.current.status === "practice_available") {
        this.startPause("practice_paused");
      }
      return;
    }
    if (this.current.status !== "confirming") {
      throw new Error("formal pause is not awaiting confirmation");
    }
    this.current.pauseUsed = true;
    this.startPause("paused");
  }

  resume(reason: PauseEndReason): void {
    if (!this.isPaused() || !this.current.pauseStartedAt) {
      return;
    }
    this.clearTimer();
    const endedAt = Math.max(this.current.pauseStartedAt, this.now());
    this.current.pauseEndedAt = endedAt;
    this.current.pauseDurationMs += endedAt - this.current.pauseStartedAt;
    this.current.pauseEndReason = reason;
    this.current.status = this.mode === "formal" ? "consumed" : "practice_consumed";
    this.current.events.push({ type: "pause_resumed", mode: this.mode, at: endedAt, reason });
    this.emit();
  }

  advance(): void {
    if (!this.isPaused() || !this.current.pauseStartedAt) {
      return;
    }
    const limit = this.mode === "formal" ? FORMAL_PAUSE_LIMIT_MS : PRACTICE_PAUSE_LIMIT_MS;
    if (this.mode === "formal" && this.now() - this.current.pauseStartedAt >= limit) {
      this.resume("auto_resume_15m");
    }
  }

  getActiveElapsedMs(startAt: number, endAt = this.now()): number {
    const intervals = getPauseIntervals(this.current);
    const pausedMs = intervals.reduce((total, interval) => {
      const overlapStart = Math.max(startAt, interval.start);
      const overlapEnd = Math.min(endAt, interval.end);
      return total + Math.max(0, overlapEnd - overlapStart);
    }, 0);
    return Math.max(0, endAt - startAt - pausedMs);
  }

  private startPause(status: "paused" | "practice_paused"): void {
    const startedAt = this.now();
    this.current.status = status;
    this.current.pauseStartedAt = startedAt;
    this.current.pauseEndedAt = undefined;
    this.current.pauseEndReason = undefined;
    this.current.events.push({ type: "pause_confirmed", mode: this.mode, at: startedAt });
    this.scheduleAutoResume();
    this.emit();
  }

  private scheduleAutoResume(): void {
    this.clearTimer();
    if (!this.current.pauseStartedAt) {
      return;
    }
    const limit = this.mode === "formal" ? FORMAL_PAUSE_LIMIT_MS : PRACTICE_PAUSE_LIMIT_MS;
    const remaining = Math.max(0, limit - (this.now() - this.current.pauseStartedAt));
    this.timer = setTimeout(() => this.advance(), remaining);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.onChange?.(snapshot);
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

function getPauseIntervals(snapshot: ExperimentPauseSnapshot): Array<{ start: number; end: number }> {
  const intervals: Array<{ start: number; end: number }> = [];
  let start: number | undefined;
  snapshot.events.forEach((event) => {
    if (event.type === "pause_confirmed") {
      start = event.at;
    } else if (start !== undefined) {
      intervals.push({ start, end: event.at });
      start = undefined;
    }
  });
  if (start !== undefined) {
    intervals.push({ start, end: snapshot.pauseEndedAt ?? Date.now() });
  }
  return intervals;
}

function cloneSnapshot(snapshot: ExperimentPauseSnapshot): ExperimentPauseSnapshot {
  return { ...snapshot, events: snapshot.events.map((event) => ({ ...event })) };
}

export { FORMAL_PAUSE_LIMIT_MS, PRACTICE_PAUSE_LIMIT_MS };
