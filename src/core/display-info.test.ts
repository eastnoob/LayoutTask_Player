import { describe, expect, it, vi } from "vitest";
import { createRuntimeConfig } from "../test-support/runtime-config";
import { DisplayInfoCollector } from "./display-info";

describe("DisplayInfoCollector", () => {
  it("collects display image rect, natural size, and DPR-scaled rendered size", async () => {
    const image = {
      naturalWidth: 2400,
      naturalHeight: 1200,
      getBoundingClientRect: vi.fn(() => createDomRect({ width: 600, height: 300 })),
    } as unknown as HTMLImageElement;
    const frame = {
      getBoundingClientRect: vi.fn(() => createDomRect({ x: 10, y: 20, width: 620, height: 320 })),
    } as unknown as HTMLElement;
    const collector = new DisplayInfoCollector(
      {
        root: {} as HTMLElement,
        objectElements: new Map(),
        controlElements: new Map(),
        controlButtons: new Map(),
        displayImageFrameElement: frame,
        displayImageElement: image,
      },
      createRuntimeConfig({
        displayImage: {
          enabled: true,
          src: "assets/display-images/example.jpeg",
          srcResolved: "http://example.test/layout-task/assets/display-images/example.jpeg",
          alt: "Reference image",
          record_metrics: true,
        },
      }),
    );

    const result = await withWindowMetrics(2, () => collector.collect());

    expect(result.displayImageNatural).toEqual({ width: 2400, height: 1200 });
    expect(result.displayImageRect).toMatchObject({ width: 600, height: 300 });
    expect(result.displayImageFrameRect).toMatchObject({ x: 10, y: 20, width: 620, height: 320 });
    expect(result.displayImageRendered).toEqual({
      cssWidth: 600,
      cssHeight: 300,
      devicePixelRatio: 2,
      effectivePixelWidth: 1200,
      effectivePixelHeight: 600,
    });
    expect(result.visualViewport).toMatchObject({ scale: 1.25, width: 1200, height: 700 });
    expect(result.screenOrientation).toEqual({ type: "landscape-primary", angle: 0 });
    expect(result.screenColor).toEqual({ colorDepth: 24, pixelDepth: 24 });
  });

  it("skips display image metrics when record_metrics is false", async () => {
    const image = {
      naturalWidth: 2400,
      naturalHeight: 1200,
      getBoundingClientRect: vi.fn(() => createDomRect({ width: 600, height: 300 })),
    } as unknown as HTMLImageElement;
    const collector = new DisplayInfoCollector(
      {
        root: {} as HTMLElement,
        objectElements: new Map(),
        controlElements: new Map(),
        controlButtons: new Map(),
        displayImageElement: image,
      },
      createRuntimeConfig({
        displayImage: {
          enabled: true,
          src: "assets/display-images/example.jpeg",
          srcResolved: "http://example.test/layout-task/assets/display-images/example.jpeg",
          alt: "Reference image",
          record_metrics: false,
        },
      }),
    );

    const result = await withWindowMetrics(2, () => collector.collect());

    expect(result.displayImageNatural).toBeUndefined();
    expect(result.displayImageRendered).toBeUndefined();
    expect(image.getBoundingClientRect).not.toHaveBeenCalled();
  });

  it("skips display change history when record_display_changes is false", async () => {
    const collector = new DisplayInfoCollector(
      {
        root: {} as HTMLElement,
        objectElements: new Map(),
        controlElements: new Map(),
        controlButtons: new Map(),
      },
      createRuntimeConfig({
        recording: {
          ...createRuntimeConfig().recording,
          record_display_changes: false,
        },
      }),
      {
        collect: () => ({
          events: [],
          resizeCount: 1,
          visualViewportResizeCount: 0,
          visualViewportScrollCount: 0,
          orientationChangeCount: 0,
        }),
      } as never,
    );

    const result = await withWindowMetrics(2, () => collector.collect());

    expect(result.changes).toBeUndefined();
  });
});

function createDomRect(input: Partial<DOMRect> = {}): DOMRect {
  const x = input.x ?? 0;
  const y = input.y ?? 0;
  const width = input.width ?? 0;
  const height = input.height ?? 0;
  return {
    x,
    y,
    width,
    height,
    top: input.top ?? y,
    right: input.right ?? x + width,
    bottom: input.bottom ?? y + height,
    left: input.left ?? x,
    toJSON: () => ({}),
  } as DOMRect;
}

async function withWindowMetrics<T>(devicePixelRatio: number, callback: () => Promise<T>): Promise<T> {
  const previousWindow = globalThis.window;
  const previousScreen = globalThis.screen;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      innerWidth: 1440,
      innerHeight: 900,
      devicePixelRatio,
      visualViewport: {
        width: 1200,
        height: 700,
        scale: 1.25,
        offsetLeft: 2,
        offsetTop: 3,
        pageLeft: 4,
        pageTop: 5,
      },
      screen: {
        width: 1440,
        height: 900,
        availWidth: 1440,
        availHeight: 860,
        colorDepth: 24,
        pixelDepth: 24,
        orientation: {
          type: "landscape-primary",
          angle: 0,
        },
      },
    },
  });
  Object.defineProperty(globalThis, "screen", {
    configurable: true,
    value: globalThis.window.screen,
  });

  try {
    return await callback();
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    Object.defineProperty(globalThis, "screen", { configurable: true, value: previousScreen });
  }
}
