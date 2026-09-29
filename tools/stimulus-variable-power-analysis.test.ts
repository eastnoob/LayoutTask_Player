import { describe, expect, it } from "vitest";
import { matchTasksToDesign } from "./stimulus-variable-power-analysis";

describe("stimulus task mapping", () => {
  it("matches every task to exactly one design combination", () => {
    expect(matchTasksToDesign(
      [{ combination_id: "abc" }],
      ["scene_abc"],
    )).toEqual([{ combination_id: "abc", task_id: "scene_abc" }]);
  });
});
