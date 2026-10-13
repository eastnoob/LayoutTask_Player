import { describe, expect, it } from "vitest";
import { DEFAULT_MESSAGES, resolveMessages } from "./messages";

describe("default task instructions", () => {
  it("omits the repeated edit-mode paragraph while retaining focused reconstruction hints", () => {
    expect(DEFAULT_MESSAGES.instruction_edit_mode).toBe("");
    expect(DEFAULT_MESSAGES.reconstruction_hint_title).toBe("Reconstruct the floor plan based on the picture you just studied.");
    expect(DEFAULT_MESSAGES.reconstruction_hint_drag).toBe("Drag movable objects to place them.");
    expect(DEFAULT_MESSAGES.reconstruction_hint_button).toBe("Use the arrow buttons to move selected objects.");
    expect(DEFAULT_MESSAGES.reconstruction_hint_rotation).toBe("Use the rotate buttons to adjust orientation.");
    expect(DEFAULT_MESSAGES.reconstruction_hint_select).toBe("Click an object to show its available controls.");
    expect(DEFAULT_MESSAGES.reconstruction_hint_no_information).toContain("without changing its position or rotation");
    expect(DEFAULT_MESSAGES.reconstruction_hint_no_information).toContain("Completely unsure");
    expect(DEFAULT_MESSAGES.reconstruction_hint_no_information).toContain("Use this option sparingly");
  });

  it("localizes participant messages only when zh-CN is explicit", () => {
    expect(resolveMessages(undefined, "zh-CN").instruction_edit_mode).toBe("");
    expect(resolveMessages(undefined, "zh-CN").status_ready).toBe("准备就绪");
    expect(resolveMessages(undefined, "en-US").status_ready).toBe("Ready");
    expect(resolveMessages(undefined, "zh-CN").reconstruction_hint_title).toBe("请根据刚才看到的图片还原场景平面图。");
    expect(resolveMessages(undefined, "zh-CN").reconstruction_hint_no_information).toContain("完全不确定");
    expect(resolveMessages(undefined, "zh-CN").reconstruction_hint_drag).toBe("拖动可移动物体进行摆放。");
    expect(resolveMessages(undefined, "zh-CN").reconstruction_hint_button).toBe("使用箭头按钮移动选中的物体。");
    expect(resolveMessages(undefined, "zh-CN").reconstruction_hint_rotation).toBe("使用旋转按钮调整方向。");
    expect(resolveMessages(undefined, "zh-CN").reconstruction_hint_select).toBe("点击物体以显示可用的操作。");
    expect(resolveMessages(undefined, "zh-CN").reconstruction_hint_no_information).toContain("不改变其位置和旋转");
    expect(resolveMessages(undefined, "zh-CN").reconstruction_hint_no_information).toContain("请谨慎使用");
  });
});
