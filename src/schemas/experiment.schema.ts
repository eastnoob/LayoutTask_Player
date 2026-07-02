import { z } from "zod";
import type { ExperimentConfig } from "../types/experiment";

const defaultConfidenceLabels = {
  "1": "很不确定",
  "2": "不太确定",
  "3": "一般",
  "4": "比较确定",
  "5": "很确定",
};

const trialSchema = z.object({
  taskId: z.string().min(1),
  qid: z.string().min(1).optional(),
});

const tutorialSchema = z
  .object({
    enabled: z.boolean().default(false),
    taskId: z.string().min(1).optional(),
    qid: z.string().min(1).optional(),
  })
  .default({ enabled: false });

const confidenceSchema = z
  .object({
    required: z.boolean().default(true),
    scale: z.array(z.number().int().min(1).max(5)).min(1).default([1, 2, 3, 4, 5]),
    labels: z.record(z.string().min(1)).default(defaultConfidenceLabels),
  })
  .default({
    required: true,
    scale: [1, 2, 3, 4, 5],
    labels: defaultConfidenceLabels,
  })
  .superRefine((value, ctx) => {
    if (new Set(value.scale).size !== value.scale.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "confidence scale values must be unique",
      });
    }

    for (const item of value.scale) {
      if (!value.labels[String(item)]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `confidence label missing for ${item}`,
        });
      }
    }
  });

const dataSaveSchema = z
  .discriminatedUnion("mode", [
    z.object({
      mode: z.literal("copy"),
      filename_prefix: z.string().min(1).default("layout-task"),
    }),
    z.object({
      mode: z.literal("datapipe"),
      experiment_id: z.string().min(1),
      endpoint: z.string().url().default("https://pipe.jspsych.org/api/data/"),
      filename_prefix: z.string().min(1).default("layout-task"),
    }),
  ])
  .default({ mode: "copy", filename_prefix: "layout-task" });

const experimentSchema = z.object({
  schema: z.literal("layouttask.experiment.v1"),
  experiment_id: z.string().min(1),
  baseUrl: z.string().min(1),
  order: z.literal("fixed").default("fixed"),
  tutorial: tutorialSchema,
  confidence: confidenceSchema,
  data_save: dataSaveSchema,
  trials: z.array(trialSchema).min(1),
});

export function parseExperimentConfig(input: unknown): ExperimentConfig {
  const parsed = experimentSchema.parse(input);
  const dataSave =
    parsed.data_save.mode === "datapipe"
      ? {
          mode: "datapipe" as const,
          experimentId: parsed.data_save.experiment_id,
          endpoint: parsed.data_save.endpoint,
          filenamePrefix: parsed.data_save.filename_prefix,
        }
      : {
          mode: "copy" as const,
          filenamePrefix: parsed.data_save.filename_prefix,
        };

  return {
    schema: parsed.schema,
    experimentId: parsed.experiment_id,
    baseUrl: parsed.baseUrl,
    order: parsed.order,
    tutorial: parsed.tutorial,
    confidence: parsed.confidence,
    dataSave,
    trials: parsed.trials,
  };
}
