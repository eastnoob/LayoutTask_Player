import type { FinalState, RelativeFinalState } from "./result";
import type { ObjectRole } from "./config";
import type { ScoringEquivalenceClasses } from "./scoring";

export interface RewardConfig {
  enabled: boolean;
  baseRewardCents: number;
  movementRewardCents: number;
  rotationRewardCents: number;
  referencePath?: string;
  referenceVersion?: string;
}

export interface RewardReferenceObject {
  role?: ObjectRole;
  group_id?: string;
  scorable?: boolean;
  target?: {
    relative: {
      dx_steps: number;
      dy_steps: number;
      rotation_steps: number;
    };
  };
  equivalence_classes?: ScoringEquivalenceClasses;
}

export interface RewardReferenceTask {
  qid: string;
  reward_version?: string;
  objects: Record<string, RewardReferenceObject>;
}

export interface RewardGroupResult {
  groupId: string;
  scorable: boolean;
  positionCorrect: boolean | null;
  rotationCorrect: boolean | null;
  bothCorrect: boolean | null;
  bothWrong: boolean | null;
  movementRewardCents: number;
  rotationRewardCents: number;
  rewardCents: number;
  cumulativeRewardCents: number;
}

export interface TaskRewardSummary {
  enabled: boolean;
  baseRewardCents: number;
  rewardCents: number;
  cumulativeRewardCents: number;
  referenceVersion?: string;
  groups: RewardGroupResult[];
  skippedGroupIds: string[];
  correctPositionCount: number;
  correctRotationCount: number;
  fullyCorrectCount: number;
  fullyFailedCount: number;
  scorableGroupCount: number;
}

export interface ExperimentRewardSummary {
  enabled: boolean;
  baseRewardCents: number;
  earnedRewardCents: number;
  totalRewardCents: number;
  formalTrialCount: number;
  rewardedGroupCount: number;
  correctPositionCount: number;
  correctRotationCount: number;
  fullyCorrectCount: number;
  fullyFailedCount: number;
  scorableGroupCount: number;
}

export interface CalculateTaskRewardInput {
  config: RewardConfig;
  objects: Array<{ id: string; role?: ObjectRole; group_id?: string }>;
  reference?: RewardReferenceTask;
  finalState: FinalState;
  cumulativeRewardCents: number;
}

export function asRelativeFinalState(finalState: FinalState): RelativeFinalState {
  const result: RelativeFinalState = {};
  for (const [objectId, state] of Object.entries(finalState)) {
    if ("dx_steps" in state) {
      result[objectId] = state;
    } else if (state.offsets) {
      result[objectId] = {
        dx_steps: state.offsets.xSteps,
        dy_steps: state.offsets.ySteps,
        rotation_steps: state.offsets.rotationSteps,
      };
    }
  }
  return result;
}
