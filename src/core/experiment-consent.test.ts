import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  KONAMI_CODE,
  createConsentRecord,
  getConsentPageCopy,
  getKonamiProgress,
  isConsentComplete,
  parseProlificIdInput,
} from "./experiment-consent";

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

  it("creates a signed consent record with all required confirmations", () => {
    expect(createConsentRecord({
      locale: "en-US",
      mode: "agreed",
      consentedAt: "2026-10-03T12:00:00.000Z",
    })).toEqual({
      consent_version: "informed-consent-2026-10-03-v1",
      notice_version: "data-protection-2026-10-03-v1",
      locale: "en-US",
      consented_at: "2026-10-03T12:00:00.000Z",
      signature_method: "checkbox_confirmation",
      voluntary_participation_confirmed: true,
      questions_answered_confirmed: true,
      prestudy_document_confirmed: true,
      withdrawal_right_understood_confirmed: true,
      data_protection_statement_confirmed: true,
      developer_mode: false,
    });
  });

  it("marks developer consent without changing the confirmation contract", () => {
    expect(createConsentRecord({
      locale: "zh-CN",
      mode: "developer",
      consentedAt: "2026-10-03T12:00:00.000Z",
    }).developer_mode).toBe(true);
  });

  it("requires all five consent confirmations", () => {
    expect(isConsentComplete([true, true, true, true, false])).toBe(false);
    expect(isConsentComplete([true, true, true, true, true])).toBe(true);
  });

  it("keeps the four consent statements equivalent in English and Chinese", () => {
    const english = getConsentPageCopy("en-US");
    const chinese = getConsentPageCopy("zh-CN");

    expect(english.confirmations).toHaveLength(5);
    expect(chinese.confirmations).toHaveLength(5);
    expect(english.confirmations.join(" ")).toContain("volunteered to participate");
    expect(english.confirmations.join(" ")).toContain("allowed to ask questions");
    expect(english.confirmations.join(" ")).toContain("presented with this document");
    expect(english.confirmations.join(" ")).toContain("right to quit");
    expect(chinese.confirmations.join(" ")).toContain("自愿参加");
    expect(chinese.confirmations.join(" ")).toContain("提问");
    expect(chinese.confirmations.join(" ")).toContain("研究开始前");
    expect(chinese.confirmations.join(" ")).toContain("随时退出");
    expect(english.signatureNotice).toContain("electronic confirmation");
    expect(chinese.signatureNotice).toContain("电子确认");
  });

  it("provides the complete consent and data-protection document for both locales", () => {
    const english = getConsentPageCopy("en-US");
    const chinese = getConsentPageCopy("zh-CN");

    expect(english.confirmations).toHaveLength(5);
    expect(chinese.confirmations).toHaveLength(5);
    expect(english.fullDocumentHtml).toContain("Potential risks");
    expect(english.fullDocumentHtml).toContain("Data Protection Officer");
    expect(english.fullDocumentHtml).toContain("£4 base payment");
    expect(english.fullDocumentHtml).toContain("20 minutes");
    expect(english.fullDocumentHtml).not.toContain("Consent confirmations");
    expect(english.fullDocumentHtml).not.toContain("Signature of researcher");
    expect(english.fullDocumentHtml).not.toContain("Email address (optional)");
    expect(english.fullDocumentHtml).not.toContain("Full name:");
    expect(english.fullDocumentHtml).not.toContain("Date of birth:</strong> _");
    expect(english.fullDocumentHtml).not.toContain("City, Date:");
    expect(english.fullDocumentHtml).not.toContain("consenting party");
    expect(chinese.fullDocumentHtml).toContain("潜在风险");
    expect(chinese.fullDocumentHtml).toContain("数据保护官");
    expect(chinese.fullDocumentHtml).toContain("£4 基础奖金");
    expect(chinese.fullDocumentHtml).toContain("20 分钟");
    expect(chinese.fullDocumentHtml).not.toContain("同意确认");
    expect(chinese.fullDocumentHtml).not.toContain("研究人员签名");
    expect(chinese.fullDocumentHtml).not.toContain("电子邮箱（可选）");
    expect(chinese.fullDocumentHtml).not.toContain("<strong>姓名：</strong> _");
    expect(chinese.fullDocumentHtml).not.toContain("地点、日期");
    expect(chinese.fullDocumentHtml).not.toContain("（同意方）");
    expect(english.signatureNotice).toContain("both documents");
    expect(english.signatureNotice).toContain("electronic signature");
    expect(chinese.signatureNotice).toContain("两份文件");
    expect(chinese.signatureNotice).toContain("电子签署");
    expect(readFileSync(new URL("../styles/layout-task.css", import.meta.url), "utf8"))
      .toContain(".layout-task-consent-document");
  });
});
