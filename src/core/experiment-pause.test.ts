import { describe, expect, it, vi } from "vitest";
import {
  ExperimentPauseController,
  type ExperimentPauseSnapshot,
} from "./experiment-pause";

describe("ExperimentPauseController", () => {
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

  it("uses a separate ten-second tutorial practice pause", () => {
    let now = 2_000;
    const formal = new ExperimentPauseController({ mode: "formal", now: () => now });
    const practice = new ExperimentPauseController({ mode: "tutorial_practice", now: () => now });

    practice.requestPause();
    expect(practice.snapshot().status).toBe("practice_paused");
    now += 10_000;
    practice.advance();
    expect(practice.snapshot()).toMatchObject({ status: "practice_consumed", pauseDurationMs: 10_000 });
    expect(practice.snapshot().pauseUsed).toBe(false);
    expect(formal.snapshot().pauseUsed).toBe(false);
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
