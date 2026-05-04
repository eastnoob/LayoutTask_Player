import LZString from "lz-string";
import type { LayoutTaskResult } from "../types/result";
import { sha256Hex } from "../utils/hash";

export interface EncodedLayoutTask {
  version: "LAYOUTTASK1";
  qid: string;
  taskId: string;
  sessionId: string;
  hash8: string;
  encodedData: string;
  output: string;
}

export class LayoutTaskEncoder {
  async encode(result: LayoutTaskResult): Promise<EncodedLayoutTask> {
    const json = JSON.stringify(result);
    const hash = await sha256Hex(json);
    const hash8 = hash.slice(0, 8).toUpperCase();
    const encodedData = LZString.compressToEncodedURIComponent(json);
    const output = [
      "LAYOUTTASK1",
      result.qid,
      result.task_id,
      result.session,
      hash8,
      encodedData,
    ].join("|");

    return {
      version: "LAYOUTTASK1",
      qid: result.qid,
      taskId: result.task_id,
      sessionId: result.session,
      hash8,
      encodedData,
      output,
    };
  }
}
