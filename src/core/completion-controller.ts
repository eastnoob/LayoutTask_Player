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
// 一旦进入 complete，它要保证结果被冻结，并且之后 copy again 始终复制同一份 payload。
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
      // Double confirm is cheap but valuable in survey contexts.
      // 被试一旦确认就不能再改，因此这里宁可多问一次。
      const ok1 = this.confirmImpl("After confirmation, the object layout will be locked. Continue?");
      if (!ok1) {
        return;
      }

      const ok2 = this.confirmImpl("Please confirm again: this will finalize the current layout.");
      if (!ok2) {
        return;
      }
    }

    if (!this.options.store.hasEdits()) {
      // Detect true no-edit submission from interaction history, not from final_state zeros.
      // 这样“动过又移回原位”不会被误判成空提交。
      const okNoEdit = this.confirmImpl(
        "You have not edited any object. Are you sure this unchanged layout is your final answer?",
      );
      if (!okNoEdit) {
        return;
      }
    }

    // The current workflow assumes confirm means freeze.
    // lock_after_confirm 仍保留在 config shape 里，但当前产品流固定为 confirm 后锁定。
    this.options.store.lock();
    this.options.renderer.setLocked(true);

    const result = await this.options.recorder.finish(Date.now());
    const encoded = await this.options.encoder.encode(result, this.options.config.output);
    const copyResult = await this.options.clipboard.copy(encoded.output);
    const payload = { result, encoded, copyResult };

    // Cache the first locked payload so "copy again" is stable and reproducible.
    // 不重新 encode，避免再次复制时出现不同 session/hash/时间语义。
    this.lockedPayload = payload;
    this.options.renderer.showCompletion(encoded.output, copyResult);
    this.options.onComplete?.(payload);
  }

  async copyAgain(): Promise<CopyResult> {
    if (!this.lockedPayload) {
      // copy-again before lock is a usage error, not a silent no-op.
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
