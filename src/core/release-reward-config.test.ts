import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const experimentDir = join(process.cwd(), "public", "experiment");

describe("release reward configuration", () => {
  it("uses the approved GBP4 base plus GBP0.04 per correct component", () => {
    const configs = readdirSync(experimentDir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(readFileSync(join(experimentDir, name), "utf8")) as { reward?: Record<string, unknown> });
    const rewardConfigs = configs.filter((config) => config.reward);

    expect(rewardConfigs.length).toBeGreaterThan(0);
    for (const config of rewardConfigs) {
      expect(config.reward).toMatchObject({
        enabled: true,
        base_reward_cents: 400,
        movement_reward_cents: 4,
        rotation_reward_cents: 4,
      });
    }
  });
});
