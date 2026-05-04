import { describe, expect, it } from "vitest";
import { parseLayoutTaskUrlParams } from "./url";

describe("parseLayoutTaskUrlParams", () => {
  it("parses task and q parameters", () => {
    expect(parseLayoutTaskUrlParams("?task=room01&q=Q1")).toEqual({
      task: "room01",
      q: "Q1",
      base: undefined,
    });
  });

  it("handles empty input", () => {
    expect(parseLayoutTaskUrlParams("")).toEqual({
      task: undefined,
      q: undefined,
      base: undefined,
    });
  });
});
