import { describe, expect, it } from "vitest";
import { behaviorSchema } from "./config.schema";

describe("behaviorSchema", () => {
  it("requires movement.mode drag to match free_drag.enabled", () => {
    // Drag authoring must be explicit in both places.
    // 这样研究者配置错时会尽早失败，而不是运行时表现得像坏掉了。
    expect(() =>
      behaviorSchema.parse({
        movement: { mode: "drag", step: 25 },
        free_drag: { enabled: false },
      }),
    ).toThrow("free_drag.enabled must match movement.mode='drag'");

    expect(() =>
      behaviorSchema.parse({
        movement: { mode: "button", step: 25 },
        free_drag: { enabled: true },
      }),
    ).toThrow("free_drag.enabled must match movement.mode='drag'");
  });
});
