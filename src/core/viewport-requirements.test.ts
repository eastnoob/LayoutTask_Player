import { describe, expect, it } from "vitest";
import { getViewportWarningState } from "./viewport-requirements";

describe("getViewportWarningState", () => {
  it("shows a warning when the viewport is smaller than required", () => {
    const state = getViewportWarningState(
      {
        requirements: {
          min_viewport: {
            width: 1024,
            height: 720,
            mode: "warn",
            message: "Please enlarge your browser window.",
          },
        },
      },
      { width: 900, height: 700 },
    );

    expect(state).toEqual({
      show: true,
      message: "Please enlarge your browser window.",
    });
  });

  it("hides the warning when the viewport is large enough", () => {
    const state = getViewportWarningState(
      {
        requirements: {
          min_viewport: {
            width: 1024,
            height: 720,
            mode: "warn",
          },
        },
      },
      { width: 1440, height: 900 },
    );

    expect(state).toEqual({
      show: false,
      message: "Your browser window is smaller than recommended for this layout task.",
    });
  });
});
