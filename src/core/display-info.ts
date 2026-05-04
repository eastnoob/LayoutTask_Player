import type { DisplayInfo } from "../types/result";
import type { RendererRefs } from "./renderer";
import type { RuntimeTaskConfig } from "../types/runtime";

// DisplayInfoCollector captures device and rendered-layout measurements.
// 这些信息不改变交互，但对后期分析 display context 很重要。
export class DisplayInfoCollector {
  constructor(
    private readonly refs: RendererRefs,
    private readonly config: RuntimeTaskConfig,
  ) {}

  async collect(): Promise<DisplayInfo> {
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
    };
  }
}

function rectToInfo(rect: DOMRect): DisplayInfo["stageRect"] {
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
