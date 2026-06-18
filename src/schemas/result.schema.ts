import { z } from "zod";
import { pointSchema, viewBoxSchema, worldUnitSchema } from "./config.schema";

// Result schema validates the payload that leaves the browser.
// 这里要兼顾当前导出模式和后续 decoder 的 backward-compatible parsing。
export const operationCountsSchema = z.object({
  left: z.number().int().nonnegative(),
  right: z.number().int().nonnegative(),
  up: z.number().int().nonnegative(),
  down: z.number().int().nonnegative(),
  cw: z.number().int().nonnegative(),
  ccw: z.number().int().nonnegative(),
});

export const objectPoseSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  r: z.number().finite(),
});

export const objectOffsetsSchema = z.object({
  xSteps: z.number().int(),
  ySteps: z.number().int(),
  rotationSteps: z.number().int(),
});

export const rectInfoSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  top: z.number().finite(),
  right: z.number().finite(),
  bottom: z.number().finite(),
  left: z.number().finite(),
});

export const visualViewportSchema = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  scale: z.number().nonnegative(),
  offsetLeft: z.number().finite(),
  offsetTop: z.number().finite(),
  pageLeft: z.number().finite(),
  pageTop: z.number().finite(),
});

export const screenOrientationSchema = z.object({
  type: z.string().optional(),
  angle: z.number().finite().optional(),
});

export const displayChangeSnapshotSchema = z.object({
  viewport: z.object({
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  }),
  visualViewport: visualViewportSchema.optional(),
  screenOrientation: screenOrientationSchema.optional(),
  displayImageRect: z
    .object({
      width: z.number().nonnegative(),
      height: z.number().nonnegative(),
    })
    .optional(),
});

export const pageTimingSchema = z.object({
  source: z.enum([
    "performance.timeOrigin",
    "performance.timing.navigationStart",
    "collector_created",
  ]),
  page_open_time: z.number().finite(),
  submit_time: z.number().finite(),
  // performance.timeOrigin may be fractional. 这里保留小数毫秒，避免 decoder 拒绝真实浏览器输出。
  total_elapsed_ms: z.number().finite().nonnegative(),
  player_start_time: z.number().finite().optional(),
  player_elapsed_ms: z.number().finite().nonnegative().optional(),
});

export const displayInfoSchema = z.object({
  viewport: z.object({
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  }),
  screen: z.object({
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    availWidth: z.number().nonnegative(),
    availHeight: z.number().nonnegative(),
  }),
  devicePixelRatio: z.number().positive(),
  stageRect: rectInfoSchema.optional(),
  stageScale: z
    .object({
      worldWidth: z.number().positive(),
      worldHeight: z.number().positive(),
      cssWidth: z.number().nonnegative(),
      cssHeight: z.number().nonnegative(),
      worldToCssScale: z.number().positive(),
      cssToWorldScale: z.number().positive(),
    })
    .optional(),
  backgroundRect: rectInfoSchema.optional(),
  backgroundNatural: z
    .object({
      width: z.number().nonnegative(),
      height: z.number().nonnegative(),
    })
    .optional(),
  backgroundWorld: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
      width: z.number().nonnegative(),
      height: z.number().nonnegative(),
    })
    .optional(),
  visualViewport: visualViewportSchema.optional(),
  screenOrientation: screenOrientationSchema.optional(),
  screenColor: z
    .object({
      colorDepth: z.number().nonnegative().optional(),
      pixelDepth: z.number().nonnegative().optional(),
    })
    .optional(),
  displayImageFrameRect: rectInfoSchema.optional(),
  displayImageRect: rectInfoSchema.optional(),
  displayImageNatural: z
    .object({
      width: z.number().nonnegative(),
      height: z.number().nonnegative(),
    })
    .optional(),
  displayImageRendered: z
    .object({
      cssWidth: z.number().nonnegative(),
      cssHeight: z.number().nonnegative(),
      devicePixelRatio: z.number().positive(),
      effectivePixelWidth: z.number().nonnegative(),
      effectivePixelHeight: z.number().nonnegative(),
    })
    .optional(),
  changes: z
    .object({
      initial: displayChangeSnapshotSchema.optional(),
      final: displayChangeSnapshotSchema.optional(),
      events: z.array(
        z.object({
          i: z.number().int().nonnegative(),
          t: z.number().int().nonnegative(),
          type: z.enum([
            "window_resize",
            "visual_viewport_resize",
            "visual_viewport_scroll",
            "orientation_change",
          ]),
          snapshot: displayChangeSnapshotSchema,
        }),
      ),
      resizeCount: z.number().int().nonnegative(),
      visualViewportResizeCount: z.number().int().nonnegative(),
      visualViewportScrollCount: z.number().int().nonnegative(),
      orientationChangeCount: z.number().int().nonnegative(),
    })
    .optional(),
});

