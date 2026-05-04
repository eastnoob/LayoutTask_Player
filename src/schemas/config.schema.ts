import { z } from "zod";

// Zod schemas define the authoring-time contract for static JSON config files.
// 它们描述“研究者可以怎么写配置”，不是 runtime resolve 后的最终结构。
export const viewBoxSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const gridSchema = z.object({
  size: z.number().positive(),
  visible: z.boolean().default(false),
  snap: z.boolean().default(true),
});

export const worldSchema = z.object({
  viewBox: viewBoxSchema,
  origin: pointSchema,
  grid: gridSchema,
});

export const movementBehaviorSchema = z.object({
  mode: z.enum(["none", "button", "drag"]),
  step: z.number().positive().optional(),
  max_left: z.number().int().nonnegative().optional(),
  max_right: z.number().int().nonnegative().optional(),
  max_up: z.number().int().nonnegative().optional(),
  max_down: z.number().int().nonnegative().optional(),
});

export const rotationBehaviorSchema = z.object({
  step: z.number().positive().optional(),
  max_cw: z.number().int().nonnegative().optional(),
  max_ccw: z.number().int().nonnegative().optional(),
});

export const freeDragBehaviorSchema = z.object({
  enabled: z.boolean().default(false),
  snap: z.boolean().optional(),
});

export const behaviorSchema = z.object({
  movement: movementBehaviorSchema,
  rotation: rotationBehaviorSchema.optional(),
  free_drag: freeDragBehaviorSchema.default({ enabled: false }),
});

export const objectAssetSchema = z.object({
  type: z.enum(["svg", "png", "jpg", "image"]),
  src: z.string().min(1),
  default_width: z.number().positive(),
  default_height: z.number().positive(),
  anchor: z.enum(["center", "top_left"]).optional(),
});

export const backgroundAssetSchema = z.object({
  type: z.enum(["image", "svg"]),
  src: z.string().min(1),
  intrinsic_unit: z.enum(["cad_unit", "px", "unknown"]).optional(),
});

export const completionSchema = z.object({
  double_confirm: z.boolean().optional(),
  lock_after_confirm: z.boolean().optional(),
  allow_copy_again: z.boolean().optional(),
});

export const recordingSchema = z.object({
  record_events: z.boolean().optional(),
  record_final_state: z.boolean().optional(),
  record_display_info: z.boolean().optional(),
  record_user_agent: z.boolean().optional(),
  record_blocked_events: z.boolean().optional(),
});

export const outputSchema = z.object({
  // Transport/export policy. "plain-json" means no compression, not encryption.
  encoding: z.enum(["lz-uri", "lz-base64", "plain-json"]).default("lz-uri"),
  detail: z.enum(["final-only", "full"]).default("final-only"),
  final_state: z.enum(["relative", "absolute"]).default("relative"),
});

export const taskObjectSchema = z.object({
  id: z.string().min(1),
  asset: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.number().finite().default(0),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  anchor: z.enum(["center", "top_left"]).optional(),
  behavior: z.string().min(1),
});

export const taskSchema = z.object({
  schema: z.literal("layouttask.task.v1"),
  task_id: z.string().min(1),
  qid: z.string().min(1),
  title: z.string().optional(),
  world: worldSchema,
  background: z.object({
    asset: z.string().min(1),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  objects: z.array(taskObjectSchema),
  completion: completionSchema.optional(),
  recording: recordingSchema.optional(),
  output: outputSchema.optional(),
});

export const manifestSchema = z.object({
  schema: z.literal("layouttask.manifest.v1"),
  experiment_id: z.string().min(1),
  title: z.string().optional(),
  config_version: z.string().optional(),
  asset_library: z.string().min(1),
  background_library: z.string().min(1),
  behavior_library: z.string().min(1),
  tasks: z.array(
    z.object({
      qid: z.string().min(1),
      task_id: z.string().min(1),
      file: z.string().min(1),
    }),
  ),
});

export const objectLibrarySchema = z.object({
  schema: z.literal("layouttask.assets.objects.v1"),
  objects: z.record(objectAssetSchema),
});

export const backgroundLibrarySchema = z.object({
  schema: z.literal("layouttask.assets.backgrounds.v1"),
  backgrounds: z.record(backgroundAssetSchema),
});

export const behaviorLibrarySchema = z.object({
  schema: z.literal("layouttask.behaviors.v1"),
  behaviors: z.record(behaviorSchema),
});
