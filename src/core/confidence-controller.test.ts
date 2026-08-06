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

  it("clears active confidence when entering a group edit", () => {
    const controller = new ConfidenceController({
      config: configWithGroups(),
      required: true,
      scale: [1, 2, 3, 4, 5],
    });

    controller.enterObjectEdit("chair_seat");
    controller.choose(4);
    expect(controller.canLeaveActiveGroup()).toEqual({ ok: true });
    controller.enterObjectEdit("chair_seat");

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

    controller.choose(5);

    expect(controller.canEnterObjectEdit("table_top")).toEqual({ ok: true });
  });

  it("stores final confidence by group id", () => {
    const controller = new ConfidenceController({
      config: configWithGroups(),
      required: true,
      scale: [1, 2, 3, 4, 5],
    });

    controller.enterObjectEdit("chair_seat");
    controller.choose(3);
    controller.leaveActiveGroup();
    controller.enterObjectEdit("table_top");
    controller.choose(2);

    expect(controller.getFinalConfidence()).toEqual({
      chair_group: 3,
      table_group: 2,
    });
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
    controller.choose(1);

    expect(controller.getFinalConfidence()).toEqual({ solo: 1 });
  });
});
