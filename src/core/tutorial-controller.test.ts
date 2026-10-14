import { describe, expect, it } from "vitest";
import { ConfidenceController } from "./confidence-controller";
import { TutorialController } from "./tutorial-controller";
import { createRuntimeConfig } from "../test-support/runtime-config";

function fixture(locale: "en-US" | "zh-CN" = "en-US", mode: "persistent" | "preview_10s" = "persistent") {
  const base = createRuntimeConfig();
  const config = { ...base, objects: ["chair", "table", "sofa"].map((id) => ({ ...base.objects[0], id, group_id: id, role: "variable" as const })) };
  const confidence = new ConfidenceController({ config, required: true, scale: [1, 2, 3, 4, 5], requireAllGroupsOnSubmit: true });
  const tutorial = new TutorialController(mode, locale, { confidence, getGroupId: (id) => id, referenceBoardRequired: true });
  const observe = () => {
    if (mode === "preview_10s") tutorial.handle("preview_acknowledged");
    tutorial.handle("reconstruction_started");
    tutorial.handle("reference_board_completed");
    tutorial.handle("view_direction_acknowledged");
  };
  const magnify = () => {
    tutorial.handle("magnifier_entered");
    tutorial.handle("magnifier_zoom_changed", { zoomBefore: 2, zoomAfter: 2.25 });
    tutorial.handle("magnifier_exited", { exitReason: "escape" });
  };
  const save = (id: string) => {
    confidence.enterObjectEdit(id);
    tutorial.handle("object_selected", { objectId: id });
    confidence.choose("position", 3); tutorial.handle("confidence_chosen");
    confidence.choose("rotation", 4); tutorial.handle("confidence_chosen");
    expect(confidence.saveActiveGroup().ok).toBe(true);
    tutorial.handle("object_saved", { objectId: id });
  };
  return { tutorial, confidence, observe, magnify, save };
}

