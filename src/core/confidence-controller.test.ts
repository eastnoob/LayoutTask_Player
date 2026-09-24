import { describe, expect, it } from "vitest";
import { createRuntimeConfig } from "../test-support/runtime-config";
import { ConfidenceController } from "./confidence-controller";

function configWithGroups() {
  const config = createRuntimeConfig();
  config.objects = [
    { ...config.objects[0], id: "chair_seat", role: "variable", group_id: "chair_group" },
    { ...config.objects[0], id: "chair_back", role: "fixed", group_id: "chair_group" },
    { ...config.objects[0], id: "table_top", role: "variable", group_id: "table_group" },
    { ...config.objects[0], id: "rug", role: "fixed", group_id: "rug_group" },
  ];
  return config;
}

describe("ConfidenceController", () => {
  it("requires confidence only for groups containing variable objects", () => {
    const controller = new ConfidenceController({
      config: configWithGroups(),
      required: true,
      scale: [1, 2, 3, 4, 5],
    });

    expect(controller.getRequiredGroupIds()).toEqual(["chair_group", "table_group"]);
    expect(controller.canSubmit()).toEqual({ ok: true });
  });

  it("does not require confidence before any group is edited", () => {
    const controller = new ConfidenceController({
      config: configWithGroups(),
      required: true,
      scale: [1, 2, 3, 4, 5],
    });

    expect(controller.canSubmit()).toEqual({ ok: true });
  });

  it("keeps a chosen confidence pending until the active group is saved", () => {
    const controller = new ConfidenceController({
      config: configWithGroups(),
      required: true,
      scale: [1, 2, 3, 4, 5],
    });

    controller.enterObjectEdit("chair_seat");
    controller.choose("position", 4);
    controller.choose("rotation", 3);

    expect(controller.getFinalConfidence()).toEqual({});
    expect(controller.canSubmit()).toEqual({
      ok: false,
      reason: "confidence_save_required",
      groupId: "chair_group",
    });

    expect(controller.saveActiveGroup()).toEqual({ ok: true });
    expect(controller.getFinalConfidence()).toEqual({ chair_group: { position: 4, rotation: 3 } });
    expect(controller.canSubmit()).toEqual({ ok: true });
  });

  it("requires both position and rotation confidence before saving", () => {
    const controller = new ConfidenceController({
      config: configWithGroups(),
      required: true,
      scale: [1, 2, 3, 4, 5],
    });

    controller.enterObjectEdit("chair_seat");
    controller.choose("position", 4);

    expect(controller.saveActiveGroup()).toEqual({
      ok: false,
      reason: "confidence_required",
      groupId: "chair_group",
    });
    expect(controller.canLeaveActiveGroup()).toEqual({
      ok: false,
      reason: "confidence_required",
      groupId: "chair_group",
    });
  });

  it("blocks switching groups until active confidence is chosen", () => {
    const controller = new ConfidenceController({
      config: configWithGroups(),
      required: true,
      scale: [1, 2, 3, 4, 5],
    });

    controller.enterObjectEdit("chair_seat");

    expect(controller.canEnterObjectEdit("table_top")).toEqual({
      ok: false,
      reason: "confidence_required",
      groupId: "chair_group",
    });

    controller.choose("position", 5);
    controller.choose("rotation", 4);

    expect(controller.canEnterObjectEdit("table_top")).toEqual({
      ok: false,
      reason: "confidence_save_required",
      groupId: "chair_group",
    });

    controller.saveActiveGroup();

    expect(controller.canEnterObjectEdit("table_top")).toEqual({ ok: true });
  });

  it("stores final confidence by group id", () => {
    const controller = new ConfidenceController({
      config: configWithGroups(),
      required: true,
      scale: [1, 2, 3, 4, 5],
    });

    controller.enterObjectEdit("chair_seat");
    controller.choose("position", 3);
    controller.choose("rotation", 2);
    controller.saveActiveGroup();
    controller.enterObjectEdit("table_top");
    controller.choose("position", 2);
    controller.choose("rotation", 1);
    controller.saveActiveGroup();

    expect(controller.getFinalConfidence()).toEqual({
      chair_group: { position: 3, rotation: 2 },
      table_group: { position: 2, rotation: 1 },
    });
    expect(controller.canSubmit()).toEqual({ ok: true });
  });

  it("allows tutorial submit after the practiced group is rated", () => {
    const controller = new ConfidenceController({
      config: configWithGroups(),
      required: true,
      scale: [1, 2, 3, 4, 5],
      requireAllGroupsOnSubmit: false,
    });

    controller.enterObjectEdit("chair_seat");
    controller.choose("position", 4);
    controller.choose("rotation", 4);
    controller.saveActiveGroup();

    expect(controller.canSubmit()).toEqual({ ok: true });
  });

  it("falls back to object id when group_id is absent", () => {
    const config = createRuntimeConfig();
    config.objects = [{ ...config.objects[0], id: "solo", role: "variable", group_id: undefined }];
    const controller = new ConfidenceController({
      config,
      required: true,
      scale: [1, 2, 3, 4, 5],
    });

    controller.enterObjectEdit("solo");
    controller.choose("position", 1);
    controller.choose("rotation", 1);
    controller.saveActiveGroup();

    expect(controller.getFinalConfidence()).toEqual({ solo: { position: 1, rotation: 1 } });
  });

  it("refuses to save an active group before a confidence is chosen", () => {
    const controller = new ConfidenceController({
      config: configWithGroups(),
      required: true,
      scale: [1, 2, 3, 4, 5],
    });

    controller.enterObjectEdit("chair_seat");

    expect(controller.saveActiveGroup()).toEqual({
      ok: false,
      reason: "confidence_required",
      groupId: "chair_group",
    });
    expect(controller.getFinalConfidence()).toEqual({});
  });

  it("stores a chosen rating when confidence is optional", () => {
    const controller = new ConfidenceController({
      config: configWithGroups(),
      required: false,
      scale: [1, 2, 3, 4, 5],
    });

    controller.enterObjectEdit("chair_seat");
    controller.choose("position", 4);
    controller.choose("rotation", 4);
    controller.saveActiveGroup();

    expect(controller.getFinalConfidence()).toEqual({ chair_group: { position: 4, rotation: 4 } });
  });
});
