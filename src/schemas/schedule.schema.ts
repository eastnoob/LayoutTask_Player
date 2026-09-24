import { z } from "zod";
import type { ExperimentSchedule } from "../types/schedule";

const presentationSchema = z.object({
  presentationId: z.string().min(1),
  taskId: z.string().min(1),
  repeatGroupId: z.string().min(1).nullable(),
  repeatIndex: z.number().int().min(0).max(2),
  repeatOfTaskId: z.string().min(1).nullable(),
  trialIndex: z.number().int().min(1),
  trialTotal: z.number().int().min(1),
});

export const experimentScheduleSchema = z.object({
  schema: z.literal("layouttask.schedule.v1"),
  strategy: z.literal("williams_balanced_first_order"),
  uniqueSceneCount: z.number().int().positive(),
  presentationCount: z.number().int().positive(),
  baseSequenceCount: z.number().int().positive(),
  minimumInterveningTrials: z.number().int().nonnegative(),
  repeatGroups: z.array(z.string().min(1)),
  sequences: z.array(z.object({
    sequenceId: z.number().int().positive(),
    presentations: z.array(presentationSchema),
  })).min(1),
});

export function parseExperimentSchedule(input: unknown): ExperimentSchedule {
  return experimentScheduleSchema.parse(input);
}
