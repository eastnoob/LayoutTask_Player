import { parse as parseCsv } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { readFile, writeFile } from "node:fs/promises";
import { LayoutTaskEncoder, type DecodedLayoutTask } from "../../src/core/encoder";
import type { LayoutTaskEvent, ObjectOffsets } from "../../src/types/events";
import type {
  AbsoluteFinalState,
  FinalObjectState,
  LayoutTaskResult,
  RelativeFinalObjectState,
  RelativeFinalState,
  ResultContextObject,
} from "../../src/types/result";

export interface DecoderCliOptions {
  input?: string;
  output?: string;
  column?: string;
  pretty: boolean;
}

export interface SourceRecord {
  sourceIndex: number;
  raw: string;
  row?: Record<string, string>;
}

export interface ValidationSummary {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DecodedSourceRecord {
  sourceIndex: number;
  sourceRow?: Record<string, string>;
  decoded?: DecodedLayoutTask;
  validation?: ValidationSummary;
  error?: string;
}

export interface TrialCsvRow {
  source_index: number;
  valid: boolean;
  error: string;
  hash_ok: boolean;
  header_ok: boolean;
  validation_error_count: number | "";
  validation_warning_count: number | "";
  validation_errors: string;
  validation_warnings: string;
  exp: string;
  qid: string;
  task_id: string;
  session: string;
  start_time: number | "";
  end_time: number | "";
  duration_ms: number | "";
  locked: boolean | "";
  final_state_mode: string;
  event_count: number | "";
  final_state_json: string;
  context_json: string;
  display_json: string;
}

export interface EventCsvRow {
  source_index: number;
  exp: string;
  qid: string;
  task_id: string;
  session: string;
  event_index: number;
  t: number;
  object: string;
  action: string;
  valid: boolean;
  blocked_reason: string;
  before_x: number | "";
  before_y: number | "";
  before_r: number | "";
  after_x: number | "";
  after_y: number | "";
  after_r: number | "";
  x_steps: number | "";
  y_steps: number | "";
  rotation_steps: number | "";
  counts_json: string;
}

const TIME_TOLERANCE_MS = 10;
const EPSILON = 1e-6;

// Small shared CLI parser for decoder tools.
// 参数故意保持很少：input/output/column 已经足够覆盖文本和问卷 CSV 两种入口。
export function parseDecoderArgs(argv: string[]): DecoderCliOptions {
  const options: DecoderCliOptions = {
    pretty: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--input":
      case "-i":
        options.input = readOptionValue(argv, i, arg);
        i += 1;
        break;
      case "--output":
      case "-o":
        options.output = readOptionValue(argv, i, arg);
        i += 1;
        break;
      case "--column":
      case "-c":
        options.column = readOptionValue(argv, i, arg);
        i += 1;
        break;
      case "--pretty":
        options.pretty = true;
        break;
      case "--help":
      case "-h":
        throw new HelpRequested();
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }

        if (!options.input) {
          options.input = arg;
        } else if (!options.output) {
          options.output = arg;
        } else {
          throw new Error(`Unexpected argument: ${arg}`);
        }
    }
  }

  return options;
}

export class HelpRequested extends Error {
  constructor() {
    super("Help requested");
  }
}

export async function readSourceRecords(options: DecoderCliOptions): Promise<SourceRecord[]> {
  const text = options.input ? await readFile(options.input, "utf8") : await readStdin();
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  if (options.column) {
    return readCsvColumn(trimmed, options.column);
  }

  // Plain mode: one encoded Layout Task string per line.
  // 问卷单独导出 textbox 一列时，保存成 txt 后可以直接走这个分支。
  return trimmed
    .split(/\r?\n/)
    .map((line, index) => ({ sourceIndex: index, raw: line.trim() }))
    .filter((record) => record.raw.length > 0);
}

export async function decodeSourceRecords(records: SourceRecord[]): Promise<DecodedSourceRecord[]> {
  const encoder = new LayoutTaskEncoder();
  const decodedRecords: DecodedSourceRecord[] = [];

  for (const record of records) {
    try {
      const decoded = await encoder.decode(record.raw);
      decodedRecords.push({
        sourceIndex: record.sourceIndex,
        sourceRow: record.row,
        validation: validateDecodedResult(decoded),
        decoded,
      });
    } catch (error) {
      decodedRecords.push({
        sourceIndex: record.sourceIndex,
        sourceRow: record.row,
        error: error instanceof Error ? error.message : "Unknown decode error",
      });
    }
  }

  return decodedRecords;
}

