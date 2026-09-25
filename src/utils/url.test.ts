import { describe, expect, it } from "vitest";
import { getDefaultExperimentConfigPath, isDeveloperDebugExperiment, isTutorialBaseUrl, parseLayoutTaskUrlParams } from "./url";

describe("getDefaultExperimentConfigPath", () => {
  it("uses the developer experiment only for an unspecified dev config", () => {
    expect(getDefaultExperimentConfigPath(undefined, true)).toBe("experiment-debug.json");
    expect(getDefaultExperimentConfigPath("experiment-persistent.json", true)).toBe("experiment-persistent.json");
    expect(getDefaultExperimentConfigPath(undefined, false)).toBe("experiment.json");
  });
});

describe("isDeveloperDebugExperiment", () => {
  it("recognizes an implicit dev default and the explicit debug flag", () => {
    expect(isDeveloperDebugExperiment("experiment-debug.json", null)).toBe(true);
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
});

describe("isTutorialBaseUrl", () => {
  it("recognizes the standalone tutorial package without affecting formal packages", () => {
    expect(isTutorialBaseUrl("layout-task-tutorial/" )).toBe(true);
    expect(isTutorialBaseUrl("../layout-task-tutorial/", "http://localhost/experiment/")).toBe(true);
    expect(isTutorialBaseUrl("../layout-task-run12-core23-preview/", "http://localhost/experiment/")).toBe(false);
  });
});
