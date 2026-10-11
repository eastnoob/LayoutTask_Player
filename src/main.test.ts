import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("experiment bootstrap pre-study flow", () => {
  it("keeps consent, age, eyewear, and participant identity in the experiment bootstrap", () => {
    const source = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

    expect(source).toContain("waitForParticipantProfile");
    expect(source).toContain("waitForProlificId");
    expect(source).toContain("consent: consentResult.consent");
    expect(source).toContain("participantProfile");
    expect(source).toContain("prolificId");
  });
});
