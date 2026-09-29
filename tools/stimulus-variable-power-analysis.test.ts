import { describe, expect, it } from "vitest";
import { auditPredictors, buildObservationTable, matchTasksToDesign, scorePosition, scoreRotation } from "./stimulus-variable-power-analysis";

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

  it("scores position axes separately and rotation circularly", () => {
    expect(scorePosition({ dx_steps: 2, dy_steps: -1 }, { dx_steps: 0, dy_steps: 1 })).toEqual({ x_error: 2, y_error: 2, position_error: 4, position_exact: false });
    expect(scoreRotation(0, 7)).toEqual({ rotation_error_steps: 1, rotation_exact: false });
    expect(scoreRotation(3, 3)).toEqual({ rotation_error_steps: 0, rotation_exact: true });
  });

  it("separates core, exploratory, and excluded predictors", () => {
    const audit = auditPredictors([
      { model_id: "M01", featureCueVisibility: 0.2, volumeAxisRetention: 0.5, asymmetricCueVisibility: 1, "audit.bad": 9 },
      { model_id: "M01", featureCueVisibility: 0.8, volumeAxisRetention: 0.5, asymmetricCueVisibility: 0, "audit.bad": 9 },
    ]);
    expect(audit.find((item) => item.variable === "featureCueVisibility")?.category).toBe("core");
    expect(audit.find((item) => item.variable === "volumeAxisRetention")?.category).toBe("excluded_constant");
    expect(audit.find((item) => item.variable === "asymmetricCueVisibility")?.category).toBe("exploratory");
    expect(audit.find((item) => item.variable === "audit.bad")?.category).toBe("excluded_namespace");
  });
});
