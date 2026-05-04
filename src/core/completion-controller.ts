import type { LayoutTaskResult } from "../types/result";
import type { EncodedLayoutTask, LayoutTaskEncoder } from "./encoder";
import type { CopyResult, ClipboardService } from "./clipboard-service";

// CompletionController is a small orchestration layer:
// result -> encode -> copy -> notify UI / caller.
// 目前 main.ts 还在直接编排，保留它是为了后续把完成流程收拢回 core。
export interface CompletionPayload {
  result: LayoutTaskResult;
  encoded: EncodedLayoutTask;
  copyResult: CopyResult;
}

export class CompletionController {
  constructor(
    private readonly options: {
      encoder: LayoutTaskEncoder;
      clipboard: ClipboardService;
      onComplete?: (payload: CompletionPayload) => void;
    },
  ) {}

  async complete(result: LayoutTaskResult): Promise<CompletionPayload> {
    const encoded = await this.options.encoder.encode(result);
    const copyResult = await this.options.clipboard.copy(encoded.output);
    const payload = { result, encoded, copyResult };

    this.options.onComplete?.(payload);
    return payload;
  }
}
