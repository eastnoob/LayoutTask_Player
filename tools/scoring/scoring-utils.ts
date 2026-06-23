import { readFile } from "node:fs/promises";
import { scoringReferenceSchema } from "../../src/schemas/batch.schema";
import type { ScoringReferenceConfig, ScoringReferenceObject } from "../../src/types/batch";
import type { FinalObjectState, FinalState, RelativeFinalObjectState, ResultContextObject } from "../../src/types/result";
import {
  isAbsoluteFinalState,
  isRelativeFinalState,
  type DecodedSourceRecord,
} from "../decoder/decoder-utils";

type Blank = "";
type CsvNumber = number | Blank;
type CsvBoolean = boolean | Blank;

interface RelativeValues {
  dxSteps: number;
  dySteps: number;
  rotationSteps: number;
}

interface AbsoluteValues {
  x: number;
  y: number;
  rotationDeg: number;
}

export interface ObjectStateCsvRow {
  source_index: number;
  hash_ok: CsvBoolean;
  header_ok: CsvBoolean;
  exp: string;
  qid: string;
  task_id: string;
  session: string;
  world_unit: string;
  object_id: string;
  object_role: string;
  object_group_id: string;
  relative_dx_steps: CsvNumber;
  relative_dy_steps: CsvNumber;
  relative_rotation_steps: CsvNumber;
  target_relative_dx_steps: CsvNumber;
  target_relative_dy_steps: CsvNumber;
  target_relative_rotation_steps: CsvNumber;
  error_relative_dx_steps: CsvNumber;
  error_relative_dy_steps: CsvNumber;
  error_relative_rotation_steps: CsvNumber;
  absolute_x: CsvNumber;
  absolute_y: CsvNumber;
  absolute_rotation_deg: CsvNumber;
  target_absolute_x: CsvNumber;
  target_absolute_y: CsvNumber;
  target_absolute_rotation_deg: CsvNumber;
  error_absolute_x: CsvNumber;
  error_absolute_y: CsvNumber;
  error_absolute_distance: CsvNumber;
  error_absolute_rotation_deg: CsvNumber;
}

export async function readScoringReference(path: string): Promise<ScoringReferenceConfig> {
  return parseScoringReference(JSON.parse(await readFile(path, "utf8")));
}

export function parseScoringReference(value: unknown): ScoringReferenceConfig {
  return scoringReferenceSchema.parse(value);
}

export function toObjectStateRows(
  records: DecodedSourceRecord[],
  scoringReference?: ScoringReferenceConfig,
): ObjectStateCsvRow[] {
  // Scoring compares each participant final object state against the authored
  // target for that task/object. `target.relative` is the canonical task answer:
  // Layout Task correctness is authored as displacement from each object's start
  // pose, so these columns carry the primary correctness / error semantics.
  // `target.absolute` is optional extra analysis data for labs that also want
  // world-coordinate error columns in the exported scoring table.
  const rows: ObjectStateCsvRow[] = [];

  for (const record of records) {
    if (!record.decoded) {
      continue;
    }

    const { result, hashOk, headerOk } = record.decoded;
    const referenceTask = scoringReference?.tasks[result.task_id];

    for (const [objectId, finalState] of Object.entries(result.final_state)) {
      const objectReference = referenceTask?.objects[objectId];
      const relative = getObservedRelative(result.final_state, objectId, finalState);
      const absolute = getObservedAbsolute(result.final_state, objectId, finalState, result.context?.objects[objectId]);
      const targetRelative = getTargetRelative(objectReference);
      const targetAbsolute = getTargetAbsolute(objectReference);

      rows.push({
        source_index: record.sourceIndex,
        hash_ok: hashOk,
        header_ok: headerOk,
        exp: result.exp,
        qid: result.qid,
        task_id: result.task_id,
        session: result.session,
        world_unit: result.context?.world.unit ?? "",
        object_id: objectId,
        object_role: objectReference?.role ?? "",
        object_group_id: objectReference?.group_id ?? "",
        relative_dx_steps: relative?.dxSteps ?? "",
        relative_dy_steps: relative?.dySteps ?? "",
        relative_rotation_steps: relative?.rotationSteps ?? "",
        target_relative_dx_steps: targetRelative?.dxSteps ?? "",
        target_relative_dy_steps: targetRelative?.dySteps ?? "",
        target_relative_rotation_steps: targetRelative?.rotationSteps ?? "",
        error_relative_dx_steps: diff(relative?.dxSteps, targetRelative?.dxSteps),
        error_relative_dy_steps: diff(relative?.dySteps, targetRelative?.dySteps),
        error_relative_rotation_steps: diff(relative?.rotationSteps, targetRelative?.rotationSteps),
        absolute_x: absolute?.x ?? "",
        absolute_y: absolute?.y ?? "",
        absolute_rotation_deg: absolute?.rotationDeg ?? "",
        target_absolute_x: targetAbsolute?.x ?? "",
        target_absolute_y: targetAbsolute?.y ?? "",
        target_absolute_rotation_deg: targetAbsolute?.rotationDeg ?? "",
        error_absolute_x: diff(absolute?.x, targetAbsolute?.x),
        error_absolute_y: diff(absolute?.y, targetAbsolute?.y),
        error_absolute_distance: distanceError(absolute, targetAbsolute),
        error_absolute_rotation_deg: circularRotationError(absolute?.rotationDeg, targetAbsolute?.rotationDeg),
      });
    }
  }

  return rows;
}

