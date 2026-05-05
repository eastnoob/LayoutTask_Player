import type { PageTimingInfo } from "../types/result";
import { elapsedMs, now } from "../utils/time";

interface PageTimingCollectorOptions {
  nowImpl?: () => number;
  performanceRef?: Pick<Performance, "timeOrigin" | "timing">;
}

// PageTimingCollector reports the whole browser-page duration, not just player duration.
// 它用 performance.timeOrigin 近似“页面打开/导航开始”，所以适合 GitHub Pages 这种纯静态页面。
export class PageTimingCollector {
  private readonly nowImpl: () => number;
  private readonly pageOpenTime: number;
  private readonly source: PageTimingInfo["source"];

  constructor(options: PageTimingCollectorOptions = {}) {
    this.nowImpl = options.nowImpl ?? now;
    const resolved = resolvePageOpenTime(options.performanceRef ?? getPerformanceRef());
    this.pageOpenTime = resolved.pageOpenTime ?? this.nowImpl();
    this.source = resolved.source ?? "collector_created";
  }

  collect(submitTime = this.nowImpl(), playerStartTime?: number): PageTimingInfo {
    // Keep both total and player durations visible. 这样后期能区分“页面加载/阅读耗时”和真正任务耗时。
    return {
      source: this.source,
      page_open_time: this.pageOpenTime,
      submit_time: submitTime,
      total_elapsed_ms: elapsedMs(this.pageOpenTime, submitTime),
      player_start_time: playerStartTime,
      player_elapsed_ms:
        playerStartTime === undefined ? undefined : elapsedMs(playerStartTime, submitTime),
    };
  }
}

function getPerformanceRef(): Pick<Performance, "timeOrigin" | "timing"> | undefined {
  return typeof performance === "undefined" ? undefined : performance;
}

function resolvePageOpenTime(
  performanceRef: Pick<Performance, "timeOrigin" | "timing"> | undefined,
): { pageOpenTime?: number; source?: PageTimingInfo["source"] } {
  if (performanceRef?.timeOrigin && Number.isFinite(performanceRef.timeOrigin)) {
    return {
      pageOpenTime: performanceRef.timeOrigin,
      source: "performance.timeOrigin",
    };
  }

  const navigationStart = performanceRef?.timing?.navigationStart;
  if (navigationStart && Number.isFinite(navigationStart)) {
    return {
      pageOpenTime: navigationStart,
      source: "performance.timing.navigationStart",
    };
  }

  return {};
}
