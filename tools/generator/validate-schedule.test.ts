import { describe, expect, it } from "vitest";
import { validateSchedule } from "./validate-schedule";
import type { ExperimentSchedule } from "../../src/types/schedule";

function schedule(): ExperimentSchedule {
  return {
    schema: "layouttask.schedule.v1",
    strategy: "williams_balanced_first_order",
    uniqueSceneCount: 2,
    presentationCount: 4,
    baseSequenceCount: 2,
    minimumInterveningTrials: 1,
    repeatGroups: ["scene_001"],
    sequences: [
      {
        sequenceId: 0,
        presentations: [
          { presentationId: "p1", taskId: "scene_001", repeatGroupId: null, repeatIndex: 0, repeatOfTaskId: null, trialIndex: 1, trialTotal: 4 },
          { presentationId: "p2", taskId: "scene_002", repeatGroupId: null, repeatIndex: 0, repeatOfTaskId: null, trialIndex: 2, trialTotal: 4 },
          { presentationId: "p3", taskId: "scene_001", repeatGroupId: "scene_001", repeatIndex: 1, repeatOfTaskId: "scene_001", trialIndex: 3, trialTotal: 4 },
          { presentationId: "p4", taskId: "scene_002", repeatGroupId: null, repeatIndex: 0, repeatOfTaskId: null, trialIndex: 4, trialTotal: 4 },
        ],
      },
    ],
  };
}

describe("validateSchedule", () => {
  it("accepts presentations backed by the formal manifest", () => {
    expect(validateSchedule({ schedule: schedule(), formalTaskIds: ["scene_001", "scene_002"], tutorialTaskId: "tutorial_room" })).toEqual({ ok: true, failures: [] });
  });

  it("rejects tutorial contamination and wrong presentation counts", () => {
    const value = schedule();
    value.presentationCount = 3;
    value.sequences[0].presentations[0].taskId = "tutorial_room";
    const report = validateSchedule({ schedule: value, formalTaskIds: ["scene_001", "scene_002"], tutorialTaskId: "tutorial_room" });

    expect(report.ok).toBe(false);
    expect(report.failures.map((failure) => failure.type)).toEqual(expect.arrayContaining(["presentation_count", "tutorial_contamination"]));
  });
});
