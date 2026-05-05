import { describe, expect, it } from "vitest";
import { pageTimingSchema } from "./result.schema";

describe("pageTimingSchema", () => {
  it("accepts fractional elapsed milliseconds from performance.timeOrigin", () => {
    const parsed = pageTimingSchema.parse({
      source: "performance.timeOrigin",
      page_open_time: 1777994238876.2,
      submit_time: 1777994518204,
      total_elapsed_ms: 279327.8000488281,
      player_start_time: 1777994239766,
      player_elapsed_ms: 278438,
    });

    expect(parsed.total_elapsed_ms).toBe(279327.8000488281);
  });
});
