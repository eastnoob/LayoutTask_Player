import { z } from "zod";

/**
 * Schema layer for static authoring JSON.
 *
 * These Zod definitions validate what researchers/authors are allowed to write
 * in config files before load-time resolution. 它们约束“配置怎么写”，不是
 * runtime resolve 后带默认资产信息、推断 viewBox、已解析碰撞几何的最终配置。
 */
export const worldUnitSchema = z.enum(["mm", "cm", "m", "px", "cad_unit", "unknown"]);

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

/**
 * Global stage coordinate system declared by the author.
 *
 * `world` is the explicit spatial frame for a task: the working viewBox,
 * origin, and optional grid metadata used by authoring and runtime layout.
 */
export const worldSchema = z.object({
  unit: worldUnitSchema.optional(),
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

/**
 * Reusable movement/rotation interaction recipe from the behavior library.
 *
 * This schema captures author intent at the protocol layer, before any task-
 * level override merges or runtime controller wiring happen.
 */
export const behaviorSchema = z
  .object({
    movement: movementBehaviorSchema,
    rotation: rotationBehaviorSchema.optional(),
    free_drag: freeDragBehaviorSchema.default({ enabled: false }),
  })
  .superRefine((value, context) => {
    // Drag is an explicit protocol choice, so both knobs must tell the same story.
    // 避免出现“movement 写成 drag，但 free_drag 没开”的半配置状态。
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

export const partialBehaviorSchema = z.object({
  movement: movementBehaviorSchema.partial().optional(),
  rotation: rotationBehaviorSchema.partial().optional(),
  free_drag: freeDragBehaviorSchema.partial().optional(),
});

export const taskObjectBehaviorSchema = z
  .object({
    template: z.string().min(1).optional(),
    config: partialBehaviorSchema.optional(),
  })
  .superRefine((value, context) => {
    if (!value.template && !value.config) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "behavior requires template or config",
      });
    }
  });

export const objectAssetSchema = z
  .object({
    type: z.enum(["svg", "png", "jpg", "image"]),
    src: z.string().min(1),
    intrinsic_unit: worldUnitSchema.optional(),
    default_width: z.number().positive().optional(),
    default_height: z.number().positive().optional(),
    viewbox_scale: z.number().positive().optional(),
    anchor: z.enum(["center", "top_left"]).optional(),
  })
  .superRefine((value, context) => {
    const hasWidth = value.default_width !== undefined;
    const hasHeight = value.default_height !== undefined;

    if (hasWidth !== hasHeight) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasWidth ? ["default_height"] : ["default_width"],
        message: "default_width and default_height must be supplied together",
      });
    }

    // Raster-like assets do not have SVG viewBox semantics to fall back on,
    // so authoring must provide the intended world-space footprint explicitly.
    if (value.type !== "svg" && (!hasWidth || !hasHeight)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["default_width"],
        message: "non-SVG object assets require default_width and default_height",
      });
    }
  });

export const backgroundAssetSchema = z.object({
  type: z.enum(["image", "svg"]),
  src: z.string().min(1),
  intrinsic_unit: worldUnitSchema.optional(),
  viewbox_scale: z.number().positive().optional(),
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

export const autosaveSchema = z.object({
  enabled: z.boolean().default(false),
  storage: z.literal("localStorage").default("localStorage"),
  restore_prompt: z.boolean().default(true),
  save_on: z.literal("state_change").default("state_change"),
});

/**
 * Output payload shaping for participant results.
 *
 * These flags describe how result data is encoded and how much state is emitted
 * when a task is saved/exported; they do not configure the save transport itself.
 */
export const outputSchema = z.object({
  // Transport/export policy. "plain-json" means no compression, not encryption.
  encoding: z.enum(["lz-uri", "lz-base64", "plain-json"]).default("lz-uri"),
  detail: z.enum(["final-only", "full"]).default("final-only"),
  final_state: z.enum(["relative", "absolute"]).default("relative"),
});

/**
 * Persistence channel for task output.
 *
 * `copy` leaves delivery to the participant/operator clipboard flow. `datapipe`
 * declares the experiment metadata needed by the built-in submission protocol.
 */
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

/**
 * High-level protocol flow for a task.
 *
 * This is not generic UI state; it selects the experimental sequence, such as
 * immediate reconstruction versus timed preview followed by reconstruction.
 */
export const flowSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("direct_reconstruction"),
  }),
  z.object({
    mode: z.literal("preview_then_reconstruct"),
    config: z
      .object({
        preview_duration_sec: z.number().positive().default(10),
        require_preview_ack: z.boolean().default(true),
        intro_message: z
          .string()
          .min(1)
          .default(
            "Next, you will have {seconds} seconds to study the image. After the image disappears, reconstruct the scene from memory.",
          ),
        intro_confirm_label: z.string().min(1).default("Start preview"),
        stage_during_preview: z.enum(["hidden", "locked"]).default("hidden"),
        show_countdown: z.boolean().default(true),
        message_before: z
          .string()
          .min(1)
          .default("Next, you will have {seconds} seconds to study the image."),
        message_after: z.string().min(1).default("Please reconstruct the scene from memory."),
      })
      .default({}),
  }),
]);

