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
    tutorial.handle("view_direction_acknowledged");
    tutorial.handle("reference_board_completed");
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
    expect(tutorial.getCurrentStep().id).toBe("view_direction");
    expect(tutorial.isInteractionBlocked()).toBe(true);
    tutorial.handle("view_direction_acknowledged");
    expect(tutorial.getCurrentStep().id).toBe("reference_board");
    expect(tutorial.isInteractionBlocked()).toBe(true);
    expect(tutorial.handle("magnifier_entered")).toBe(false);
    tutorial.handle("reference_board_completed");
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
    expect(tutorial.getCurrentStep().message).toContain("10");
  });
});
