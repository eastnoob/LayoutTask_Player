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
});
