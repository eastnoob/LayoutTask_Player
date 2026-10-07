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

  it("keeps the PDF study duration and current compensation in both consent copies", () => {
    const english = getConsentPageCopy("en-US").fullDocumentHtml;
    const chinese = getConsentPageCopy("zh-CN").fullDocumentHtml;

    expect(english).toContain("20-45 minutes");
    expect(english).toContain("£4 base payment");
    expect(english).toContain("Each correctly reconstructed position or rotation earns an additional");
    expect(english).toContain("£0.04");
    expect(english).toContain("approximately");
    expect(english).toContain("£12 in total");
    expect(chinese).toContain("20-45 分钟");
    expect(chinese).toContain("£4 基础奖金");
    expect(chinese).toContain("每个正确的位置或旋转答案均可获得额外");
    expect(chinese).toContain("£0.04");
    expect(chinese).toContain("£12");
  });

  it("keeps the consent and data-protection documents aligned with the supplied PDFs", () => {
    const english = getConsentPageCopy("en-US");
    const chinese = getConsentPageCopy("zh-CN");

    expect(english.fullDocumentHtml).toContain("This study is expected to take approximately <strong>20-45 minutes</strong>");
    expect(english.fullDocumentHtml).not.toContain("typically no more than around 30 minutes");
    expect(english.fullDocumentHtml).toContain("One week after the completion of the study it might no longer be possible to retract your data");
    expect(english.fullDocumentHtml).toContain("(1) first and last name");
    expect(english.fullDocumentHtml).not.toContain("Full name:");
    expect(english.fullDocumentHtml).toContain("With your signature, you indicate confirmation of the following:");
    expect(english.confirmations).toEqual([
      "I confirm I volunteered to participate in this study.",
      "I confirm I was allowed to ask questions and that I was provided with responses.",
      "I confirm I was presented with this document prior to the beginning of the study.",
      "I confirm and I understood my right to quit the study at any time.",
      "I have read the data protection statement for Spatial Perception of Furniture Position and Orientation from a Single Indoor Photograph and hereby voluntarily consent to having my personal data collected and processed as described in the statement. I have been informed of the right to withdraw my consent at any time without giving reasons.",
    ]);
    expect(english.fullDocumentHtml).not.toContain("There may be no direct personal benefit from taking part");

    expect(chinese.fullDocumentHtml).toContain("本研究预计需要约 <strong>20-45 分钟</strong>");
    expect(chinese.fullDocumentHtml).not.toContain("通常不超过约 30 分钟");
    expect(chinese.fullDocumentHtml).toContain("研究完成一周后，您可能无法再从此类汇总分析中撤回您的数据");
    expect(chinese.fullDocumentHtml).toContain("（1）姓名");
    expect(chinese.fullDocumentHtml).not.toContain("姓名：");
    expect(chinese.fullDocumentHtml).toContain("您签名即表示确认以下内容");
    expect(chinese.confirmations).toEqual([
      "我确认自己自愿参加本研究。",
      "我确认自己有机会提问，并且已获得相应答复。",
      "我确认自己在研究开始前已看到本文件。",
      "我确认自己理解可以随时退出本研究。",
      "我已阅读《根据单张室内照片感知家具的位置与朝向》项目的数据保护声明，并自愿同意收集和处理我的个人数据。我已获知随时撤回同意且无需说明理由的权利。",
    ]);
  });

  it("describes the current image-above-floor-plan workflow in both consent copies", () => {
    const english = getConsentPageCopy("en-US").fullDocumentHtml;
    const chinese = getConsentPageCopy("zh-CN").fullDocumentHtml;

    expect(english).toContain("at the top of the page");
    expect(english).toContain("floor plan below");
    expect(english.toLowerCase()).toContain("open every yellow furniture object once");
    expect(english).toContain("Save");
    expect(english).not.toContain("pause once for up to 15 minutes");
    expect(chinese).toContain("页面顶部");
    expect(chinese).toContain("平面图显示在下方");
    expect(chinese).toContain("每个黄色家具物体都必须打开一次");
    expect(chinese).toContain("保存");
    expect(chinese).not.toContain("暂停一次，最长 15 分钟");
  });
});
