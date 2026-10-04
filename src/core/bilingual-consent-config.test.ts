import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getConsentPageCopy } from "./experiment-consent";

function readConfig(name: string): Record<string, any> {
  return JSON.parse(readFileSync(new URL(`../../public/experiment/${name}`, import.meta.url), "utf8")) as Record<string, any>;
}

describe("bilingual consent configuration", () => {
  it("declares the intended locale and reward contract in both release configs", () => {
    const english = readConfig("experiment-en.json");
    const chinese = readConfig("experiment-zh.json");

    expect(english.locale).toBe("en-US");
    expect(chinese.locale).toBe("zh-CN");
    for (const config of [english, chinese]) {
      expect(config.reward).toMatchObject({
        base_reward_cents: 400,
        movement_reward_cents: 4,
        rotation_reward_cents: 4,
      });
    }
  });

  it("keeps the current study duration and compensation in both consent copies", () => {
    expect(getConsentPageCopy("en-US").fullDocumentHtml).toContain("20–40 minutes");
    expect(getConsentPageCopy("en-US").fullDocumentHtml).toContain("£4");
    expect(getConsentPageCopy("zh-CN").fullDocumentHtml).toContain("20–40 分钟");
    expect(getConsentPageCopy("zh-CN").fullDocumentHtml).toContain("£4");
  });
});
