import type { CalculateTaskRewardInput, ExperimentRewardSummary, RewardGroupResult, TaskRewardSummary } from "../types/reward";
import type { LayoutTaskResult } from "../types/result";
import { asRelativeFinalState } from "../types/reward";

export function calculateTaskReward(input: CalculateTaskRewardInput): TaskRewardSummary {
  const base: TaskRewardSummary = {
    enabled: input.config.enabled,
    baseRewardCents: input.config.baseRewardCents,
    rewardCents: 0,
    cumulativeRewardCents: input.cumulativeRewardCents,
    referenceVersion: input.reference?.reward_version ?? input.config.referenceVersion,
    groups: [],
    skippedGroupIds: [],
    correctPositionCount: 0,
    correctRotationCount: 0,
    fullyCorrectCount: 0,
    fullyFailedCount: 0,
    scorableGroupCount: 0,
  };

  if (!input.config.enabled || !input.reference) {
    return base;
  }

  const relative = asRelativeFinalState(input.finalState);
  const groups = new Map<string, { objectId: string; role?: string }>();
  for (const object of input.objects) {
    if (object.role !== "variable") {
      continue;
    }
    const groupId = object.group_id ?? object.id;
    if (!groups.has(groupId)) {
      groups.set(groupId, { objectId: object.id, role: object.role });
    }
  }

  for (const [groupId, group] of groups) {
    const referenceEntry = Object.entries(input.reference.objects).find(([, value]) => {
      return (value.group_id ?? "") === groupId && (value.role === undefined || value.role === group.role);
    });
    if (!referenceEntry) {
      base.skippedGroupIds.push(groupId);
      continue;
    }

    const [, referenceObject] = referenceEntry;
    const scorable = referenceObject.scorable ?? (referenceObject.target ? true : undefined);
    if (scorable === undefined) {
      base.skippedGroupIds.push(groupId);
      continue;
    }
    const groupReward = scorable
      ? scoreScorableGroup(input, group.objectId, referenceObject, relative)
      : createUnscorableGroup(input, groupId);
    base.groups.push(groupReward);
    base.rewardCents += groupReward.rewardCents;
    base.cumulativeRewardCents = groupReward.cumulativeRewardCents;
  }

  Object.assign(base, summarizeRewardGroups(base.groups));
  return base;
}

export function summarizeExperimentRewards(results: LayoutTaskResult[]): ExperimentRewardSummary {
  const rewarded = results.map((result) => result.reward).filter((reward): reward is TaskRewardSummary => Boolean(reward));
  const first = rewarded[0];
  const earnedRewardCents = rewarded.reduce((total, reward) => total + reward.rewardCents, 0);
  const groupSummary = summarizeRewardGroups(rewarded.flatMap((reward) => reward.groups));
  return {
    enabled: Boolean(first?.enabled),
    baseRewardCents: first?.baseRewardCents ?? 0,
    earnedRewardCents,
    totalRewardCents: (first?.baseRewardCents ?? 0) + earnedRewardCents,
    formalTrialCount: results.length,
    rewardedGroupCount: rewarded.reduce((total, reward) => total + reward.groups.length, 0),
    ...groupSummary,
  };
}

function scoreScorableGroup(
  input: CalculateTaskRewardInput,
  objectId: string,
  referenceObject: NonNullable<CalculateTaskRewardInput["reference"]>["objects"][string],
  relative: ReturnType<typeof asRelativeFinalState>,
): RewardGroupResult {
  const groupId = referenceObject.group_id ?? objectId;
  const target = referenceObject.target?.relative;
  const answer = relative[objectId];
  const positionCorrect = Boolean(
    target && answer && answer.dx_steps === target.dx_steps && answer.dy_steps === target.dy_steps,
  );
  const rotationCorrect = Boolean(target && answer && answer.rotation_steps === target.rotation_steps);
  const movementRewardCents = positionCorrect ? input.config.movementRewardCents : 0;
  const rotationRewardCents = rotationCorrect ? input.config.rotationRewardCents : 0;
  const rewardCents = movementRewardCents + rotationRewardCents;
  return {
    groupId,
    scorable: true,
    positionCorrect,
    rotationCorrect,
    bothCorrect: positionCorrect && rotationCorrect,
    bothWrong: !positionCorrect && !rotationCorrect,
    movementRewardCents,
    rotationRewardCents,
    rewardCents,
    cumulativeRewardCents: input.cumulativeRewardCents + rewardCents,
  };
}

function createUnscorableGroup(input: CalculateTaskRewardInput, groupId: string): RewardGroupResult {
  const movementRewardCents = input.config.movementRewardCents;
  const rotationRewardCents = input.config.rotationRewardCents;
  const rewardCents = movementRewardCents + rotationRewardCents;
  return {
    groupId,
    scorable: false,
    positionCorrect: null,
    rotationCorrect: null,
    bothCorrect: null,
    bothWrong: null,
    movementRewardCents,
    rotationRewardCents,
    rewardCents,
    cumulativeRewardCents: input.cumulativeRewardCents + rewardCents,
  };
}

function summarizeRewardGroups(groups: RewardGroupResult[]): Pick<
  TaskRewardSummary,
  "correctPositionCount" | "correctRotationCount" | "fullyCorrectCount" | "fullyFailedCount" | "scorableGroupCount"
> {
  const scorable = groups.filter((group) => group.scorable);
  return {
    correctPositionCount: scorable.filter((group) => group.positionCorrect === true).length,
    correctRotationCount: scorable.filter((group) => group.rotationCorrect === true).length,
    fullyCorrectCount: scorable.filter((group) => group.bothCorrect === true).length,
    fullyFailedCount: scorable.filter((group) => group.bothWrong === true).length,
    scorableGroupCount: scorable.length,
  };
}
