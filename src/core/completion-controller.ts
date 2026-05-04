import type { RuntimeTaskConfig } from "../types/runtime";
import type { LayoutTaskResult } from "../types/result";
import type { EncodedLayoutTask, LayoutTaskEncoder } from "./encoder";
import type { CopyResult, ClipboardService } from "./clipboard-service";
import type { Recorder } from "./recorder";
import type { LayoutTaskRenderer } from "./renderer";
import type { StateStore } from "./state-store";

export interface CompletionPayload {
  result: LayoutTaskResult;
  encoded: EncodedLayoutTask;
  copyResult: CopyResult;
}

// CompletionController owns the irreversible part of the workflow.
// 一旦进入 complete，它要保证结果被冻结，之后 copy again 始终复制同一份 payload。
export class CompletionController {
  private lockedPayload: CompletionPayload | undefined;
  private readonly confirmImpl: (message: string) => boolean;

  constructor(
    private readonly options: {
      config: RuntimeTaskConfig;
      store: StateStore;
      recorder: Recorder;
      renderer: LayoutTaskRenderer;
      encoder: LayoutTaskEncoder;
      clipboard: ClipboardService;
      onComplete?: (payload: CompletionPayload) => void;
      confirmImpl?: (message: string) => boolean;
    },
  ) {
    this.confirmImpl = options.confirmImpl ?? ((message: string) => window.confirm(message));
  }

  async requestComplete(): Promise<void> {
    if (this.options.store.isLocked()) {
      return;
    }

    if (this.options.config.completion.double_confirm) {
      const ok1 = this.confirmImpl("After confirmation, the object layout will be locked. Continue?");
      if (!ok1) {
        return;
      }

      const ok2 = this.confirmImpl("Please confirm again: this will finalize the current layout.");
      if (!ok2) {
        return;
      }
    }

    // The current workflow assumes confirm means freeze.
    // lock_after_confirm remains part of config shape, but this milestone keeps the locked workflow mandatory.
    this.options.store.lock();
    this.options.renderer.setLocked(true);

    const result = await this.options.recorder.finish(Date.now());
    const encoded = await this.options.encoder.encode(result, this.options.config.output);
    const copyResult = await this.options.clipboard.copy(encoded.output);
    const payload = { result, encoded, copyResult };

    this.lockedPayload = payload;
    this.options.renderer.showCompletion(encoded.output, copyResult);
    this.options.onComplete?.(payload);
  }

  async copyAgain(): Promise<CopyResult> {
    if (!this.lockedPayload) {
      const result: CopyResult = {
        ok: false,
        method: "manual",
        error: "No locked result is available yet",
      };
      this.options.renderer.setStatus(result.error ?? "No locked result is available yet");
      return result;
    }

    const copyResult = await this.options.clipboard.copy(this.lockedPayload.encoded.output);
    this.options.renderer.setStatus(
      copyResult.ok ? "Encoded result copied again." : "Copy failed. Please copy the encoded result manually.",
    );
    return copyResult;
  }

  getLockedPayload(): CompletionPayload | undefined {
    return this.lockedPayload;
  }
}
