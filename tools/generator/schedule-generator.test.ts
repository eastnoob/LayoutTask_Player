import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateWilliamsBaseSequences } from "../../src/core/schedule-generator";

describe("R12 schedule inputs", () => {
  it("derives the base schedule from the compiled package manifest", async () => {
    const manifest = JSON.parse(await readFile(
      join(process.cwd(), "public/layout-task-run12-core23-persistent/manifest.json"),
      "utf8",
    )) as { tasks: Array<{ task_id: string }> };
    const schedule = generateWilliamsBaseSequences(manifest.tasks.map((task) => task.task_id), {
      tutorialTaskId: "scene_edc634ac7856",
    });

    expect(schedule.uniqueSceneCount).toBe(23);
    expect(schedule.baseSequenceCount).toBe(46);
  });
});
