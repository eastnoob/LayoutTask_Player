import { describe, expect, it } from "vitest";
import { getDefaultExperimentConfigPath, isDeveloperDebugExperiment, isTutorialBaseUrl, parseLayoutTaskUrlParams } from "./url";

describe("getDefaultExperimentConfigPath", () => {
  it("uses the developer experiment only for an unspecified dev config", () => {
    expect(getDefaultExperimentConfigPath(undefined, true)).toBe("experiment-debug.json");
    expect(getDefaultExperimentConfigPath("experiment-persistent.json", true)).toBe("experiment-persistent.json");
    expect(getDefaultExperimentConfigPath(undefined, false)).toBe("experiment.json");
  });

  it("uses an entry-declared release config when no URL config is provided", () => {
    expect(getDefaultExperimentConfigPath(undefined, false, "experiment-en.json")).toBe("experiment-en.json");
    expect(getDefaultExperimentConfigPath("experiment-zh.json", false, "experiment-en.json")).toBe("experiment-zh.json");
  });
});

describe("isDeveloperDebugExperiment", () => {
  it("recognizes an implicit dev default and the explicit debug flag", () => {
    expect(isDeveloperDebugExperiment("experiment-debug.json", null)).toBe(true);
    expect(isDeveloperDebugExperiment("experiment-debug-zh.json", null)).toBe(true);
    expect(isDeveloperDebugExperiment("experiment-debug-en.json", null)).toBe(true);
    expect(isDeveloperDebugExperiment("experiment.json", "1")).toBe(true);
    expect(isDeveloperDebugExperiment("experiment.json", null)).toBe(false);
  });
});

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

  it("parses a positive replacement sequence id", () => {
    expect(parseLayoutTaskUrlParams("?sequence=6").requestedSequenceId).toBe("6");
  });

  it.each(["0", "-1", "1.5", "", "abc"])("rejects malformed sequence %s", (sequence) => {
    expect(() => parseLayoutTaskUrlParams(`?sequence=${sequence}`)).toThrow("sequence");
  });
});

describe("isTutorialBaseUrl", () => {
  it("recognizes the standalone tutorial package without affecting formal packages", () => {
    expect(isTutorialBaseUrl("layout-task-tutorial/" )).toBe(true);
    expect(isTutorialBaseUrl("../layout-task-tutorial/", "http://localhost/experiment/")).toBe(true);
    expect(isTutorialBaseUrl("../layout-task-run12-core23-preview/", "http://localhost/experiment/")).toBe(false);
  });
});
