import { describe, expect, it } from "vitest";
import { buildObservationTable, matchTasksToDesign } from "./stimulus-variable-power-analysis";

describe("stimulus task mapping", () => {
  it("matches every task to exactly one design combination", () => {
    expect(matchTasksToDesign(
      [{ combination_id: "abc" }],
      ["scene_abc"],
    )).toEqual([{ combination_id: "abc", task_id: "scene_abc" }]);
  });

  it("keeps repeated formal presentations as separate model observations", () => {
    const rows = buildObservationTable(
      [
        { trial_type: "tutorial", participant_id: "P1", session_id: "S1", trial_index: "0", task_id: "scene_abc", result_json: "{}" },
        { trial_type: "formal", participant_id: "P1", session_id: "S1", trial_index: "1", task_id: "scene_abc", result_json: JSON.stringify({ final_state: { scene_abc_m01_variable: { dx_steps: 0, dy_steps: 0, rotation_steps: 0 } } }) },
        { trial_type: "formal", participant_id: "P1", session_id: "S1", trial_index: "2", task_id: "scene_abc", result_json: JSON.stringify({ final_state: { scene_abc_m01_variable: { dx_steps: 1, dy_steps: 0, rotation_steps: 0 } } }) },
      ],
      [{ combination_id: "abc", "M01.point_id": "P01", "M01.featureCueVisibility": "0.5" }],
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.trial_index)).toEqual(["1", "2"]);
    expect(rows[0].point_id).toBe("P01");
    expect(rows[0].featureCueVisibility).toBe(0.5);
  });
});
