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

  it("blocks all experiment interaction while the direction confirmation is pending", () => {
    const controller = new TutorialController("persistent");

    controller.handle("reconstruction_started");
    expect(controller.getCurrentStep().id).toBe("view_direction");
    expect(controller.isInteractionBlocked()).toBe(true);

    controller.handle("view_direction_acknowledged");
    expect(controller.isInteractionBlocked()).toBe(false);
  });

  it("walks through real reconstruction actions", () => {
    const controller = new TutorialController();

    expect(controller.handle("preview_acknowledged")).toBe(true);
    expect(controller.handle("reconstruction_started")).toBe(true);
    expect(controller.getCurrentStep().id).toBe("view_direction");
    expect(controller.handle("view_direction_acknowledged")).toBe(true);
    expect(controller.handle("object_selected", { objectId: "chair_01" })).toBe(true);
    expect(controller.handle("object_moved_or_rotated")).toBe(true);
    expect(controller.handle("confidence_chosen")).toBe(true);
    expect(controller.getCurrentStep()).toMatchObject({ id: "save_first", anchor: "confidence" });
    expect(controller.handle("object_deselected")).toBe(true);
    expect(controller.handle("object_selected", { objectId: "table_01" })).toBe(true);
    expect(controller.handle("confidence_chosen")).toBe(true);
    expect(controller.getCurrentStep()).toMatchObject({ id: "save_second", anchor: "confidence" });
    expect(controller.handle("object_deselected")).toBe(true);
    expect(controller.getCurrentStep().id).toBe("submit");
    expect(controller.handle("submitted")).toBe(true);

    expect(controller.isComplete()).toBe(true);
    expect(controller.getCurrentStep().id).toBe("complete");
  });

  it("does not require pause practice before tutorial submission", () => {
    const controller = new TutorialController();
    controller.handle("preview_acknowledged");
    controller.handle("reconstruction_started");
    controller.handle("view_direction_acknowledged");
    controller.handle("object_selected", { objectId: "chair_01" });
    controller.handle("object_moved_or_rotated");
    controller.handle("confidence_chosen");
    controller.handle("object_deselected");
    controller.handle("object_selected", { objectId: "table_01" });
    controller.handle("confidence_chosen");
    controller.handle("object_deselected");

    expect(controller.getCurrentStep()).toMatchObject({ id: "submit" });
    expect(controller.handle("submitted")).toBe(true);
    expect(controller.getCurrentStep().id).toBe("complete");
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
    expect(controller.handle("view_direction_acknowledged")).toBe(true);
    expect(controller.getCurrentStep().id).toBe("select_first");
  });

  it("uses Chinese tutorial guidance when the experiment locale is zh-CN", () => {
    const controller = new TutorialController("persistent", "zh-CN");

    expect(controller.getCurrentStep().message).toContain("透视图");
    controller.handle("reconstruction_started");
    controller.handle("view_direction_acknowledged");
    expect(controller.getCurrentStep().message).toContain("黄色");
    expect(controller.getCurrentStep().message).toContain("页面上方的图片");
    expect(controller.getCurrentStep().message).toContain("移动平面图中的");
    expect(controller.getCurrentStep().message).toContain("与上方透视图中的家具一致");
  });

  it("keeps the operation instructions with the first confidence prompt", () => {
    const controller = new TutorialController();

    controller.handle("preview_acknowledged");
    controller.handle("reconstruction_started");
    controller.handle("view_direction_acknowledged");
    controller.handle("view_direction_acknowledged");
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
    controller.handle("view_direction_acknowledged");
    controller.handle("object_selected", { objectId: "chair_01" });

    expect(controller.getCurrentStep().message).toContain("**Use the arrow buttons to move**");
    expect(controller.getCurrentStep().message).toContain("**the rotate buttons to adjust**");
    expect(controller.getCurrentStep().message).toContain("this does not exit edit mode");

    const selectController = new TutorialController();
    selectController.handle("preview_acknowledged");
    selectController.handle("reconstruction_started");
    expect(selectController.getCurrentStep().anchor).toBe("viewport-tools");
    expect(selectController.getCurrentStep().id).toBe("view_direction");
    expect(selectController.getCurrentStep().message).toContain("at the bottom of the floor plan");
    expect(selectController.getCurrentStep().message).toContain("as shown by the yellow arrow");
    expect(selectController.getCurrentStep().message).toContain("viewing angle will remain unchanged");
    expect(selectController.handle("view_direction_acknowledged")).toBe(true);
    expect(selectController.getCurrentStep().id).toBe("select_first");
    expect(selectController.getCurrentStep().message).toContain("[[yellow]]yellow objects[[/yellow]]");
    expect(selectController.getCurrentStep().message).toContain("**Only yellow objects can be moved.**");
    expect(selectController.getCurrentStep().message).toContain("picture at the top of the page");
    expect(selectController.getCurrentStep().message).toContain("floor plan below");
    expect(selectController.getCurrentStep().message).toContain("match the furniture in the perspective image above");
    expect(selectController.getCurrentStep().message).toContain("upper-right corner");
    expect(selectController.getCurrentStep().message).toContain("zoom in");
    expect(selectController.getCurrentStep().message).toContain("zoom out");
    expect(selectController.getCurrentStep().message).toContain("reset");
    expect(selectController.getCurrentStep().message).toContain("hold **Pan**");
    expect(selectController.getCurrentStep().message).toContain("release **Pan**");
    expect(selectController.getCurrentStep().message).toContain("not furniture positions");
    expect(selectController.getCurrentStep().message).toContain("Right-click");
    expect(selectController.getCurrentStep().message.match(/\[\[block\]\]/g)).toHaveLength(3);
    expect(selectController.getCurrentStep().message.match(/\[\[\/block\]\]/g)).toHaveLength(3);

    const chineseController = new TutorialController("persistent", "zh-CN");
    chineseController.handle("reconstruction_started");
    expect(chineseController.getCurrentStep()).toMatchObject({ anchor: "viewport-tools" });
    expect(chineseController.getCurrentStep().id).toBe("view_direction");
    expect(chineseController.getCurrentStep().message).toContain("平面图的最下方");
    expect(chineseController.getCurrentStep().message).toContain("您正在注视的方向如黄色箭头所示");
    expect(chineseController.getCurrentStep().message).toContain("这个观察视角都不会改变");
    chineseController.handle("view_direction_acknowledged");
    expect(chineseController.getCurrentStep().message).toContain("右上角");
    expect(chineseController.getCurrentStep().message).toContain("放大");
    expect(chineseController.getCurrentStep().message).toContain("缩小");
    expect(chineseController.getCurrentStep().message).toContain("重置");
    expect(chineseController.getCurrentStep().message).toContain("按住");
    expect(chineseController.getCurrentStep().message).toContain("松开");
    expect(chineseController.getCurrentStep().message).toContain("家具位置");
  });
});
