import type { RuntimeTaskConfig } from "../types/runtime";

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ViewportWarningState {
  show: boolean;
  message: string;
}

const DEFAULT_MIN_VIEWPORT_MESSAGE =
  "Your browser window is smaller than recommended for this layout task.";

// Pure helper for renderer and tests. UI can call this on load and resize.
// 这里只判断是否提示，不阻断任务；实验逻辑仍然继续运行。
export function getViewportWarningState(
  config: Pick<RuntimeTaskConfig, "requirements">,
  viewport: ViewportSize,
): ViewportWarningState {
  const minViewport = config.requirements?.min_viewport;
  if (!minViewport) {
    return { show: false, message: "" };
  }

  const tooSmall = viewport.width < minViewport.width || viewport.height < minViewport.height;
  return {
    show: tooSmall,
    message: minViewport.message ?? DEFAULT_MIN_VIEWPORT_MESSAGE,
  };
}
