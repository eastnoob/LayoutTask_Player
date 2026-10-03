import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { KONAMI_CODE, getKonamiProgress, parseProlificIdInput } from "./experiment-consent";

describe("experiment consent", () => {
  it("recognizes the Konami sequence without treating partial input as developer mode", () => {
    expect(getKonamiProgress([], "ArrowUp")).toEqual(["ArrowUp"]);
    expect(getKonamiProgress(["ArrowUp"], "ArrowUp")).toEqual(["ArrowUp", "ArrowUp"]);
    expect(getKonamiProgress(KONAMI_CODE.slice(0, -1), KONAMI_CODE.at(-1)!)).toEqual(KONAMI_CODE);
    expect(getKonamiProgress(KONAMI_CODE.slice(0, -1), "A")).toEqual(KONAMI_CODE);
  });

  it("resets progress when a key breaks the sequence", () => {
    expect(getKonamiProgress(["ArrowUp", "ArrowUp"], "x")).toEqual([]);
  });

  it("requires an explicit confirmation after the developer sequence", () => {
    const source = readFileSync(new URL("./experiment-consent.ts", import.meta.url), "utf8");

    expect(source).toContain("进入开发者模式");
    expect(source).toContain("继续开发者模式");
    expect(source).toContain("取消");
  });

  it("rejects blank Prolific IDs while preserving the entered non-empty string", () => {
    expect(parseProlificIdInput("   ")).toBeUndefined();
    expect(parseProlificIdInput(" 5f2a-original ")).toBe(" 5f2a-original ");
  });
});
