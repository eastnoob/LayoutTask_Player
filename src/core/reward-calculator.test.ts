import { describe, expect, it } from "vitest";
import { calculateTaskReward } from "./reward-calculator";

const config = {
  enabled: true,
  baseRewardCents: 200,
  movementRewardCents: 6,
  rotationRewardCents: 6,
  referenceVersion: "answers-v1",
};

describe("calculateTaskReward", () => {
  it("awards independent movement and rotation components per group", () => {
    const result = calculateTaskReward({
      config,
      objects: [
        { id: "fixed-a", role: "fixed", group_id: "group-a" },
        { id: "variable-a", role: "variable", group_id: "group-a" },
      ],
      reference: {
        qid: "Q1",
        objects: {
          "variable-a": {
            role: "variable",
            group_id: "group-a",
            scorable: true,
            target: { relative: { dx_steps: 1, dy_steps: -2, rotation_steps: 3 } },
          },
        },
      },
      finalState: { "variable-a": { dx_steps: 1, dy_steps: -2, rotation_steps: 0 } },
      cumulativeRewardCents: 200,
    });

    expect(result.rewardCents).toBe(6);
    expect(result.groups).toEqual([
      expect.objectContaining({
        groupId: "group-a",
        positionCorrect: true,
        rotationCorrect: false,
        rewardCents: 6,
        cumulativeRewardCents: 206,
      }),
    ]);
  });

  it("pays the derived full amount for an explicitly unscorable group", () => {
    const result = calculateTaskReward({
      config,
      objects: [{ id: "variable-b", role: "variable", group_id: "group-b" }],
      reference: {
        qid: "Q1",
        objects: {
          "variable-b": { role: "variable", group_id: "group-b", scorable: false },
        },
      },
      finalState: { "variable-b": { dx_steps: 4, dy_steps: 4, rotation_steps: -2 } },
      cumulativeRewardCents: 206,
    });

    expect(result.rewardCents).toBe(12);
    expect(result.groups[0]).toMatchObject({
      scorable: false,
      positionCorrect: null,
      rotationCorrect: null,
      rewardCents: 12,
      cumulativeRewardCents: 218,
    });
  });

  it("does not double-count fixed and variable objects sharing a group", () => {
    const result = calculateTaskReward({
      config,
      objects: [
        { id: "fixed", role: "fixed", group_id: "group-c" },
        { id: "variable", role: "variable", group_id: "group-c" },
      ],
      reference: {
        qid: "Q1",
        objects: {
          fixed: { role: "fixed", group_id: "group-c", target: { relative: { dx_steps: 0, dy_steps: 0, rotation_steps: 0 } } },
          variable: { role: "variable", group_id: "group-c", target: { relative: { dx_steps: 0, dy_steps: 0, rotation_steps: 0 } } },
        },
      },
      finalState: {
        fixed: { dx_steps: 0, dy_steps: 0, rotation_steps: 0 },
        variable: { dx_steps: 0, dy_steps: 0, rotation_steps: 0 },
      },
      cumulativeRewardCents: 0,
    });

    expect(result.groups).toHaveLength(1);
    expect(result.rewardCents).toBe(12);
  });
});
