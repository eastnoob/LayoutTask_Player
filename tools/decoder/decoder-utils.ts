import { parse as parseCsv } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { readFile, writeFile } from "node:fs/promises";
import { LayoutTaskEncoder, type DecodedLayoutTask } from "../../src/core/encoder";
import type { LayoutTaskEvent } from "../../src/types/events";
import type {
  AbsoluteFinalState,
  FinalObjectState,
  LayoutTaskResult,
  RelativeFinalObjectState,
  RelativeFinalState,
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

export interface DecodedSourceRecord {
  sourceIndex: number;
  sourceRow?: Record<string, string>;
  decoded?: DecodedLayoutTask;
  error?: string;
}

export interface TrialCsvRow {
  source_index: number;
  valid: boolean;
  error: string;
  hash_ok: boolean;
  header_ok: boolean;
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

// Small shared CLI parser for the decoder tools.
// 保持参数简单：input/output/column 足够覆盖问卷导出和纯文本粘贴两种场景。
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
  // 问卷平台单独导出 textbox 一列时，复制成 txt 后可以直接走这个分支。
  return trimmed
    .split(/\r?\n/)
    .map((line, index) => ({ sourceIndex: index, raw: line.trim() }))
    .filter((record) => record.raw.length > 0);
}

export async function decodeSourceRecords(records: SourceRecord[]): Promise<DecodedSourceRecord[]> {
  const encoder = new LayoutTaskEncoder();
  const decoded: DecodedSourceRecord[] = [];

  for (const record of records) {
    try {
      decoded.push({
        sourceIndex: record.sourceIndex,
        sourceRow: record.row,
        decoded: await encoder.decode(record.raw),
      });
    } catch (error) {
      decoded.push({
        sourceIndex: record.sourceIndex,
        sourceRow: record.row,
        error: error instanceof Error ? error.message : "Unknown decode error",
      });
    }
  }

  return decoded;
}

export function toTrialRows(records: DecodedSourceRecord[]): TrialCsvRow[] {
  return records.map((record) => {
    if (!record.decoded) {
      return emptyTrialRow(record);
    }

    const { result, hashOk, headerOk } = record.decoded;
    return {
      source_index: record.sourceIndex,
      valid: hashOk && headerOk,
      error: "",
      hash_ok: hashOk,
      header_ok: headerOk,
      exp: result.exp,
      qid: result.qid,
      task_id: result.task_id,
      session: result.session,
      start_time: result.start_time,
      end_time: result.end_time,
      duration_ms: result.duration_ms,
      locked: result.locked,
      final_state_mode: result.final_state_mode ?? "absolute",
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

// Narrow helpers for future analysis extensions.
// 现在 exporter 直接输出 JSON 字段；以后如果需要逐对象展开，可以复用这两个类型守卫。
export function isRelativeFinalState(finalState: LayoutTaskResult["final_state"]): finalState is RelativeFinalState {
  const first = Object.values(finalState)[0] as RelativeFinalObjectState | FinalObjectState | undefined;
  return Boolean(first && "dx_steps" in first);
}

export function isAbsoluteFinalState(finalState: LayoutTaskResult["final_state"]): finalState is AbsoluteFinalState {
  const first = Object.values(finalState)[0] as RelativeFinalObjectState | FinalObjectState | undefined;
  return Boolean(first && "x" in first);
}