export function validateDecodedResult(decoded: DecodedLayoutTask): ValidationSummary {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { result } = decoded;

  if (!decoded.hashOk) {
    errors.push("hash_mismatch");
  }

  if (!decoded.headerOk) {
    errors.push("header_result_mismatch");
  }

  validateTiming(result, errors, warnings);
  validateEvents(result, errors, warnings);
  validateFinalState(result, errors, warnings);
  validateEventVsFinalState(result, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function toTrialRows(records: DecodedSourceRecord[]): TrialCsvRow[] {
  return records.map((record) => {
    if (!record.decoded) {
      return emptyTrialRow(record);
    }

    const { result, hashOk, headerOk } = record.decoded;
    const validation = record.validation ?? validateDecodedResult(record.decoded);

    return {
      source_index: record.sourceIndex,
      valid: validation.valid,
      error: "",
      hash_ok: hashOk,
      header_ok: headerOk,
      validation_error_count: validation.errors.length,
      validation_warning_count: validation.warnings.length,
      validation_errors: validation.errors.join(";"),
      validation_warnings: validation.warnings.join(";"),
      exp: result.exp,
      qid: result.qid,
      task_id: result.task_id,
      session: result.session,
      start_time: result.start_time,
      end_time: result.end_time,
      duration_ms: result.duration_ms,
      locked: result.locked,
      final_state_mode: result.final_state_mode ?? inferFinalStateMode(result.final_state),
      event_count: result.events.length,
      final_state_json: JSON.stringify(result.final_state),
      context_json: JSON.stringify(result.context ?? null),
      display_json: JSON.stringify(result.display ?? null),
    };
  });
}

export function toEventRows(records: DecodedSourceRecord[]): EventCsvRow[] {
  const rows: EventCsvRow[] = [];

  for (const record of records) {
    if (!record.decoded) {
      continue;
    }

    const result = record.decoded.result;
    for (const event of result.events) {
      rows.push(toEventRow(record.sourceIndex, result, event));
    }
  }

  return rows;
}

export function serializeCsv<Row extends object>(rows: Row[]): string {
  return stringify(rows, {
    header: true,
  });
}

export async function writeOutput(text: string, outputPath?: string): Promise<void> {
  if (outputPath) {
    await writeFile(outputPath, text, "utf8");
    return;
  }

  process.stdout.write(text);
}

export function decodedRecordsToJson(records: DecodedSourceRecord[], pretty: boolean): string {
  const serializable = records.map((record) => ({
    source_index: record.sourceIndex,
    source_row: record.sourceRow,
    error: record.error,
    validation: record.validation,
    header: record.decoded?.header,
    hash_ok: record.decoded?.hashOk,
    header_ok: record.decoded?.headerOk,
    result: record.decoded?.result,
  }));

  return `${JSON.stringify(serializable, null, pretty ? 2 : 0)}\n`;
}

export function printUsage(command: string): string {
  return [
    `Usage: tsx tools/decoder/${command} --input results.txt [--output out.csv]`,
    "",
    "Options:",
    "  -i, --input <file>     Input text/CSV file. If omitted, stdin is used.",
    "  -o, --output <file>    Output file. If omitted, stdout is used.",
    "  -c, --column <name>    Read encoded strings from a CSV column.",
    "      --pretty          Pretty-print JSON output, only for decode-results.",
    "  -h, --help            Show this help.",
  ].join("\n");
}

// Narrow helpers for future analysis extensions.
// 当前 exporter 直接保留 JSON 字段；以后若要展开到 object-level table，可以复用这两个判断。
export function isRelativeFinalState(finalState: LayoutTaskResult["final_state"]): finalState is RelativeFinalState {
  const first = Object.values(finalState)[0] as RelativeFinalObjectState | FinalObjectState | undefined;
  return Boolean(first && "dx_steps" in first);
}

export function isAbsoluteFinalState(finalState: LayoutTaskResult["final_state"]): finalState is AbsoluteFinalState {
  const first = Object.values(finalState)[0] as RelativeFinalObjectState | FinalObjectState | undefined;
  return Boolean(first && "x" in first);
}

function readCsvColumn(text: string, column: string): SourceRecord[] {
  const rows = parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  return rows
    .map((row, index) => ({
      sourceIndex: index,
      raw: row[column]?.trim() ?? "",
      row,
    }))
    .filter((record) => record.raw.length > 0);
}

function validateTiming(result: LayoutTaskResult, errors: string[], warnings: string[]): void {
  if (result.start_time > result.end_time) {
    errors.push("start_time_after_end_time");
  }

  const expectedDuration = Math.max(0, result.end_time - result.start_time);
  if (result.duration_ms !== expectedDuration) {
    errors.push("duration_mismatch");
  }

  if (result.copy_timestamp !== undefined && result.copy_timestamp < result.start_time) {
    warnings.push("copy_timestamp_before_start_time");
  }
}

function validateEvents(result: LayoutTaskResult, errors: string[], warnings: string[]): void {
  let previousIndex = -1;
  let previousTime = -1;

  for (const [position, event] of result.events.entries()) {
    if (event.i !== position) {
      errors.push(`event_index_gap:${event.object}:${event.i}`);
    }

    if (event.i <= previousIndex) {
      errors.push(`event_index_not_increasing:${event.object}:${event.i}`);
    }

    if (event.t < previousTime) {
      errors.push(`event_time_not_increasing:${event.object}:${event.i}`);
    }

    if (event.t > result.duration_ms + TIME_TOLERANCE_MS) {
      warnings.push(`event_time_beyond_duration:${event.object}:${event.i}`);
    }

    previousIndex = event.i;
    previousTime = event.t;
  }
}

function validateFinalState(result: LayoutTaskResult, errors: string[], warnings: string[]): void {
  const context = result.context;
  if (!context) {
    warnings.push("context_missing");
    return;
  }

  if (isRelativeFinalState(result.final_state)) {
    for (const [objectId, state] of Object.entries(result.final_state)) {
      const objectContext = context.objects[objectId];
      if (!objectContext) {
        errors.push(`context_object_missing:${objectId}`);
        continue;
      }

      validateRelativeLimits(objectId, state, objectContext, errors);
    }

    return;
  }

  for (const [objectId, state] of Object.entries(result.final_state)) {
    const objectContext = context.objects[objectId];
    if (!objectContext) {
      errors.push(`context_object_missing:${objectId}`);
      continue;
    }

    if (state.offsets) {
      validateAbsoluteStateWithOffsets(objectId, state, objectContext, errors);
      continue;
    }

    warnings.push(`absolute_offsets_missing:${objectId}`);
    validateAbsoluteStateAlignmentWithoutOffsets(objectId, state, objectContext, errors);
  }
}

function validateEventVsFinalState(result: LayoutTaskResult, errors: string[], warnings: string[]): void {
  if (result.events.length === 0) {
    return;
  }

  const lastEventByObject = new Map<string, LayoutTaskEvent>();
  for (const event of result.events) {
    lastEventByObject.set(event.object, event);
  }

  if (isRelativeFinalState(result.final_state)) {
    for (const [objectId, finalState] of Object.entries(result.final_state)) {
      const lastEvent = lastEventByObject.get(objectId);
      if (!lastEvent) {
        if (finalState.dx_steps !== 0 || finalState.dy_steps !== 0 || finalState.rotation_steps !== 0) {
          warnings.push(`final_state_changed_without_event:${objectId}`);
        }
        continue;
      }

      if (!lastEvent.offsets) {
        warnings.push(`event_offsets_missing:${objectId}`);
        continue;
      }

      if (
        lastEvent.offsets.xSteps !== finalState.dx_steps ||
        lastEvent.offsets.ySteps !== finalState.dy_steps ||
        lastEvent.offsets.rotationSteps !== finalState.rotation_steps
      ) {
        errors.push(`event_final_state_mismatch:${objectId}`);
      }
    }

    return;
  }

  for (const [objectId, finalState] of Object.entries(result.final_state)) {
    const lastEvent = lastEventByObject.get(objectId);
    if (!lastEvent) {
      if (finalState.offsets && !areZeroOffsets(finalState.offsets)) {
        warnings.push(`final_state_changed_without_event:${objectId}`);
      }
      continue;
    }

    if (!lastEvent.after) {
      warnings.push(`event_after_missing:${objectId}`);
      continue;
    }

    if (
      !approxEqual(lastEvent.after.x, finalState.x) ||
      !approxEqual(lastEvent.after.y, finalState.y) ||
      normalizeRotation(lastEvent.after.r) !== normalizeRotation(finalState.r)
    ) {
      errors.push(`event_final_pose_mismatch:${objectId}`);
    }

    if (lastEvent.offsets && finalState.offsets) {
      if (
        lastEvent.offsets.xSteps !== finalState.offsets.xSteps ||
        lastEvent.offsets.ySteps !== finalState.offsets.ySteps ||
        lastEvent.offsets.rotationSteps !== finalState.offsets.rotationSteps
      ) {
        errors.push(`event_final_offsets_mismatch:${objectId}`);
      }
    }
  }
}

function validateRelativeLimits(
  objectId: string,
  state: RelativeFinalObjectState,
  objectContext: ResultContextObject,
  errors: string[],
): void {
  if (state.dx_steps < -(objectContext.limits.left ?? Number.POSITIVE_INFINITY)) {
    errors.push(`left_limit_exceeded:${objectId}`);
  }

  if (state.dx_steps > (objectContext.limits.right ?? Number.POSITIVE_INFINITY)) {
    errors.push(`right_limit_exceeded:${objectId}`);
  }

  if (state.dy_steps < -(objectContext.limits.up ?? Number.POSITIVE_INFINITY)) {
    errors.push(`up_limit_exceeded:${objectId}`);
  }

  if (state.dy_steps > (objectContext.limits.down ?? Number.POSITIVE_INFINITY)) {
    errors.push(`down_limit_exceeded:${objectId}`);
  }

  if (state.rotation_steps > (objectContext.limits.cw ?? Number.POSITIVE_INFINITY)) {
    errors.push(`cw_limit_exceeded:${objectId}`);
  }

  if (state.rotation_steps < -(objectContext.limits.ccw ?? Number.POSITIVE_INFINITY)) {
    errors.push(`ccw_limit_exceeded:${objectId}`);
  }
}

function validateAbsoluteStateWithOffsets(
  objectId: string,
  state: FinalObjectState,
  objectContext: ResultContextObject,
  errors: string[],
): void {
  const offsets = state.offsets;
  if (!offsets) {
    return;
  }

  const expectedX = objectContext.origin.x + offsets.xSteps * objectContext.movement_step;
  const expectedY = objectContext.origin.y + offsets.ySteps * objectContext.movement_step;
  const expectedR = normalizeRotation(objectContext.origin.r + offsets.rotationSteps * objectContext.rotation_step);

  if (!approxEqual(state.x, expectedX)) {
    errors.push(`absolute_x_offset_mismatch:${objectId}`);
  }

  if (!approxEqual(state.y, expectedY)) {
    errors.push(`absolute_y_offset_mismatch:${objectId}`);
  }

  if (normalizeRotation(state.r) !== expectedR) {
    errors.push(`absolute_rotation_offset_mismatch:${objectId}`);
  }

  validateRelativeLimits(
    objectId,
    {
      dx_steps: offsets.xSteps,
      dy_steps: offsets.ySteps,
      rotation_steps: offsets.rotationSteps,
    },
    objectContext,
    errors,
  );
}

function validateAbsoluteStateAlignmentWithoutOffsets(
  objectId: string,
  state: FinalObjectState,
  objectContext: ResultContextObject,
  errors: string[],
): void {
  const xDelta = state.x - objectContext.origin.x;
  const yDelta = state.y - objectContext.origin.y;

  if (!isStepAligned(xDelta, objectContext.movement_step)) {
    errors.push(`absolute_x_not_step_aligned:${objectId}`);
  }

  if (!isStepAligned(yDelta, objectContext.movement_step)) {
    errors.push(`absolute_y_not_step_aligned:${objectId}`);
  }
}

function toEventRow(sourceIndex: number, result: LayoutTaskResult, event: LayoutTaskEvent): EventCsvRow {
  return {
    source_index: sourceIndex,
    exp: result.exp,
    qid: result.qid,
    task_id: result.task_id,
    session: result.session,
    event_index: event.i,
    t: event.t,
    object: event.object,
    action: event.action,
    valid: event.valid,
    blocked_reason: event.blocked_reason ?? "",
    before_x: event.before?.x ?? "",
    before_y: event.before?.y ?? "",
    before_r: event.before?.r ?? "",
    after_x: event.after?.x ?? "",
    after_y: event.after?.y ?? "",
    after_r: event.after?.r ?? "",
    x_steps: event.offsets?.xSteps ?? "",
    y_steps: event.offsets?.ySteps ?? "",
    rotation_steps: event.offsets?.rotationSteps ?? "",
    counts_json: JSON.stringify(event.counts ?? null),
  };
}

function emptyTrialRow(record: DecodedSourceRecord): TrialCsvRow {
  return {
    source_index: record.sourceIndex,
    valid: false,
    error: record.error ?? "Unknown decode error",
    hash_ok: false,
    header_ok: false,
    validation_error_count: "",
    validation_warning_count: "",
    validation_errors: "",
    validation_warnings: "",
    exp: "",
    qid: "",
    task_id: "",
    session: "",
    start_time: "",
    end_time: "",
    duration_ms: "",
    locked: "",
    final_state_mode: "",
    event_count: "",
    final_state_json: "",
    context_json: "",
    display_json: "",
  };
}

function inferFinalStateMode(finalState: LayoutTaskResult["final_state"]): "absolute" | "relative" {
  return isRelativeFinalState(finalState) ? "relative" : "absolute";
}

function readOptionValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${option}`);
  }

  return value;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function isStepAligned(delta: number, step: number): boolean {
  return Math.abs(delta / step - Math.round(delta / step)) < EPSILON;
}

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function areZeroOffsets(offsets: ObjectOffsets): boolean {
  return offsets.xSteps === 0 && offsets.ySteps === 0 && offsets.rotationSteps === 0;
}
