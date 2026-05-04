import { describe, expect, it } from "vitest";
import { normalizeRotation } from "./geometry";

describe("normalizeRotation", () => {
  it("normalizes values above 360", () => {
    expect(normalizeRotation(405)).toBe(45);
  });

  it("normalizes negative values", () => {
    expect(normalizeRotation(-45)).toBe(315);
  });
});
