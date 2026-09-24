import { describe, expect, it } from "vitest";
import {
  generateWilliamsBaseSequences,
  insertRepeatedPresentations,
  selectSequence,
} from "./schedule-generator";

const taskIds = Array.from({ length: 23 }, (_, index) => `scene_${String(index + 1).padStart(2, "0")}`);

describe("formal schedule generator", () => {
  it("generates 46 Williams base sequences for 23 unique scenes", () => {
    const schedule = generateWilliamsBaseSequences(taskIds);

    expect(schedule.baseSequenceCount).toBe(46);
    expect(schedule.sequences).toHaveLength(46);
    expect(schedule.uniqueSceneCount).toBe(23);
  });

  it("inserts two repeat presentations with complete metadata and seven intervening trials", () => {
    const schedule = generateWilliamsBaseSequences(taskIds);
    const presentations = insertRepeatedPresentations(
      schedule.sequences[0],
      ["scene_08", "scene_09"],
      7,
    );

    expect(presentations).toHaveLength(25);
    expect(new Set(presentations.map((item) => item.presentationId)).size).toBe(25);
    expect(presentations.map((item) => item.trialIndex)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    );

    for (const taskId of ["scene_08", "scene_09"]) {
      const matches = presentations.filter((item) => item.taskId === taskId);
      expect(matches).toHaveLength(2);
      expect(matches[0]).toMatchObject({
        repeatGroupId: taskId,
        repeatIndex: 1,
        repeatOfTaskId: null,
      });
      expect(matches[1]).toMatchObject({
        repeatGroupId: taskId,
        repeatIndex: 2,
        repeatOfTaskId: taskId,
      });
      expect(matches[1].trialIndex - matches[0].trialIndex).toBeGreaterThanOrEqual(8);
    }
  });

  it("maps participant 47 to sequence 1", () => {
    const schedule = generateWilliamsBaseSequences(taskIds);
    expect(selectSequence(schedule, 47).sequenceId).toBe(1);
  });

  it("rejects tutorial tasks from formal schedule generation", () => {
    expect(() => generateWilliamsBaseSequences([...taskIds, "scene_edc634ac7856"], {
      tutorialTaskId: "scene_edc634ac7856",
    })).toThrow(
      "Tutorial task scene_edc634ac7856 cannot be scheduled as formal",
    );
  });
});
