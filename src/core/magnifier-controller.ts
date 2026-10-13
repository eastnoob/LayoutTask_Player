// All timestamps and task-window bounds are Unix epoch milliseconds (Date.now),
// matching Recorder and Pause; injected test clocks must use the same time origin.
export interface MagnifierInterval {
  start: number;
  end: number;
}

export interface MagnifierTaskWindow {
  start: number;
  end: number;
}

export interface MagnifierSnapshot {
  use_count: number;
  total_duration_ms: number;
}

export interface MagnifierZoomChange {
  zoomBefore: number;
  zoomAfter: number;
}

export interface MagnifierControllerOptions {
  now?: () => number;
  pauseIntervals?: () => MagnifierInterval[];
  taskWindow?: () => MagnifierTaskWindow | undefined;
}

const DEFAULT_ZOOM = 2;
const MIN_ZOOM = 1.5;
const MAX_ZOOM = 4;
const WHEEL_STEP = 0.25;

export class MagnifierController {
  private readonly now: () => number;
  private readonly pauseIntervals?: () => MagnifierInterval[];
  private readonly taskWindow?: () => MagnifierTaskWindow | undefined;
  private zoom = DEFAULT_ZOOM;
  private useCount = 0;
  private activeStartedAt: number | undefined;
  private completedIntervals: MagnifierInterval[] = [];

  constructor(options: MagnifierControllerOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.pauseIntervals = options.pauseIntervals;
    this.taskWindow = options.taskWindow;
  }

  enter(at = this.now()): boolean {
    if (this.activeStartedAt !== undefined) {
      return false;
    }

    this.activeStartedAt = at;
    this.useCount += 1;
    return true;
  }

  exit(at = this.now()): boolean {
    if (this.activeStartedAt === undefined) {
      return false;
    }

    this.completedIntervals.push({ start: this.activeStartedAt, end: Math.max(this.activeStartedAt, at) });
    this.activeStartedAt = undefined;
    return true;
  }

  isActive(): boolean {
    return this.activeStartedAt !== undefined;
  }

  getZoom(): number {
    return this.zoom;
  }

  wheel(direction: number, _at = this.now()): MagnifierZoomChange | undefined {
    if (!this.isActive() || !Number.isFinite(direction) || direction === 0) {
      return undefined;
    }

    const zoomBefore = this.zoom;
    const zoomAfter = clampMagnifierZoom(zoomBefore + Math.sign(direction) * WHEEL_STEP);
    if (zoomBefore === zoomAfter) {
      return undefined;
    }

    this.zoom = zoomAfter;
    return { zoomBefore, zoomAfter };
  }

  snapshot(taskWindow = this.taskWindow?.()): MagnifierSnapshot {
    const end = this.now();
    const intervals = this.completedIntervals.slice();
    if (this.activeStartedAt !== undefined) {
      intervals.push({ start: this.activeStartedAt, end });
    }

    const cropped = intervals
      .map((interval) => cropInterval(interval, taskWindow))
      .filter((interval): interval is MagnifierInterval => interval !== undefined);
    const pauses = mergeIntervals(
      (this.pauseIntervals?.() ?? [])
        .map((interval) => cropInterval(interval, taskWindow))
        .filter((interval): interval is MagnifierInterval => interval !== undefined),
    );

    return {
      use_count: this.useCount,
      total_duration_ms: cropped.reduce((total, interval) => total + durationWithoutPauses(interval, pauses), 0),
    };
  }
}

export function clampMagnifierZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
}

export const DEFAULT_MAGNIFIER_ZOOM = DEFAULT_ZOOM;
export const MIN_MAGNIFIER_ZOOM = MIN_ZOOM;
export const MAX_MAGNIFIER_ZOOM = MAX_ZOOM;
export const MAGNIFIER_WHEEL_STEP = WHEEL_STEP;

function cropInterval(interval: MagnifierInterval, taskWindow?: MagnifierTaskWindow): MagnifierInterval | undefined {
  const start = taskWindow ? Math.max(interval.start, taskWindow.start) : interval.start;
  const end = taskWindow ? Math.min(interval.end, taskWindow.end) : interval.end;
  return end > start ? { start, end } : undefined;
}

function mergeIntervals(intervals: MagnifierInterval[]): MagnifierInterval[] {
  const sorted = intervals.slice().sort((left, right) => left.start - right.start);
  const merged: MagnifierInterval[] = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
  }
  return merged;
}

function durationWithoutPauses(interval: MagnifierInterval, pauses: MagnifierInterval[]): number {
  let duration = interval.end - interval.start;
  for (const pause of pauses) {
    const start = Math.max(interval.start, pause.start);
    const end = Math.min(interval.end, pause.end);
    duration -= Math.max(0, end - start);
  }
  return Math.max(0, duration);
}
