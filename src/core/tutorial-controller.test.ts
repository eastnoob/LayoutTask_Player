import { describe, expect, it } from "vitest";
import { TutorialController } from "./tutorial-controller";

describe("TutorialController", () => {
  it("starts with the preview explanation step", () => {
    const controller = new TutorialController();

    expect(controller.getCurrentStep()).toMatchObject({
      id: "intro",
      anchor: "flow-modal",
    });
  });

  it("advances only on the expected event", () => {
    const controller = new TutorialController();

    expect(controller.handle("object_selected", { objectId: "chair_01" })).toBe(false);
    expect(controller.getCurrentStep().id).toBe("intro");

    expect(controller.handle("preview_acknowledged")).toBe(true);
    expect(controller.getCurrentStep().id).toBe("preview");
  });

  it("walks through real reconstruction actions", () => {
    const controller = new TutorialController();

    expect(controller.handle("preview_acknowledged")).toBe(true);
    expect(controller.handle("reconstruction_started")).toBe(true);
    expect(controller.handle("object_selected", { objectId: "chair_01" })).toBe(true);
    expect(controller.handle("object_moved_or_rotated")).toBe(true);
    expect(controller.handle("confidence_chosen")).toBe(true);
    expect(controller.getCurrentStep()).toMatchObject({ id: "save_first", anchor: "confidence" });
    expect(controller.handle("object_deselected")).toBe(true);
    expect(controller.handle("object_selected", { objectId: "table_01" })).toBe(true);
    expect(controller.handle("confidence_chosen")).toBe(true);
    expect(controller.getCurrentStep()).toMatchObject({ id: "save_second", anchor: "confidence" });
    expect(controller.handle("object_deselected")).toBe(true);
    expect(controller.handle("pause_practice_started")).toBe(true);
    expect(controller.getCurrentStep().id).toBe("pause_practice_resume");
    expect(controller.handle("pause_practice_resumed")).toBe(true);
    expect(controller.handle("submitted")).toBe(true);

    expect(controller.isComplete()).toBe(true);
    expect(controller.getCurrentStep().id).toBe("complete");
  });

  it("requires a tutorial-only pause practice before tutorial submission", () => {
    const controller = new TutorialController();
    controller.handle("preview_acknowledged");
    controller.handle("reconstruction_started");
    controller.handle("object_selected", { objectId: "chair_01" });
    controller.handle("object_moved_or_rotated");
    controller.handle("confidence_chosen");
    controller.handle("object_deselected");
    controller.handle("object_selected", { objectId: "table_01" });
    controller.handle("confidence_chosen");
    controller.handle("object_deselected");

    expect(controller.getCurrentStep()).toMatchObject({ id: "pause_practice" });
    expect(controller.handle("submitted")).toBe(false);
    expect(controller.handle("pause_practice_started")).toBe(true);
    expect(controller.handle("pause_practice_started")).toBe(false);
    expect(controller.handle("pause_practice_resumed")).toBe(true);
    expect(controller.getCurrentStep().id).toBe("submit");
  });

  it("uses persistent-reference guidance without a preview gate", () => {
    const controller = new TutorialController("persistent");

    expect(controller.getCurrentStep()).toMatchObject({
      id: "intro",
      expectedEvent: "reconstruction_started",
    });
    expect(controller.getCurrentStep().message).toContain("perspective image at any time");
    expect(controller.getCurrentStep().message).toContain("Ctrl + scroll");
    expect(controller.handle("reconstruction_started")).toBe(true);
    expect(controller.getCurrentStep().id).toBe("select_first");
  });

  it("keeps the operation instructions with the first confidence prompt", () => {
    const controller = new TutorialController();

    controller.handle("preview_acknowledged");
    controller.handle("reconstruction_started");
    controller.handle("object_selected", { objectId: "chair_01" });
    controller.handle("object_moved_or_rotated");

    expect(controller.getCurrentStep().message).toContain("finished with this object");
    expect(controller.getCurrentStep().message).toContain("choose a confidence rating below");

    expect(controller.handle("confidence_chosen")).toBe(true);
    expect(controller.getCurrentStep()).toMatchObject({
      id: "save_first",
      message: expect.stringContaining("Click **Save** below"),
    });

    expect(controller.handle("object_deselected")).toBe(true);
    expect(controller.getCurrentStep()).toMatchObject({
      id: "select_second",
      message: expect.stringContaining("You can now click another"),
    });
  });

  it("marks important tutorial phrases for visual emphasis", () => {
    const controller = new TutorialController();

    controller.handle("preview_acknowledged");
    controller.handle("reconstruction_started");
    controller.handle("object_selected", { objectId: "chair_01" });

    expect(controller.getCurrentStep().message).toContain("**Use the arrow buttons to move**");
    expect(controller.getCurrentStep().message).toContain("**the rotate buttons to adjust**");
    expect(controller.getCurrentStep().message).toContain("this does not exit edit mode");

    const selectController = new TutorialController();
    selectController.handle("preview_acknowledged");
    selectController.handle("reconstruction_started");
    expect(selectController.getCurrentStep().message).toContain("[[yellow]]yellow object[[/yellow]]");
    expect(selectController.getCurrentStep().message).toContain("**Only yellow objects can be moved.**");
    expect(selectController.getCurrentStep().message).toContain("zoom controls in the lower-right corner");
  });
});
