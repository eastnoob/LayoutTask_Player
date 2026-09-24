import { describe, expect, it, vi } from "vitest";
import { ReferenceAssistanceRecorder } from "./reference-assistance-recorder";

describe("ReferenceAssistanceRecorder", () => {
  it("records reference-frame wheel attempts and keeps them observable", () => {
    const frame = new EventTarget();
    const windowRef = createWindowDouble(1);
    const recorder = new ReferenceAssistanceRecorder({ nowImpl: createNowSequence([100, 125, 150]) });

    recorder.start(frame as unknown as HTMLElement, windowRef);

    const ctrlWheel = createWheelEvent(true);
    frame.dispatchEvent(ctrlWheel);
    frame.dispatchEvent(createWheelEvent(false));

    expect(recorder.snapshot()).toMatchObject({
      mode: "persistent",
      reference_image_visible: true,
      reference_image_zoom_attempts: 2,
      prohibited_events: [
        { t: 25, type: "ctrl_wheel", handled: false },
        { t: 50, type: "reference_image_pointer_zoom", handled: false },
      ],
    });
  });

  it("records a visual viewport scale observation but ignores ordinary resize/orientation/DPR changes", () => {
    const frame = new EventTarget();
    const windowRef = createWindowDouble(1);
    const recorder = new ReferenceAssistanceRecorder({ nowImpl: createNowSequence([100, 200]) });

    recorder.start(frame as unknown as HTMLElement, windowRef);
    windowRef.visualViewport.scale = 1.25;
    windowRef.visualViewport.dispatchEvent(new Event("resize"));
    windowRef.dispatchEvent(new Event("resize"));
    windowRef.screen.orientation.dispatchEvent(new Event("change"));

    const result = recorder.snapshot();
    expect(result.browser_zoom_observations).toEqual([
      expect.objectContaining({ t: 100, scale: 1.25 }),
    ]);
    expect(result.reference_image_zoom_attempts).toBe(1);
    expect(result.prohibited_events).toEqual([
      { t: 100, type: "browser_zoom_change", handled: false },
    ]);
  });

  it("removes all listeners when stopped", () => {
    const frame = new EventTarget();
    const windowRef = createWindowDouble(1);
    const recorder = new ReferenceAssistanceRecorder({ nowImpl: vi.fn(() => 100) });

    recorder.start(frame as unknown as HTMLElement, windowRef);
    recorder.stop();
    frame.dispatchEvent(createWheelEvent(true));

    expect(recorder.snapshot().reference_image_zoom_attempts).toBe(0);
  });
});

function createWindowDouble(scale: number): Window & { visualViewport: EventTarget & { scale: number } } {
  const visualViewport = Object.assign(new EventTarget(), { scale });
  const windowRef = Object.assign(new EventTarget(), {
    visualViewport,
    screen: { orientation: new EventTarget() },
  });
  return windowRef as Window & { visualViewport: EventTarget & { scale: number } };
}

function createWheelEvent(ctrlKey: boolean): Event {
  const event = new Event("wheel");
  Object.defineProperty(event, "ctrlKey", { value: ctrlKey });
  return event;
}

function createNowSequence(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}
