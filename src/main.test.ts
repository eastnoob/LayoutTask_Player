import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("experiment bootstrap consent ordering", () => {
  it("passes the accepted consent record into the runnable experiment", () => {
    const source = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

    expect(source).toContain("const consentResult = await waitForExperimentConsent");
    expect(source).toContain('consentResult.mode === "developer"');
    expect(source).toContain("consent: consentResult.consent");
    expect(source).toContain("const participantProfile = await waitForParticipantProfile");
    expect(source).toContain("participantProfile");
  });
});
