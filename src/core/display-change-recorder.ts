import type { DisplayChangeEvent, DisplayChangeSnapshot, DisplayInfo } from "../types/result";
import type { RendererRefs } from "./renderer";
import { elapsedMs, now } from "../utils/time";

interface DisplayChangeRecorderOptions {
  refs: RendererRefs;
  nowImpl?: () => number;
  windowRef?: Window;
}

// Records browser-visible display changes during one task run.
// 纯静态页面也可以监听 resize / orientation；这里把变化过程留在内存里，最后随 result 一起导出。
export class DisplayChangeRecorder {
  private readonly nowImpl: () => number;
  private readonly windowRef: Window;
  private readonly events: DisplayChangeEvent[] = [];
  private startTime = 0;
  private initial: DisplayChangeSnapshot | undefined;
  private resizeCount = 0;
  private visualViewportResizeCount = 0;
  private visualViewportScrollCount = 0;
  private orientationChangeCount = 0;
  private bound = false;

  private readonly handleWindowResize = () => {
    this.resizeCount += 1;
    this.record("window_resize");
  };

  private readonly handleVisualViewportResize = () => {
    this.visualViewportResizeCount += 1;
    this.record("visual_viewport_resize");
  };

  private readonly handleVisualViewportScroll = () => {
    this.visualViewportScrollCount += 1;
    this.record("visual_viewport_scroll");
  };

  private readonly handleOrientationChange = () => {
    this.orientationChangeCount += 1;
    this.record("orientation_change");
  };

  constructor(private readonly options: DisplayChangeRecorderOptions) {
    this.nowImpl = options.nowImpl ?? now;
    // windowRef is injectable for tests. 生产环境里使用真实 browser window。
    this.windowRef = options.windowRef ?? window;
  }

  start(): void {
    if (this.bound) {
      return;
    }

    this.startTime = this.nowImpl();
    this.initial = this.snapshot();
    this.windowRef.addEventListener("resize", this.handleWindowResize);
    this.windowRef.visualViewport?.addEventListener("resize", this.handleVisualViewportResize);
    this.windowRef.visualViewport?.addEventListener("scroll", this.handleVisualViewportScroll);
    this.windowRef.screen.orientation?.addEventListener?.("change", this.handleOrientationChange);
    this.bound = true;
  }

  stop(): void {
    if (!this.bound) {
      return;
    }

    this.windowRef.removeEventListener("resize", this.handleWindowResize);
    this.windowRef.visualViewport?.removeEventListener("resize", this.handleVisualViewportResize);
    this.windowRef.visualViewport?.removeEventListener("scroll", this.handleVisualViewportScroll);
    this.windowRef.screen.orientation?.removeEventListener?.("change", this.handleOrientationChange);
    this.bound = false;
  }

  collect(): NonNullable<DisplayInfo["changes"]> {
    return {
      initial: this.initial,
      final: this.snapshot(),
      events: [...this.events],
      resizeCount: this.resizeCount,
      visualViewportResizeCount: this.visualViewportResizeCount,
      visualViewportScrollCount: this.visualViewportScrollCount,
      orientationChangeCount: this.orientationChangeCount,
    };
  }

  private record(type: DisplayChangeEvent["type"]): void {
    this.events.push({
      i: this.events.length,
      t: elapsedMs(this.startTime, this.nowImpl()),
      type,
      snapshot: this.snapshot(),
    });
  }

  private snapshot(): DisplayChangeSnapshot {
    const visualViewport = this.windowRef.visualViewport;
    const orientation = this.windowRef.screen.orientation;
    const imageRect = this.options.refs.displayImageElement?.getBoundingClientRect();

    // Snapshot stays intentionally compact.
    // 完整 rect 已经在 final display info 里记录，这里只保留判断“窗口是否变化”所需字段。
    return {
      viewport: {
        width: this.windowRef.innerWidth,
        height: this.windowRef.innerHeight,
      },
      visualViewport: visualViewport
        ? {
            width: visualViewport.width,
            height: visualViewport.height,
            scale: visualViewport.scale,
            offsetLeft: visualViewport.offsetLeft,
            offsetTop: visualViewport.offsetTop,
            pageLeft: visualViewport.pageLeft,
            pageTop: visualViewport.pageTop,
          }
        : undefined,
      screenOrientation: orientation
        ? {
            type: orientation.type,
            angle: orientation.angle,
          }
        : undefined,
      displayImageRect: imageRect
        ? {
            width: imageRect.width,
            height: imageRect.height,
          }
        : undefined,
    };
  }
}