describe("TutorialController confirmed gates", () => {
  it.each(["persistent", "preview_10s"] as const)("orders observation, practices, zero-movement saves and submission (%s)", (mode) => {
    const { tutorial, confidence, magnify, save } = fixture("en-US", mode);
    expect(tutorial.getCurrentStep().id).toBe("intro");
    expect(tutorial.handle("object_selected", { objectId: "chair" })).toBe(false);
    if (mode === "preview_10s") {
      tutorial.handle("preview_acknowledged");
      expect(tutorial.getCurrentStep().id).toBe("preview");
    }
    tutorial.handle("reconstruction_started");
    expect(tutorial.getCurrentStep().id).toBe("reference_board");
    expect(tutorial.isInteractionBlocked()).toBe(true);
    expect(tutorial.handle("magnifier_entered")).toBe(false);
    expect(tutorial.handle("view_direction_acknowledged")).toBe(false);
    tutorial.handle("reference_board_completed");
    expect(tutorial.getCurrentStep().id).toBe("view_direction");
    expect(tutorial.isInteractionBlocked()).toBe(true);
    expect(tutorial.handle("magnifier_entered")).toBe(false);
    tutorial.handle("view_direction_acknowledged");
    expect(tutorial.getCurrentStep().id).toBe("magnifier_practice");
    expect(tutorial.isInteractionBlocked()).toBe(true);
    magnify();
    expect(tutorial.getCurrentStep().id).toBe("select_first");
    expect(tutorial.isInteractionBlocked()).toBe(false);
    confidence.enterObjectEdit("chair"); tutorial.handle("object_selected", { objectId: "chair" });
    expect(tutorial.getCurrentStep().id).toBe("confidence_first");
    expect(confidence.getFinalConfidence()).toEqual({});
    confidence.choose("position", 3);
    expect(tutorial.handle("confidence_chosen")).toBe(false);
    expect(tutorial.handle("object_saved", { objectId: "chair" })).toBe(false);
    expect(confidence.saveActiveGroup().ok).toBe(false);
    confidence.choose("rotation", 4); tutorial.handle("confidence_chosen");
    expect(tutorial.getCurrentStep().id).toBe("save_first");
    expect(tutorial.handle("object_deselected", { objectId: "chair" })).toBe(false);
    confidence.saveActiveGroup(); tutorial.handle("object_saved", { objectId: "chair" });
    expect(tutorial.getCurrentStep().id).toBe("pause_practice");
    expect(tutorial.isInteractionBlocked()).toBe(true);
    expect(tutorial.handle("object_selected", { objectId: "table" })).toBe(false);
    tutorial.handle("pause_requested"); tutorial.handle("pause_confirmed");
    tutorial.handle("pause_resumed", { resumeReason: "manual_resume" });
    expect(tutorial.getCurrentStep().id).toBe("remaining_objects");
    save("table"); expect(tutorial.canSubmit()).toBe(false);
    save("sofa"); expect(tutorial.getCurrentStep().id).toBe("submit");
    expect(tutorial.canSubmit()).toBe(true);
    tutorial.handle("submitted"); expect(tutorial.isComplete()).toBe(true);
  });

  it("requires actual zoom and ESC in the same session; early exits allow retry", () => {
    const { tutorial, observe, magnify } = fixture();
    observe();
    expect(tutorial.handle("magnifier_zoom_changed", { zoomBefore: 2, zoomAfter: 2.25 })).toBe(false);
    tutorial.handle("magnifier_entered");
    tutorial.handle("magnifier_zoom_changed", { zoomBefore: 4, zoomAfter: 4 });
    tutorial.handle("magnifier_exited", { exitReason: "escape" });
    expect(tutorial.getCurrentStep().id).toBe("magnifier_practice");
    tutorial.handle("magnifier_entered");
    tutorial.handle("magnifier_zoom_changed", { zoomBefore: 2, zoomAfter: 2.25 });
    tutorial.handle("magnifier_exited", { exitReason: "destroy" });
    expect(tutorial.getCurrentStep().id).toBe("magnifier_practice");
    tutorial.handle("magnifier_entered");
    tutorial.handle("magnifier_exited", { exitReason: "escape" });
    expect(tutorial.getCurrentStep().id).toBe("magnifier_practice");
    magnify(); expect(tutorial.getCurrentStep().id).toBe("select_first");
  });

  it.each(["manual_resume", "auto_resume_10s"] as const)("requires request and confirmation; cancellation allows retry (%s)", (resumeReason) => {
    const { tutorial, observe, magnify, save } = fixture();
    observe(); magnify(); save("chair");
    expect(tutorial.handle("pause_confirmed")).toBe(false);
    expect(tutorial.handle("pause_resumed", { resumeReason })).toBe(false);
    tutorial.handle("pause_requested"); expect(tutorial.canStartMagnifier()).toBe(false);
    tutorial.handle("pause_cancelled");
    expect(tutorial.getCurrentStep().id).toBe("pause_practice");
    expect(tutorial.isInteractionBlocked()).toBe(true);
    tutorial.handle("pause_requested"); tutorial.handle("pause_confirmed");
    expect(tutorial.handle("pause_resumed", { resumeReason: "auto_resume_15m" })).toBe(false);
    tutorial.handle("pause_resumed", { resumeReason });
    expect(tutorial.isInteractionBlocked()).toBe(false);
  });

  it("keeps first-save facts during re-edit, but refuses unsaved confidence and active modes", () => {
    const { tutorial, confidence, observe, magnify, save } = fixture();
    observe(); magnify(); save("chair");
    tutorial.handle("pause_requested"); tutorial.handle("pause_confirmed"); tutorial.handle("pause_resumed", { resumeReason: "auto_resume_10s" });
    save("table"); save("sofa");
    confidence.enterObjectEdit("chair");
    expect(confidence.getFinalConfidence().chair).toEqual({ position: 3, rotation: 4 });
    expect(tutorial.canSubmit()).toBe(false);
    confidence.choose("position", 2); confidence.choose("rotation", 2); confidence.saveActiveGroup();
    expect(tutorial.canSubmit()).toBe(true);
    tutorial.handle("magnifier_entered");
    expect(tutorial.isInteractionBlocked()).toBe(true);
    expect(tutorial.canStartPause()).toBe(false);
    expect(tutorial.handle("submitted")).toBe(false);
    expect(tutorial.canSubmit()).toBe(false);
    tutorial.handle("magnifier_exited", { exitReason: "escape" });
    expect(tutorial.canSubmit()).toBe(true);
  });

  it("rejects early submission even when all answers were saved externally", () => {
    const { tutorial, confidence, observe } = fixture();
    for (const id of confidence.getRequiredGroupIds()) {
      confidence.enterObjectEdit(id); confidence.choose("position", 3); confidence.choose("rotation", 3); confidence.saveActiveGroup();
    }
    observe();
    expect(tutorial.canSubmit()).toBe(false);
    expect(tutorial.handle("submitted")).toBe(false);
    expect(tutorial.handle("object_selected", { objectId: "chair" })).toBe(false);
  });

  it.each(["en-US", "zh-CN"] as const)("localizes new practice guidance (%s)", (locale) => {
    const { tutorial, observe, magnify, save } = fixture(locale);
    const prefix = locale === "zh-CN" ? "你的任务：" : "Your task:";
    expect(tutorial.getCurrentStep().task.startsWith(prefix)).toBe(true);
    observe(); expect(tutorial.getCurrentStep().task.startsWith(prefix)).toBe(true);
    magnify(); save("chair");
    expect(tutorial.getCurrentStep().task.startsWith(prefix)).toBe(true);
    expect(tutorial.getCurrentStep().message).toContain(locale === "zh-CN" ? "页面右下角高亮的 Pause" : "highlighted Pause button at the bottom-right of the page");
  });

  it.each(["en-US", "zh-CN"] as const)("uses the approved tutorial copy (%s)", (locale) => {
    const { tutorial, confidence, magnify, save } = fixture(locale);
    const english = locale === "en-US";
    const taskPrefix = english ? "Your task: " : "你的任务：";
    expect(tutorial.getCurrentStep()).toMatchObject({
      task: taskPrefix + (english ? "Study the perspective image and prepare to reconstruct the floor plan." : "观察透视图，准备还原平面图。"),
      message: english
        ? "You may refer to the image at any time. Remember each marked item's presence, position, and orientation."
        : "你可以随时查看透视图。请注意每件标记家具是否出现、位置和方向。",
    });

    tutorial.handle("reconstruction_started");
    expect(tutorial.getCurrentStep().id).toBe("reference_board");
    tutorial.handle("reference_board_completed");
    expect(tutorial.getCurrentStep()).toMatchObject({
      task: taskPrefix + (english ? "Confirm the viewing direction shown by the yellow arrow." : "确认黄色箭头所示的观察方向。"),
      message: english
        ? "The observer is at the bottom of the plan. This direction stays fixed throughout the experiment."
        : "观察者位于平面图下方；该方向在整个实验中保持不变。",
    });

    tutorial.handle("view_direction_acknowledged");
    expect(tutorial.getCurrentStep()).toMatchObject({
      task: taskPrefix + (english ? "Open the magnifier, change its zoom with the wheel, then press ESC to exit." : "打开放大镜，滚轮调节倍率，再按 ESC 退出。"),
      message: english
        ? "It magnifies only the floor plan. Do not enlarge the perspective image with [[warning]]browser zoom[[/warning]], [[warning]]Ctrl+scroll[[/warning]], or another tool; these actions may be recorded."
        : "放大镜仅用于平面图。请勿用[[warning]]浏览器缩放[[/warning]]、[[warning]]Ctrl+滚轮[[/warning]]或其他工具放大透视图；这些行为可能会被记录。",
    });

    magnify();
    expect(tutorial.getCurrentStep()).toMatchObject({
      task: taskPrefix + (english ? "Click a glowing yellow object to begin editing." : "点击发红光的黄色物体，开始编辑。"),
      message: english
        ? "Red glow means its first edit has not been saved. Only yellow objects can be edited."
        : "红光表示尚未保存首次编辑。只有黄色物体可以编辑。",
    });

    confidence.enterObjectEdit("chair");
    tutorial.handle("object_selected", { objectId: "chair" });
    expect(tutorial.getCurrentStep()).toMatchObject({
      task: taskPrefix + (english ? "Match this object's position and orientation to the perspective image." : "根据透视图，还原所选家具的位置和方向。"),
      message: english
        ? "Refer to the control tips in [[warning]]the gray box on the right[[/warning]], then rate your confidence in position and orientation at the bottom left."
        : "参考[[warning]]页面右侧灰色框[[/warning]]中的操作提示，完成调整后在左下方填写位置和方向置信度。",
    });
    confidence.choose("position", 3); confidence.choose("rotation", 4);
    tutorial.handle("confidence_chosen");
    expect(tutorial.getCurrentStep()).toMatchObject({
      task: taskPrefix + (english ? "Save both ratings." : "保存两项置信度。"),
      message: english
        ? "Select Save to finish this edit. The red glow disappears after the first save."
        : "点击 Save 完成本次编辑；首次保存后红光消失。",
    });
    confidence.saveActiveGroup(); tutorial.handle("object_saved", { objectId: "chair" });
    expect(tutorial.getCurrentStep()).toMatchObject({
      task: taskPrefix + (english ? "Complete the Pause practice." : "完成 Pause 练习。"),
      message: english
        ? "Click the highlighted Pause button at the bottom-right of the page and confirm. Wait for automatic resume or choose Resume."
        : "点击页面右下角高亮的 Pause 按钮并确认；等待自动恢复，或点击 Resume。",
    });

    tutorial.handle("pause_requested"); tutorial.handle("pause_confirmed");
    tutorial.handle("pause_resumed", { resumeReason: "manual_resume" });
    expect(tutorial.getCurrentStep()).toMatchObject({
      task: taskPrefix + (english ? "Edit and save each remaining yellow object." : "编辑并保存其余每个黄色物体。"),
      message: english
        ? "Save both position and orientation confidence ratings for each one."
        : "每个都要保存位置和方向两项置信度。",
    });

    save("table"); save("sofa");
    expect(tutorial.getCurrentStep()).toMatchObject({
      task: taskPrefix + (english ? "Finish all remaining objects, then continue." : "完成所有剩余物体，然后继续。"),
      message: english
        ? "Every yellow object must have both ratings saved at least once. You can reopen any saved object and edit it as often as you like. Select Confirm when all are saved."
        : "每个黄色物体都必须至少保存两项置信度一次；之后可无限次重新编辑。全部保存后选择 Confirm。",
    });
    tutorial.handle("submitted");
    expect(tutorial.getCurrentStep()).toMatchObject({
      task: taskPrefix + (english ? "Tutorial complete." : "教程完成。"),
      message: english ? "Tutorial complete." : "教程完成。",
    });
  });

  it.each(["persistent", "preview_10s"] as const)("keeps the direction step when no reference board is configured (%s)", (mode) => {
    const tutorial = new TutorialController(mode);
    if (mode === "preview_10s") tutorial.handle("preview_acknowledged");
    tutorial.handle("reconstruction_started");
    expect(tutorial.getCurrentStep().id).toBe("view_direction");
    tutorial.handle("view_direction_acknowledged");
    expect(tutorial.getCurrentStep().id).toBe("magnifier_practice");
  });
});
