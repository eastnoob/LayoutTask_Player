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
  origin: pointSchema.optional(),
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

export const behaviorSchema = z
  .object({
    movement: movementBehaviorSchema,
    rotation: rotationBehaviorSchema.optional(),
    free_drag: freeDragBehaviorSchema.default({ enabled: false }),
  })
  .superRefine((value, context) => {
    // Drag is an explicit authoring mode: movement.mode and free_drag.enabled must agree.
    // 避免出现“看起来能拖，但运行时其实没开”的半配置状态。
    const movementIsDrag = value.movement.mode === "drag";
    const freeDragEnabled = value.free_drag.enabled;

    if (movementIsDrag !== freeDragEnabled) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["free_drag", "enabled"],
        message: "free_drag.enabled must match movement.mode='drag'",
      });
    }
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
  record_display_changes: z.boolean().optional(),
  record_page_timing: z.boolean().optional(),
  record_user_agent: z.boolean().optional(),
  record_blocked_events: z.boolean().optional(),
});

export const outputSchema = z.object({
  // Transport/export policy. "plain-json" means no compression, not encryption.
  encoding: z.enum(["lz-uri", "lz-base64", "plain-json"]).default("lz-uri"),
  detail: z.enum(["final-only", "full"]).default("final-only"),
  final_state: z.enum(["relative", "absolute"]).default("relative"),
});

export const dataSaveSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("copy").default("copy"),
  }),
  z.object({
    mode: z.literal("datapipe"),
    experiment_id: z.string().min(1),
    endpoint: z.string().url().optional(),
    filename_prefix: z.string().min(1).optional(),
    payload_format: z.enum(["json-envelope", "encoded-only", "csv-row"]).default("json-envelope"),
    save_encoded: z.boolean().optional(),
    save_result: z.boolean().optional(),
  }),
]);

export const feedbackSchema = z.object({
  // UI copy only. 提示语不进入 result data，研究者可按实验语言覆盖。
  limit_messages: z
    .object({
      move_left: z.string().min(1).optional(),
      move_right: z.string().min(1).optional(),
      move_up: z.string().min(1).optional(),
      move_down: z.string().min(1).optional(),
      rotate_cw: z.string().min(1).optional(),
      rotate_ccw: z.string().min(1).optional(),
    })
    .optional(),
});

export const displayImageSchema = z.object({
  // A standalone reference image frame. 独立展示图，不参与 SVG world 坐标。
  enabled: z.boolean().default(true),
  src: z.string().min(1),
  alt: z.string().default("Reference image"),
  record_metrics: z.boolean().default(true),
});

export const messagesSchema = z.object({
  confirm_lock_1: z.string().min(1).optional(),
  confirm_lock_2: z.string().min(1).optional(),
  confirm_no_edit: z.string().min(1).optional(),
  status_ready: z.string().min(1).optional(),
  status_copy_again_ok: z.string().min(1).optional(),
  status_copy_again_fail: z.string().min(1).optional(),
  instruction_edit_mode: z.string().min(1).optional(),
});

export const minViewportSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  mode: z.literal("warn").default("warn"),
  message: z.string().min(1).optional(),
});

export const requirementsSchema = z.object({
  min_viewport: minViewportSchema.optional(),
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
  data_save: dataSaveSchema.optional(),
  feedback: feedbackSchema.optional(),
  display_image: displayImageSchema.optional(),
  messages: messagesSchema.optional(),
  requirements: requirementsSchema.optional(),
});

export const manifestSchema = z.object({
  schema: z.literal("layouttask.manifest.v1"),
  experiment_id: z.string().min(1),
  title: z.string().optional(),
  config_version: z.string().optional(),
  asset_base_url: z.string().min(1).optional(),
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
