import { describe, expect, it } from "vitest";
import { DEFAULT_MESSAGES } from "./messages";

describe("default task instructions", () => {
  it("explains the top reference picture, both confidence ratings, and the cautious no-information path", () => {
    expect(DEFAULT_MESSAGES.instruction_edit_mode).toContain("picture is shown at the top of the page");
    expect(DEFAULT_MESSAGES.instruction_edit_mode).toContain("position and rotation");
    expect(DEFAULT_MESSAGES.reconstruction_hint_no_information).toContain("without changing its position or rotation");
    expect(DEFAULT_MESSAGES.reconstruction_hint_no_information).toContain("Use this option sparingly");
  });
});