export const messagesSchema = z.object({
  confirm_lock_1: z.string().min(1).optional(),
  confirm_lock_2: z.string().min(1).optional(),
  confirm_no_edit: z.string().min(1).optional(),
  status_ready: z.string().min(1).optional(),
  status_copy_again_ok: z.string().min(1).optional(),
  status_copy_again_fail: z.string().min(1).optional(),
  instruction_edit_mode: z.string().min(1).optional(),
  reconstruction_hint_title: z.string().min(1).optional(),
  reconstruction_hint_drag: z.string().min(1).optional(),
  reconstruction_hint_button: z.string().min(1).optional(),
  reconstruction_hint_rotation: z.string().min(1).optional(),
  reconstruction_hint_select: z.string().min(1).optional(),
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

export const stageSchema = z.object({
  fit: z.literal("contain").default("contain"),
  max_height_ratio: z.number().positive().default(0.72),
  padding: z.number().nonnegative().default(16),
});

const collisionPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const collisionRectAreaSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["contain", "block"]),
  shape: z.literal("rect"),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const collisionPolygonAreaSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["contain", "block"]),
  shape: z.literal("polygon"),
  points: z.array(collisionPointSchema).min(3),
});

export const collisionAreaSchema = z.discriminatedUnion("shape", [
  collisionRectAreaSchema,
  collisionPolygonAreaSchema,
]);

export const collisionSourceSchema = z.object({
  type: z.literal("svg"),
  src: z.string().min(1),
});

/**
 * Task-level collision declaration for the shared scene.
 *
 * This schema stores authored contain/block areas or an SVG source reference.
 * It does not parse polygons into runtime collision primitives here.
 */
export const taskCollisionSchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.literal("discrete").default("discrete"),
  areas: z.array(collisionAreaSchema).default([]),
  source: collisionSourceSchema.optional(),
});

const objectCollisionPolygonSchema = z.object({
  id: z.string().min(1).optional(),
  points: z.array(collisionPointSchema).min(3),
}).strict();

const boxObjectCollisionSchema = z.object({
  enabled: z.boolean().default(true),
  shape: z.literal("box").default("box"),
  padding: z.number().nonnegative().default(0),
}).strict();

const polygonObjectCollisionSchema = z.object({
  enabled: z.boolean().default(true),
  shape: z.literal("polygons"),
  polygons: z.array(objectCollisionPolygonSchema).min(1),
  padding: z.number().nonnegative().default(0),
}).strict();

const assetOutlineObjectCollisionSchema = z.object({
  enabled: z.boolean().default(true),
  shape: z.literal("asset_outline"),
  source: collisionSourceSchema,
  padding: z.number().nonnegative().default(0),
}).strict();

export const objectCollisionSchema = z.union([
  boxObjectCollisionSchema,
  polygonObjectCollisionSchema,
  assetOutlineObjectCollisionSchema,
]);

/**
 * Authored object instance before dimension pair validation.
 *
 * This is the authoring boundary for per-object placement, behavior linkage,
 * and optional collision declaration, not a resolved runtime sprite/model.
 */
export const taskObjectBaseSchema = z.object({
  id: z.string().min(1),
  asset: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.number().finite().default(0),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  anchor: z.enum(["center", "top_left"]).optional(),
  behavior: taskObjectBehaviorSchema,
  collision: objectCollisionSchema.optional(),
});

export function refineObjectDimensions(
  value: { width?: number; height?: number },
  context: z.RefinementCtx,
): void {
  const hasWidth = value.width !== undefined;
  const hasHeight = value.height !== undefined;

  if (hasWidth !== hasHeight) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: hasWidth ? ["height"] : ["width"],
      message: "object width and height must be supplied together",
    });
  }
}

export const taskObjectSchema = taskObjectBaseSchema.superRefine(refineObjectDimensions);

export const taskBackgroundSchema = z
  .object({
    asset: z.string().min(1),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  })
  .superRefine((value, context) => {
    const placementFields = ["x", "y", "width", "height"] as const;
    const presentFields = placementFields.filter((field) => value[field] !== undefined);

    // Background placement is all-or-nothing: either the author pins the image
    // into world coordinates, or runtime may infer placement from SVG metadata.
    if (presentFields.length > 0 && presentFields.length < placementFields.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["width"],
        message: "background placement must include all of x, y, width, and height or omit all of them",
      });
    }
  });

/**
 * Complete authored task document.
 *
 * This validates one static task JSON as written by experiment authors, before
 * manifest resolution, asset loading, viewBox inference, and runtime defaults
 * that depend on external files or execution context.
 */
export const taskSchema = z.object({
  schema: z.literal("layouttask.task.v1"),
  task_id: z.string().min(1),
  qid: z.string().min(1),
  title: z.string().optional(),
  world: worldSchema,
  background: taskBackgroundSchema,
  objects: z.array(taskObjectSchema),
  completion: completionSchema.optional(),
  recording: recordingSchema.optional(),
  autosave: autosaveSchema.optional(),
  output: outputSchema.optional(),
  data_save: dataSaveSchema.optional(),
  feedback: feedbackSchema.optional(),
  display_image: displayImageSchema.optional(),
  flow: flowSchema.optional(),
  messages: messagesSchema.optional(),
  requirements: requirementsSchema.optional(),
  stage: stageSchema.optional(),
  collision: taskCollisionSchema.optional(),
}).superRefine((value, context) => {
  // Preview-reconstruct flow only makes sense when a preview image is actually enabled.
  if (value.flow?.mode === "preview_then_reconstruct" && !value.display_image?.enabled) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["flow"],
      message: "preview_then_reconstruct requires display_image.enabled=true",
    });
  }
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
