import { z } from "zod";

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
    .enum(["locked", "limit_reached", "movement_disabled", "rotation_disabled"])
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
  display: displayInfoSchema.optional(),
  task_config_hash: z.string().optional(),
  events: z.array(layoutTaskEventSchema),
  final_state_mode: z.enum(["absolute", "relative"]).optional(),
  final_state: z.union([z.record(finalObjectStateSchema), z.record(relativeFinalObjectStateSchema)]),
  locked: z.literal(true),
  copy_timestamp: z.number().int().positive().optional(),
  user_agent: z.string().optional(),
});
