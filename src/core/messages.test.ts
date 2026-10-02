import { describe, expect, it } from "vitest";
import { DEFAULT_MESSAGES, resolveMessages } from "./messages";

describe("default task instructions", () => {
  it("explains the top reference picture, both confidence ratings, and the cautious no-information path", () => {
    expect(DEFAULT_MESSAGES.instruction_edit_mode).toContain("picture is shown at the top of the page");
    expect(DEFAULT_MESSAGES.instruction_edit_mode).toContain("position and rotation");
    expect(DEFAULT_MESSAGES.reconstruction_hint_title).toBe("Reconstruct the floor plan based on the picture you just studied.");
    expect(DEFAULT_MESSAGES.reconstruction_hint_no_information).toContain("without changing its position or rotation");
    expect(DEFAULT_MESSAGES.reconstruction_hint_no_information).toContain("Completely unsure");
    expect(DEFAULT_MESSAGES.reconstruction_hint_no_information).toContain("Use this option sparingly");
  });

  it("localizes participant messages only when zh-CN is explicit", () => {
    expect(resolveMessages(undefined, "zh-CN").status_ready).toBe("准备就绪");
    expect(resolveMessages(undefined, "en-US").status_ready).toBe("Ready");
    expect(resolveMessages(undefined, "zh-CN").reconstruction_hint_title).toBe("请根据刚才看到的图片还原场景平面图。");
    expect(resolveMessages(undefined, "zh-CN").reconstruction_hint_no_information).toContain("完全不确定");
  });
});
