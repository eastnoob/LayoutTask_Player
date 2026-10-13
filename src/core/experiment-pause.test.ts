import { describe, expect, it, vi } from "vitest";
import {
  ExperimentPauseController,
  type ExperimentPauseSnapshot,
} from "./experiment-pause";

describe("ExperimentPauseController", () => {
  it("guards direct requests and confirmations without consuming the formal allowance", () => {
    const controller = new ExperimentPauseController({ mode: "formal", now: () => 1_000 });
    let allowed = false;
    const unregister = controller.registerInputGuard(() => allowed);
    controller.requestPause();
    expect(controller.snapshot()).toMatchObject({ status: "available", pauseUsed: false, events: [] });
    allowed = true;
    controller.requestPause();
    allowed = false;
    controller.confirmPause();
    expect(controller.snapshot()).toMatchObject({ status: "confirming", pauseUsed: false, events: [] });
    unregister();
    controller.confirmPause();
    expect(controller.isPaused()).toBe(true);
    controller.resume("manual_resume");
  });
  it("requires confirmation and consumes the one formal pause", () => {
    const controller = new ExperimentPauseController({ mode: "formal", now: () => 1_000 });

    expect(controller.snapshot().status).toBe("available");
    controller.requestPause();
    expect(controller.snapshot().status).toBe("confirming");
    controller.confirmPause();
    expect(controller.snapshot()).toMatchObject({ status: "paused", pauseUsed: true, pauseStartedAt: 1_000 });

    controller.resume("manual_resume");
    expect(controller.snapshot()).toMatchObject({ status: "consumed", pauseEndReason: "manual_resume" });
    expect(() => controller.requestPause()).toThrow("already consumed");
  });

  it("cancels confirmation without consuming the pause", () => {
    const controller = new ExperimentPauseController({ mode: "formal", now: () => 1_000 });

    controller.requestPause();
    controller.cancelConfirmation();

    expect(controller.snapshot()).toMatchObject({ status: "available", pauseUsed: false });
  });

  it("auto resumes exactly once after fifteen minutes", () => {
    let now = 1_000;
    const onChange = vi.fn();
    const controller = new ExperimentPauseController({
      mode: "formal",
      now: () => now,
      onChange,
    });

    controller.requestPause();
    controller.confirmPause();
    now += 900_000;
    controller.advance();

    expect(controller.snapshot()).toMatchObject({
      status: "consumed",
      pauseDurationMs: 900_000,
      pauseEndReason: "auto_resume_15m",
    });
    expect(controller.snapshot().events.filter((event) => event.type === "pause_resumed")).toHaveLength(1);
    expect(onChange).toHaveBeenCalled();
  });

  it("uses a separate ten-second tutorial practice pause with retryable confirmation", () => {
    let now = 2_000;
    const formal = new ExperimentPauseController({ mode: "formal", now: () => now });
    const practice = new ExperimentPauseController({ mode: "tutorial_practice", now: () => now });

    practice.requestPause();
    expect(practice.snapshot().status).toBe("confirming");
    practice.cancelConfirmation();
    expect(practice.snapshot()).toMatchObject({ status: "practice_available", pauseUsed: false });
    practice.requestPause();
    practice.confirmPause();
    expect(practice.snapshot().status).toBe("practice_paused");
    practice.resume("manual_resume");
    expect(practice.snapshot()).toMatchObject({
      status: "practice_consumed",
      pauseEndReason: "manual_resume",
      pauseDurationMs: 0,
    });
    expect(() => practice.requestPause()).toThrow("already consumed");

    const automatic = new ExperimentPauseController({ mode: "tutorial_practice", now: () => now });
    automatic.requestPause();
    automatic.confirmPause();
    now += 10_000;
    automatic.advance();
    expect(automatic.snapshot()).toMatchObject({
      status: "practice_consumed",
      pauseDurationMs: 10_000,
      pauseEndReason: "auto_resume_10s",
    });
    expect(automatic.snapshot().pauseUsed).toBe(false);
    expect(formal.snapshot().pauseUsed).toBe(false);
  });

  it("guards tutorial practice confirmation and resume while magnifier input is active", () => {
    const practice = new ExperimentPauseController({ mode: "tutorial_practice", now: () => 1_000 });
    let magnifierActive = true;
    practice.registerInputGuard(() => !magnifierActive);

    practice.requestPause();
    expect(practice.snapshot().status).toBe("practice_available");
    magnifierActive = false;
    practice.requestPause();
    magnifierActive = true;
    practice.confirmPause();
    expect(practice.snapshot().status).toBe("confirming");
  });

  it("subtracts closed and active pauses from active elapsed time", () => {
    let now = 1_000;
    const controller = new ExperimentPauseController({ mode: "formal", now: () => now });
    controller.requestPause();
    controller.confirmPause();
    now = 4_000;
    expect(controller.getActiveElapsedMs(0, now)).toBe(1_000);
    controller.resume("manual_resume");
    now = 10_000;
    expect(controller.getActiveElapsedMs(0, now)).toBe(7_000);
  });

  it("restores a paused snapshot without granting another opportunity", () => {
    let now = 100_000;
    const snapshot: ExperimentPauseSnapshot = {
      mode: "formal",
      status: "paused",
      pauseUsed: true,
      pauseStartedAt: 90_000,
      pauseDurationMs: 0,
      events: [{ type: "pause_confirmed", mode: "formal", at: 90_000 }],
    };
    const controller = new ExperimentPauseController({ mode: "formal", now: () => now, restore: snapshot });

    expect(controller.snapshot().status).toBe("paused");
    expect(() => controller.requestPause()).toThrow("already consumed");
  });
});
