import { describe, expect, it } from "vitest";
import { DisplayChangeRecorder } from "./display-change-recorder";

describe("DisplayChangeRecorder", () => {
  it("records window and visual viewport changes", () => {
    const listeners = new Map<string, EventListener>();
    const visualViewportListeners = new Map<string, EventListener>();
    const orientationListeners = new Map<string, EventListener>();
    const recorder = new DisplayChangeRecorder({
      refs: {
        root: {} as HTMLElement,
        objectElements: new Map(),
        controlElements: new Map(),
        controlButtons: new Map(),
        displayImageElement: {
          getBoundingClientRect: () =>
            ({
              width: 640,
              height: 480,
            }) as DOMRect,
        } as HTMLImageElement,
      },
      nowImpl: createNowSequence([1000, 1200, 1800, 2200]),
      windowRef: {
        innerWidth: 1400,
        innerHeight: 900,
        addEventListener: (type: string, listener: EventListener) => {
          listeners.set(type, listener);
        },
        removeEventListener: () => undefined,
        visualViewport: {
          width: 1380,
          height: 880,
          scale: 1,
          offsetLeft: 0,
          offsetTop: 0,
          pageLeft: 0,
          pageTop: 0,
          addEventListener: (type: string, listener: EventListener) => {
            visualViewportListeners.set(type, listener);
          },
          removeEventListener: () => undefined,
        },
        screen: {
          orientation: {
            type: "landscape-primary",
            angle: 0,
            addEventListener: (type: string, listener: EventListener) => {
              orientationListeners.set(type, listener);
            },
            removeEventListener: () => undefined,
          },
        },
      } as unknown as Window,
    });

    recorder.start();
    listeners.get("resize")?.(new Event("resize"));
    visualViewportListeners.get("resize")?.(new Event("resize"));
    orientationListeners.get("change")?.(new Event("change"));

    const result = recorder.collect();

    expect(result.resizeCount).toBe(1);
    expect(result.visualViewportResizeCount).toBe(1);
    expect(result.orientationChangeCount).toBe(1);
    expect(result.events).toHaveLength(3);
    expect(result.initial?.viewport).toEqual({ width: 1400, height: 900 });
    expect(result.final?.displayImageRect).toEqual({ width: 640, height: 480 });
  });
});

function createNowSequence(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return value;
  };
}
