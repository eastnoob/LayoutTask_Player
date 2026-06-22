import { z } from "zod";
import {
  completionSchema,
  dataSaveSchema,
  displayImageSchema,
  flowSchema,
  messagesSchema,
  outputSchema,
  recordingSchema,
  requirementsSchema,
  stageSchema,
  taskBackgroundSchema,
  taskCollisionSchema,
  taskObjectBaseSchema,
  refineObjectDimensions,
  worldSchema,
} from "./config.schema";
import { OBJECT_ROLES } from "../protocol/constants";

const objectRoleSchema = z.enum(OBJECT_ROLES);

const metadataValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const metadataSchema = z.record(metadataValueSchema);

const labelsSchema = z.record(z.string());

const filenameSafeIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/, "must contain only letters, numbers, underscores, and hyphens");

/**
 * Canonical authored answer for where an object should end up.
 * Stored in movement / rotation steps so authoring stays stable across world-space rewrites.
 */
export const relativeTargetSchema = z.object({
  dx_steps: z.number().int(),
  dy_steps: z.number().int(),
  rotation_steps: z.number().int(),
});

/**
 * Optional resolved world-space target used for analysis or export-side checks.
 * Relative remains the required authored answer; absolute is supplemental data.
 */
export const absoluteTargetSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  rotation_deg: z.number().finite(),
});

export const objectTargetSchema = z.object({
  relative: relativeTargetSchema,
  absolute: absoluteTargetSchema.optional(),
});

export const scoringToleranceSchema = z.object({
  dx_steps: z.number().int().nonnegative().optional(),
  dy_steps: z.number().int().nonnegative().optional(),
  rotation_steps: z.number().int().nonnegative().optional(),
  distance_world: z.number().nonnegative().optional(),
  x_world: z.number().nonnegative().optional(),
  y_world: z.number().nonnegative().optional(),
  rotation_deg: z.number().nonnegative().optional(),
});

export const objectScoringSchema = z.object({
  enabled: z.boolean().optional(),
  target: objectTargetSchema.optional(),
  tolerance: scoringToleranceSchema.optional(),
  labels: labelsSchema.optional(),
});

export const scoringSchema = z.object({
  enabled: z.boolean().optional(),
  include_objects: z.array(z.string().min(1)).optional(),
  default_tolerance: scoringToleranceSchema.optional(),
  objects: z.record(z.string().min(1), objectScoringSchema).optional(),
});

/**
 * Batch-authored task object with optional protocol annotations for grouping,
 * canonical targets, and per-object scoring overrides.
 */
export const batchObjectSchema = taskObjectBaseSchema
  .extend({
    role: objectRoleSchema.optional(),
    group_id: z.string().min(1).optional(),
    initial_state_label: z.string().min(1).optional(),
    target: objectTargetSchema.optional(),
    scoring: objectScoringSchema.optional(),
  })
  .superRefine(refineObjectDimensions);

export const batchTrialSchema = z.object({
  qid: z.string().min(1),
  task_id: filenameSafeIdSchema,
  title: z.string().optional(),
  display_image: displayImageSchema.optional(),
  world: worldSchema.optional(),
  background: taskBackgroundSchema,
  objects: z.array(batchObjectSchema),
  completion: completionSchema.optional(),
  recording: recordingSchema.optional(),
  output: outputSchema.optional(),
  data_save: dataSaveSchema.optional(),
  flow: flowSchema.optional(),
  stage: stageSchema.optional(),
  messages: messagesSchema.optional(),
  requirements: requirementsSchema.optional(),
  scoring: scoringSchema.optional(),
  collision: taskCollisionSchema.optional(),
  metadata: metadataSchema.optional(),
});

export const batchSharedSchema = z.object({
  asset_library: z.string().min(1),
  background_library: z.string().min(1),
  behavior_library: z.string().min(1),
  world: worldSchema.optional(),
  stage: stageSchema.optional(),
  completion: completionSchema.optional(),
  recording: recordingSchema.optional(),
  output: outputSchema.optional(),
  data_save: dataSaveSchema.optional(),
  flow: flowSchema.optional(),
  messages: messagesSchema.optional(),
  requirements: requirementsSchema.optional(),
});

export const batchSchema = z
  .object({
    schema: z.literal("layouttask.batch.v1"),
    experiment_id: z.string().min(1),
    title: z.string().optional(),
    config_version: z.string().optional(),
    output_dir: z.string().min(1).optional(),
    shared: batchSharedSchema,
    trials: z.array(batchTrialSchema),
  })
  .superRefine((value, context) => {
    const taskIds = new Map<string, number>();

    value.trials.forEach((trial, trialIndex) => {
      // task_id is used as a file/package identity in compiled task outputs, so it
      // must stay unique even when qid or other metadata differs.
      const duplicateTaskIndex = taskIds.get(trial.task_id);
      if (duplicateTaskIndex !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["trials", trialIndex, "task_id"],
          message: `duplicate task_id '${trial.task_id}'`,
        });
      } else {
        taskIds.set(trial.task_id, trialIndex);
      }

      // Each trial needs a resolved world from shared defaults or a local override;
      // object poses and background placement are otherwise uninterpretable.
      if (!value.shared.world && !trial.world) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["trials", trialIndex, "world"],
          message: "trial.world or shared.world is required",
        });
      }

      const resolvedFlow = trial.flow ?? value.shared.flow;
      // Preview flow depends on a visible trial image. The flow mode may come from
      // shared config, but the actual preview asset is still trial-local.
      if (
        resolvedFlow?.mode === "preview_then_reconstruct" &&
        trial.display_image?.enabled !== true
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["trials", trialIndex, "display_image"],
          message: "preview_then_reconstruct requires trial.display_image.enabled=true",
        });
      }

      const objectIds = new Set<string>();
      trial.objects.forEach((object, objectIndex) => {
        if (objectIds.has(object.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["trials", trialIndex, "objects", objectIndex, "id"],
            message: `duplicate object id '${object.id}' within trial`,
          });
        } else {
          objectIds.add(object.id);
        }
      });
    });
  });

export const scoringReferenceSchema = z.object({
  schema: z.literal("layouttask.scoring-reference.v1"),
  experiment_id: z.string().min(1),
  tasks: z.record(
    z.string().min(1),
    z.object({
      qid: z.string().min(1),
      metadata: metadataSchema.optional(),
      objects: z.record(
        z.string().min(1),
        z.object({
          role: objectRoleSchema.optional(),
          group_id: z.string().min(1).optional(),
          target: objectTargetSchema.optional(),
          tolerance: scoringToleranceSchema.optional(),
          labels: labelsSchema.optional(),
        }),
      ),
    }),
  ),
});

export type ParsedBatchConfig = z.infer<typeof batchSchema>;
export type ParsedScoringReferenceConfig = z.infer<typeof scoringReferenceSchema>;