function getObservedRelative(
  finalState: FinalState,
  objectId: string,
  objectState: FinalObjectState | RelativeFinalObjectState,
): RelativeValues | undefined {
  if (isRelativeFinalState(finalState)) {
    const state = finalState[objectId];
    return {
      dxSteps: state.dx_steps,
      dySteps: state.dy_steps,
      rotationSteps: state.rotation_steps,
    };
  }

  if (isAbsoluteFinalState(finalState)) {
    const state = objectState as FinalObjectState;
    if (!state.offsets) {
      return undefined;
    }

    return {
      dxSteps: state.offsets.xSteps,
      dySteps: state.offsets.ySteps,
      rotationSteps: state.offsets.rotationSteps,
    };
  }

  return undefined;
}

function getObservedAbsolute(
  finalState: FinalState,
  objectId: string,
  objectState: FinalObjectState | RelativeFinalObjectState,
  context?: ResultContextObject,
): AbsoluteValues | undefined {
  if (isAbsoluteFinalState(finalState)) {
    const state = objectState as FinalObjectState;
    return {
      x: state.x,
      y: state.y,
      rotationDeg: normalizeRotation(state.r),
    };
  }

  if (isRelativeFinalState(finalState)) {
    const state = finalState[objectId];
    if (!context) {
      return undefined;
    }

    // Relative final states are enough to score the task canonically.
    // When context is present, we also project them back into world coordinates
    // so analysis exports can compare against optional `target.absolute`.
    return {
      x: context.origin.x + state.dx_steps * context.movement_step,
      y: context.origin.y + state.dy_steps * context.movement_step,
      rotationDeg: normalizeRotation(context.origin.r + state.rotation_steps * context.rotation_step),
    };
  }

  return undefined;
}

function getTargetRelative(objectReference?: ScoringReferenceObject): RelativeValues | undefined {
  const relative = objectReference?.target?.relative;
  if (!relative) {
    return undefined;
  }

  return {
    dxSteps: relative.dx_steps,
    dySteps: relative.dy_steps,
    rotationSteps: relative.rotation_steps,
  };
}

function getTargetAbsolute(objectReference?: ScoringReferenceObject): AbsoluteValues | undefined {
  const absolute = objectReference?.target?.absolute;
  if (!absolute) {
    return undefined;
  }

  return {
    x: absolute.x,
    y: absolute.y,
    rotationDeg: normalizeRotation(absolute.rotation_deg),
  };
}

function diff(observed?: number, target?: number): CsvNumber {
  if (observed === undefined || target === undefined) {
    return "";
  }

  return observed - target;
}

function distanceError(observed?: AbsoluteValues, target?: AbsoluteValues): CsvNumber {
  if (!observed || !target) {
    return "";
  }

  return Math.hypot(observed.x - target.x, observed.y - target.y);
}

function circularRotationError(observed?: number, target?: number): CsvNumber {
  if (observed === undefined || target === undefined) {
    return "";
  }

  const diffDeg = Math.abs(normalizeRotation(observed) - normalizeRotation(target));
  return Math.min(diffDeg, 360 - diffDeg);
}

function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}
