import { describe, expect, it, vi } from "vitest";
import { FlowController } from "./flow-controller";
import type { LayoutTaskRenderer } from "./renderer";

describe("FlowController", () => {
  it("starts reconstruction immediately for direct flow", () => {
    const renderer = createRendererDouble();
    const onReconstructionStart = vi.fn();
    const controller = new FlowController({
      flow: { mode: "direct_reconstruction" },
      renderer,
      onReconstructionStart,
      nowImpl: () => 1000,
    });

    controller.start();

    expect(renderer.enterReconstructionFlow).toHaveBeenCalledWith(undefined);
    expect(onReconstructionStart).toHaveBeenCalledOnce();
    expect(controller.getFlowInfo()).toEqual({
      mode: "direct_reconstruction",
      reconstruction_started_at: 1000,
    });
  });

  it("runs preview then reconstruction and records flow timing", async () => {
    const renderer = createRendererDouble();
    const onReconstructionStart = vi.fn();
    const scheduled: Array<() => void> = [];
    const nowValues = [900, 1000, 2000, 2000];
    const controller = new FlowController({
      flow: {
        mode: "preview_then_reconstruct",
        config: {
          preview_duration_sec: 1,
          require_preview_ack: true,
          intro_message: "You will have {seconds}s to study. Then reconstruct.",
          intro_confirm_label: "Start",
          stage_during_preview: "hidden",
          show_countdown: true,
          message_before: "Study for {seconds}s.",
          message_after: "Reconstruct now.",
        },
      },
      renderer,
      onReconstructionStart,
      nowImpl: () => nowValues.shift() ?? 11_000,
      setTimeoutImpl: ((callback: TimerHandler) => {
        scheduled.push(callback as () => void);
        return 1 as unknown as ReturnType<typeof globalThis.setTimeout>;
      }) as unknown as typeof globalThis.setTimeout,
      clearTimeoutImpl: vi.fn() as typeof globalThis.clearTimeout,
    });

    controller.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(renderer.showPreviewAcknowledgement).toHaveBeenCalledWith({
      message: "You will have 1s to study. Then reconstruct.",
      confirmLabel: "Start",
    });
    expect(renderer.enterPreviewFlow).toHaveBeenCalledWith({
      stageMode: "hidden",
      message: "Study for 1s.",
      countdownText: "1",
    });
    expect(renderer.updatePreviewCountdown).toHaveBeenCalledWith("1");

    scheduled.shift()?.();

    expect(renderer.enterReconstructionFlow).toHaveBeenCalledWith("Reconstruct now.");
    expect(onReconstructionStart).toHaveBeenCalledOnce();
    expect(controller.getFlowInfo()).toEqual({
      mode: "preview_then_reconstruct",
      preview_ack_at: 900,
      preview_started_at: 1000,
      preview_ended_at: 2000,
      preview_duration_ms: 1000,
      reconstruction_started_at: 2000,
    });
  });
});

function createRendererDouble(): Pick<
  LayoutTaskRenderer,
  | "enterPreviewFlow"
  | "showPreviewAcknowledgement"
  | "updatePreviewCountdown"
  | "enterReconstructionFlow"
  | "waitForDisplayImageReady"
> {
  return {
    enterPreviewFlow: vi.fn(),
    showPreviewAcknowledgement: vi.fn(async () => undefined),
    updatePreviewCountdown: vi.fn(),
    enterReconstructionFlow: vi.fn(),
    waitForDisplayImageReady: vi.fn(async () => undefined),
  };
}
