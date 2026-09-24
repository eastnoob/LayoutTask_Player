import type { ReferenceAssistanceInfo } from "../types/result";
import { elapsedMs, now } from "../utils/time";

interface ReferenceAssistanceRecorderOptions {
  nowImpl?: () => number;
}

type VisualViewportLike = EventTarget & {
  scale: number;
  width?: number;
  height?: number;
};

type WindowLike = EventTarget & {
  innerWidth?: number;
  innerHeight?: number;
  visualViewport?: VisualViewportLike;
};

export class ReferenceAssistanceRecorder {
  private readonly nowImpl: () => number;
  private readonly prohibitedEvents: ReferenceAssistanceInfo["prohibited_events"] = [];
  private readonly browserZoomObservations: ReferenceAssistanceInfo["browser_zoom_observations"] = [];
  private startTime = 0;
  private initialScale = 1;
  private referenceImageZoomAttempts = 0;
  private frame: EventTarget | undefined;
  private windowRef: WindowLike | undefined;

  private readonly handleFrameWheel = (event: Event) => {
    const wheel = event as WheelEvent;
    this.referenceImageZoomAttempts += 1;
    this.recordProhibited(wheel.ctrlKey ? "ctrl_wheel" : "reference_image_pointer_zoom");
  };

  private readonly handleVisualViewportResize = () => {
    const viewport = this.windowRef?.visualViewport;
    if (!viewport || viewport.scale === this.initialScale) {
      return;
    }

    this.referenceImageZoomAttempts += 1;
    this.browserZoomObservations.push({
      t: elapsedMs(this.startTime, this.nowImpl()),
      scale: viewport.scale,
      viewport_width: viewport.width ?? this.windowRef?.innerWidth ?? 0,
      viewport_height: viewport.height ?? this.windowRef?.innerHeight ?? 0,
    });
    this.recordProhibited("browser_zoom_change");
  };

  constructor(options: ReferenceAssistanceRecorderOptions = {}) {
    this.nowImpl = options.nowImpl ?? now;
  }

  start(referenceFrame: HTMLElement, windowRef: Window): void {
    this.stop();
    this.frame = referenceFrame;
    this.windowRef = windowRef as unknown as WindowLike;
    this.startTime = this.nowImpl();
    this.initialScale = this.windowRef.visualViewport?.scale ?? 1;
    this.frame.addEventListener("wheel", this.handleFrameWheel);
    this.windowRef.visualViewport?.addEventListener("resize", this.handleVisualViewportResize);
  }

  stop(): void {
    this.frame?.removeEventListener("wheel", this.handleFrameWheel);
    this.windowRef?.visualViewport?.removeEventListener("resize", this.handleVisualViewportResize);
    this.frame = undefined;
    this.windowRef = undefined;
  }

  snapshot(): ReferenceAssistanceInfo {
    return {
      mode: "persistent",
      reference_image_visible: true,
      reference_image_zoom_attempts: this.referenceImageZoomAttempts,
      browser_zoom_observations: [...this.browserZoomObservations],
      prohibited_events: [...this.prohibitedEvents],
    };
  }

  private recordProhibited(type: ReferenceAssistanceInfo["prohibited_events"][number]["type"]): void {
    this.prohibitedEvents.push({
      t: elapsedMs(this.startTime, this.nowImpl()),
      type,
      handled: false,
    });
  }
}
