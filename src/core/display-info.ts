import type { DisplayInfo, RectInfo } from "../types/result";
import type { RuntimeTaskConfig } from "../types/runtime";
import type { RendererRefs } from "./renderer";
import type { DisplayChangeRecorder } from "./display-change-recorder";

// DisplayInfoCollector captures device and rendered-layout measurements.
// 这些信息不改变交互逻辑，但对后期分析 display context 很重要。
export class DisplayInfoCollector {
  constructor(
    private readonly refs: RendererRefs,
    private readonly config: RuntimeTaskConfig,
    private readonly changeRecorder?: DisplayChangeRecorder,
  ) {}

  async collect(): Promise<DisplayInfo> {
    const displayImageMetrics = this.collectDisplayImageMetrics();
    const visualViewport = window.visualViewport;
    const orientation = window.screen.orientation;

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        availWidth: window.screen.availWidth,
        availHeight: window.screen.availHeight,
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
      screenColor: {
        colorDepth: window.screen.colorDepth,
        pixelDepth: window.screen.pixelDepth,
      },
      devicePixelRatio: window.devicePixelRatio,
      stageRect: this.refs.svg ? rectToInfo(this.refs.svg.getBoundingClientRect()) : undefined,
      backgroundRect: this.refs.backgroundElement
        ? rectToInfo(this.refs.backgroundElement.getBoundingClientRect())
        : undefined,
      backgroundWorld: {
        x: this.config.background.x,
        y: this.config.background.y,
        width: this.config.background.width,
        height: this.config.background.height,
      },
      changes: this.config.recording.record_display_changes ? this.changeRecorder?.collect() : undefined,
      ...displayImageMetrics,
    };
  }

  private collectDisplayImageMetrics(): Partial<DisplayInfo> {
    const frame = this.refs.displayImageFrameElement;
    const image = this.refs.displayImageElement;
    const config = this.config.displayImage;
    if (!config?.enabled || !config.record_metrics || !image) {
      return {};
    }

    const imageRect = rectToInfo(image.getBoundingClientRect());
    const devicePixelRatio = window.devicePixelRatio;

    // naturalWidth/naturalHeight are best effort: if the image has not finished loading,
    // browsers may report 0. 这里不阻塞任务，只把当前可观察到的尺寸写进结果。
    return {
      displayImageFrameRect: frame ? rectToInfo(frame.getBoundingClientRect()) : undefined,
      displayImageRect: imageRect,
      displayImageNatural: {
        width: image.naturalWidth,
        height: image.naturalHeight,
      },
      displayImageRendered: {
        cssWidth: imageRect.width,
        cssHeight: imageRect.height,
        devicePixelRatio,
        effectivePixelWidth: imageRect.width * devicePixelRatio,
        effectivePixelHeight: imageRect.height * devicePixelRatio,
      },
    };
  }
}

function rectToInfo(rect: DOMRect): RectInfo {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
  };
}
