import type { ResultFlowInfo } from "../types/result";
import type { RuntimeFlowConfig } from "../types/runtime";
import type { LayoutTaskRenderer } from "./renderer";

type FlowRenderer = Pick<
  LayoutTaskRenderer,
  | "enterPreviewFlow"
  | "showPreviewAcknowledgement"
  | "updatePreviewCountdown"
  | "enterReconstructionFlow"
  | "waitForDisplayImageReady"
>;

export interface FlowControllerOptions {
  flow: RuntimeFlowConfig;
  renderer: FlowRenderer;
  nowImpl?: () => number;
  setTimeoutImpl?: typeof globalThis.setTimeout;
  clearTimeoutImpl?: typeof globalThis.clearTimeout;
  onReconstructionStart: () => void;
}

export class FlowController {
  private readonly nowImpl: () => number;
  private readonly setTimeoutImpl: typeof globalThis.setTimeout;
  private readonly clearTimeoutImpl: typeof globalThis.clearTimeout;
  private readonly flowInfo: ResultFlowInfo;
  private activeTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  private destroyed = false;

  constructor(private readonly options: FlowControllerOptions) {
    this.nowImpl = options.nowImpl ?? Date.now;
    this.setTimeoutImpl = options.setTimeoutImpl ?? globalThis.setTimeout.bind(globalThis);
    this.clearTimeoutImpl = options.clearTimeoutImpl ?? globalThis.clearTimeout.bind(globalThis);
    this.flowInfo = { mode: options.flow.mode };
  }

  // Flow phases gate when reconstruction is available, but they do not own the
  // object-state rules themselves. direct_reconstruction starts interactive
  // immediately; preview_then_reconstruct delays interaction until preview ends.
  start(): void {
    if (this.options.flow.mode === "direct_reconstruction") {
      this.startReconstruction();
      return;
    }

    this.startPreview();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.activeTimer !== undefined) {
      this.clearTimeoutImpl(this.activeTimer);
      this.activeTimer = undefined;
    }
  }

  getFlowInfo(): ResultFlowInfo {
    return { ...this.flowInfo };
  }

  private startPreview(): void {
    const flow = this.options.flow;
    if (flow.mode !== "preview_then_reconstruct") {
      return;
    }

    const totalSeconds = flow.config.preview_duration_sec;
    const beginPreview = () => {
      if (this.destroyed) {
        return;
      }

      this.options.renderer.enterPreviewFlow({
        stageMode: flow.config.stage_during_preview,
        message: formatFlowMessage(flow.config.message_before, totalSeconds),
        countdownText: flow.config.show_countdown ? String(totalSeconds) : undefined,
      });

      void this.options.renderer.waitForDisplayImageReady().then(() => {
        if (this.destroyed) {
          return;
        }

        // preview_started_at marks when the participant could actually study the
        // preview image. It starts after the display is ready, not when preview
        // UI first renders or when the acknowledgement dialog closes.
        this.flowInfo.preview_started_at = this.nowImpl();
        this.tickPreview(totalSeconds);
      });
    };

    if (!flow.config.require_preview_ack) {
      beginPreview();
      return;
    }

    void this.options.renderer
      .showPreviewAcknowledgement({
        message: formatFlowMessage(flow.config.intro_message, totalSeconds),
        confirmLabel: flow.config.intro_confirm_label,
      })
      .then(() => {
        if (this.destroyed) {
          return;
        }

        this.flowInfo.preview_ack_at = this.nowImpl();
        beginPreview();
      });
  }

  private tickPreview(secondsRemaining: number): void {
    const flow = this.options.flow;
    if (flow.mode !== "preview_then_reconstruct") {
      return;
    }

    if (flow.config.show_countdown) {
      this.options.renderer.updatePreviewCountdown(String(secondsRemaining));
    }

    if (secondsRemaining <= 0) {
      const endedAt = this.nowImpl();
      this.flowInfo.preview_ended_at = endedAt;
      this.flowInfo.preview_duration_ms =
        this.flowInfo.preview_started_at === undefined ? undefined : endedAt - this.flowInfo.preview_started_at;
      // Phase timing stays separate from the player's main page timing so
      // analysis can compare preview duration against the overall task duration.
      this.startReconstruction(flow.config.message_after);
      return;
    }

    this.activeTimer = this.setTimeoutImpl(() => {
      this.tickPreview(secondsRemaining - 1);
    }, 1000);
  }

  private startReconstruction(message?: string): void {
    // Reconstruction start is the handoff point where preview-gated players
    // finally bind interaction, while direct flow reaches the same state at once.
    this.flowInfo.reconstruction_started_at = this.nowImpl();
    this.options.renderer.enterReconstructionFlow(message);
    this.options.onReconstructionStart();
  }
}

function formatFlowMessage(template: string, seconds: number): string {
  return template.replaceAll("{seconds}", String(seconds));
}
