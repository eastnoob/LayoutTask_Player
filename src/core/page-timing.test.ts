import { describe, expect, it } from "vitest";
import { PageTimingCollector } from "./page-timing";

describe("PageTimingCollector", () => {
  it("uses performance.timeOrigin to measure total page elapsed time", () => {
    const collector = new PageTimingCollector({
      nowImpl: () => 5_000,
      performanceRef: {
        timeOrigin: 1_000,
        timing: {} as PerformanceTiming,
      },
    });

    const result = collector.collect(4_500, 2_000);

    expect(result).toEqual({
      source: "performance.timeOrigin",
      page_open_time: 1_000,
      submit_time: 4_500,
      total_elapsed_ms: 3_500,
      player_start_time: 2_000,
      player_elapsed_ms: 2_500,
    });
  });

  it("falls back to collector creation time when browser timing is unavailable", () => {
    const collector = new PageTimingCollector({
      nowImpl: () => 8_000,
      performanceRef: {} as Performance,
    });

    const result = collector.collect(9_250);

    expect(result.source).toBe("collector_created");
    expect(result.page_open_time).toBe(8_000);
    expect(result.total_elapsed_ms).toBe(1_250);
  });

  it("reports active durations through the shared pause clock", () => {
    const collector = new PageTimingCollector({
      nowImpl: () => 10_000,
      performanceRef: { timeOrigin: 1_000, timing: {} as PerformanceTiming },
      pause: {
        getActiveElapsedMs: (startAt, endAt = startAt) => endAt - startAt - 5_000,
      },
    });

    expect(collector.collect(10_000, 1_000)).toMatchObject({
      total_elapsed_ms: 9_000,
      active_total_elapsed_ms: 4_000,
      player_elapsed_ms: 9_000,
      active_player_elapsed_ms: 4_000,
    });
  });

  it("subtracts magnifier time only from the effective player duration", () => {
    const collector = new PageTimingCollector({
      nowImpl: () => 10_000,
      performanceRef: { timeOrigin: 1_000, timing: {} as PerformanceTiming },
      pause: {
        getActiveElapsedMs: (startAt, endAt = startAt) => endAt - startAt - 1_000,
      },
    });

    expect(collector.collect(10_000, 1_000, 2_000)).toMatchObject({
      player_elapsed_ms: 9_000,
      active_player_elapsed_ms: 8_000,
      effective_player_elapsed_ms: 6_000,
    });
  });
});
