import { describe, expect, it } from "vitest";
import { createExperimentCsvFiles } from "./experiment-data";

describe("reward export", () => {
  it("writes one reward row per group presentation and a final summary", () => {
    const result = {
      schema: "layouttask.result.v1" as const,
      exp: "exp-1",
      qid: "Q1",
      task_id: "scene-1",
      session: "S1",
      start_time: 1,
      end_time: 2,
      duration_ms: 1,
      events: [],
      final_state: { variable: { dx_steps: 1, dy_steps: 0, rotation_steps: 2 } },
      locked: true as const,
      reward: {
        enabled: true,
        baseRewardCents: 200,
        rewardCents: 12,
        cumulativeRewardCents: 12,
        groups: [{
          groupId: "group-1",
          scorable: true,
          positionCorrect: true,
          rotationCorrect: true,
          bothCorrect: true,
          bothWrong: false,
          movementRewardCents: 6,
          rotationRewardCents: 6,
          rewardCents: 12,
          cumulativeRewardCents: 12,
        }],
        skippedGroupIds: [],
        correctPositionCount: 1,
        correctRotationCount: 1,
        fullyCorrectCount: 1,
        fullyFailedCount: 0,
        scorableGroupCount: 1,
      },
    };
    const files = createExperimentCsvFiles({
      participantId: "P1",
      sessionId: "S1",
      experimentId: "exp-1",
      referenceMode: "persistent",
      startTime: 1,
      endTime: 2,
      tutorialCompleted: false,
      tutorialDurationMs: 0,
      trialOrder: ["scene-1"],
      trialResults: [{ trialType: "formal", taskId: "scene-1", result, presentation: {
        presentationId: "presentation-1",
        repeatGroupId: null,
        repeatIndex: 0,
        repeatOfTaskId: null,
        trialIndex: 1,
        trialTotal: 1,
        taskId: "scene-1",
      } }],
    });

    const rewards = files.find((file) => file.filename.includes("_rewards_"));
    expect(rewards?.data).toContain("group-1");
    expect(rewards?.data.split("\n")).toHaveLength(3);
    expect(JSON.parse(files.find((file) => file.filename.includes("_debug_"))!.data).reward).toMatchObject({
      earnedRewardCents: 12,
      totalRewardCents: 212,
    });
  });
});