export const resultContextObjectSchema = z.object({
  origin: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    r: z.number().finite(),
  }),
  movement_step: z.number().positive(),
  rotation_step: z.number().positive(),
  limits: z.object({
    left: z.number().int().nonnegative().optional(),
    right: z.number().int().nonnegative().optional(),
    up: z.number().int().nonnegative().optional(),
    down: z.number().int().nonnegative().optional(),
    cw: z.number().int().nonnegative().optional(),
    ccw: z.number().int().nonnegative().optional(),
  }),
});

export const resultContextSchema = z.object({
  world: z.object({
    unit: worldUnitSchema.optional(),
    viewBox: viewBoxSchema,
    origin: z.object({
      x: z.number().finite(),
      y: z.number().finite(),
    }),
    grid_size: z.number().positive(),
    grid_snap: z.boolean(),
    grid_origin: pointSchema.optional(),
  }),
  objects: z.record(resultContextObjectSchema),
});

export const resultFlowSchema = z.object({
  mode: z.enum(["direct_reconstruction", "preview_then_reconstruct"]),
  preview_ack_at: z.number().finite().optional(),
  preview_started_at: z.number().finite().optional(),
  preview_ended_at: z.number().finite().optional(),
  preview_duration_ms: z.number().nonnegative().optional(),
  reconstruction_started_at: z.number().finite().optional(),
});

export const resultRestoreSchema = z.object({
  recovered: z.boolean(),
  restore_count: z.number().int().nonnegative().optional(),
  draft_saved_at: z.number().finite().optional(),
  restored_at: z.number().finite().optional(),
});

export const layoutTaskEventSchema = z.object({
  i: z.number().int().nonnegative(),
  t: z.number().int().nonnegative(),
  object: z.string().min(1),
  action: z.enum([
    "move_left",
    "move_right",
    "move_up",
    "move_down",
    "rotate_cw",
    "rotate_ccw",
    "drag_start",
    "drag_move",
    "drag_end",
  ]),
  valid: z.boolean(),
  blocked_reason: z
    .enum(["locked", "limit_reached", "movement_disabled", "rotation_disabled", "collision"])
    .optional(),
  before: objectPoseSchema.optional(),
  after: objectPoseSchema.optional(),
  counts: operationCountsSchema.optional(),
  offsets: objectOffsetsSchema.optional(),
  pointer: z
    .object({
      clientX: z.number().finite(),
      clientY: z.number().finite(),
      worldX: z.number().finite().optional(),
      worldY: z.number().finite().optional(),
    })
    .optional(),
});

export const finalObjectStateSchema = objectPoseSchema.extend({
  counts: operationCountsSchema,
  offsets: objectOffsetsSchema.optional(),
});

export const relativeFinalObjectStateSchema = z.object({
  dx_steps: z.number().int(),
  dy_steps: z.number().int(),
  rotation_steps: z.number().int(),
});

export const resultSchema = z.object({
  schema: z.literal("layouttask.result.v1"),
  exp: z.string().min(1),
  qid: z.string().min(1),
  task_id: z.string().min(1),
  session: z.string().min(1),
  start_time: z.number().int().positive(),
  end_time: z.number().int().positive(),
  duration_ms: z.number().int().nonnegative(),
  page_timing: pageTimingSchema.optional(),
  display: displayInfoSchema.optional(),
  flow: resultFlowSchema.optional(),
  restore: resultRestoreSchema.optional(),
  task_config_hash: z.string().optional(),
  // Optional for early pilot compatibility; new exports should include it.
  context: resultContextSchema.optional(),
  events: z.array(layoutTaskEventSchema),
  final_state_mode: z.enum(["absolute", "relative"]).optional(),
  final_state: z.union([z.record(finalObjectStateSchema), z.record(relativeFinalObjectStateSchema)]),
  locked: z.literal(true),
  copy_timestamp: z.number().int().positive().optional(),
  user_agent: z.string().optional(),
});
