import LZString from "lz-string";
import type { EncodingMethod, FinalStateMode, OutputDetail } from "../types/config";
import type { AbsoluteFinalState, LayoutTaskResult, RelativeFinalState } from "../types/result";
import { resultSchema } from "../schemas/result.schema";
import { sha256Hex } from "../utils/hash";

export interface EncodedLayoutTask {
  version: "LAYOUTTASK1";
  qid: string;
  taskId: string;
  sessionId: string;
  hash8: string;
  encoding: EncodingMethod;
  encodedData: string;
  output: string;
}

export interface EncodeOptions {
  encoding?: EncodingMethod;
  detail?: OutputDetail;
  final_state?: FinalStateMode;
}

export interface DecodedLayoutTask {
  header: {
    version: "LAYOUTTASK1";
    qid: string;
    taskId: string;
    sessionId: string;
    hash8: string;
    encoding: EncodingMethod;
  };
  result: LayoutTaskResult;
  hashOk: boolean;
  headerOk: boolean;
}

export class LayoutTaskEncoder {
  async encode(result: LayoutTaskResult, options: EncodeOptions = {}): Promise<EncodedLayoutTask> {
    const encoding = options.encoding ?? "lz-uri";
    const detail = options.detail ?? "final-only";
    const finalStateMode = options.final_state ?? "relative";
    // We transform the human-meaningful result first, then hash that exact JSON.
    // 这样 hash 校验的是“真正发给问卷/被试的内容”，不是内部中间态。
    const resultForOutput = prepareResultForOutput(result, detail, finalStateMode);
    const json = JSON.stringify(resultForOutput);
    const hash = await sha256Hex(json);
    const hash8 = hash.slice(0, 8).toUpperCase();
    const encodedData = encodeJson(json, encoding);
    const output = [
      "LAYOUTTASK1",
      result.qid,
      result.task_id,
      result.session,
      hash8,
      encoding,
      encodedData,
    ].join("|");

    return {
      version: "LAYOUTTASK1",
      qid: result.qid,
      taskId: result.task_id,
      sessionId: result.session,
      hash8,
      encoding,
      encodedData,
      output,
    };
  }

  async decode(output: string): Promise<DecodedLayoutTask> {
    const parts = output.trim().split("|");
    if (parts.length !== 6 && parts.length !== 7) {
      throw new Error("Invalid encoded layout task field count");
    }

    const [version, qid, taskId, sessionId, hash8] = parts;
    if (version !== "LAYOUTTASK1") {
      throw new Error(`Unsupported layout task version: ${version}`);
    }

    // Backward compatibility: older strings had 6 segments and implied lz-uri.
    const encoding = parts.length === 7 ? parseEncoding(parts[5]) : "lz-uri";
    const encodedData = parts.length === 7 ? parts[6] : parts[5];
    const json = decodeJson(encodedData, encoding);

    const parsed = JSON.parse(json) as unknown;
    const result = resultSchema.parse(parsed);
    const recomputedHash = (await sha256Hex(json)).slice(0, 8).toUpperCase();

    return {
      header: {
        version: "LAYOUTTASK1",
        qid,
        taskId,
        sessionId,
        hash8,
        encoding,
      },
      result,
      hashOk: recomputedHash === hash8.toUpperCase(),
      headerOk:
        result.qid === qid &&
        result.task_id === taskId &&
        result.session === sessionId,
    };
  }
}

function prepareResultForOutput(
  result: LayoutTaskResult,
  detail: OutputDetail,
  finalStateMode: FinalStateMode,
): LayoutTaskResult {
  // Output detail and final-state mode are transport concerns.
  // Recorder keeps the rich in-memory result; encoder decides what actually leaves the page.
  const resultWithFinalState = {
    ...result,
    final_state_mode: finalStateMode,
    final_state:
      finalStateMode === "relative"
        ? toRelativeFinalState(result.final_state as AbsoluteFinalState)
        : result.final_state,
  };

  if (detail === "full") {
    return resultWithFinalState;
  }

  return {
    ...resultWithFinalState,
    events: [],
  };
}

function toRelativeFinalState(finalState: AbsoluteFinalState): RelativeFinalState {
  // Relative final state is intentionally net displacement, not left/right counters.
  // 对分析者来说，dx/dy/rotation_steps 通常比绝对世界坐标更直接。
  return Object.fromEntries(
    Object.entries(finalState).map(([objectId, state]) => [
      objectId,
      {
        dx_steps: state.offsets?.xSteps ?? 0,
        dy_steps: state.offsets?.ySteps ?? 0,
        rotation_steps: state.offsets?.rotationSteps ?? 0,
      },
    ]),
  );
}

function encodeJson(json: string, encoding: EncodingMethod): string {
  // "plain-json" here means plain transport / no compression,
  // not security encryption. 这个命名是为了减少误解。
  switch (encoding) {
    case "lz-uri":
      return LZString.compressToEncodedURIComponent(json);
    case "lz-base64":
      return LZString.compressToBase64(json);
    case "plain-json":
      return encodeURIComponent(json);
  }
}

function decodeJson(encodedData: string, encoding: EncodingMethod): string {
  switch (encoding) {
    case "lz-uri": {
      const json = LZString.decompressFromEncodedURIComponent(encodedData);
      if (!json) {
        throw new Error("Failed to decompress lz-uri layout task data");
      }
      return json;
    }
    case "lz-base64": {
      const json = LZString.decompressFromBase64(encodedData);
      if (!json) {
        throw new Error("Failed to decompress lz-base64 layout task data");
      }
      return json;
    }
    case "plain-json":
      return decodeURIComponent(encodedData);
  }
}

function parseEncoding(value: string): EncodingMethod {
  if (value === "lz-uri" || value === "lz-base64" || value === "plain-json") {
    return value;
  }

  throw new Error(`Unsupported layout task encoding: ${value}`);
}
