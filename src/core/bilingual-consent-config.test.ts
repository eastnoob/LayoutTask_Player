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
    const english = getConsentPageCopy("en-US").fullDocumentHtml;
    const chinese = getConsentPageCopy("zh-CN").fullDocumentHtml;

    expect(english).toContain("20–40 minutes");
    expect(english).toContain("£4 base payment");
    expect(english).toContain("Each correctly reconstructed position or rotation earns an additional");
    expect(english).toContain("£0.04");
    expect(english).toContain("approximately");
    expect(english).toContain("€7 (about £6)");
    expect(chinese).toContain("20–40 分钟");
    expect(chinese).toContain("£4 基础奖金");
    expect(chinese).toContain("每个正确的位置或旋转答案均可获得额外");
    expect(chinese).toContain("£0.04");
    expect(chinese).toContain("预计总报酬约为");
    expect(chinese).toContain("€7（约 £6）");
  });
});
