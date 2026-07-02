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
    expect(controller.handle("object_deselected")).toBe(true);
    expect(controller.handle("object_selected", { objectId: "table_01" })).toBe(true);
    expect(controller.handle("confidence_chosen")).toBe(true);
    expect(controller.handle("submitted")).toBe(true);

    expect(controller.isComplete()).toBe(true);
    expect(controller.getCurrentStep().id).toBe("complete");
  });
});
