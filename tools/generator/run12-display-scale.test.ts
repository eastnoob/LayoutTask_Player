import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const batchPath = path.join(repoRoot, "assets/generated-experiments/run_12_core_23/source/batch.json");

function readStageRatios(packageName: string): number[] {
  const tasksDir = path.join(repoRoot, `public/${packageName}/tasks`);
  return readdirSync(tasksDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const task = JSON.parse(readFileSync(path.join(tasksDir, name), "utf8")) as {
        stage?: { max_height_ratio?: number };
      };
      return task.stage?.max_height_ratio ?? 0;
    });
}

describe("run 12 display scale", () => {
  it("uses the enlarged stage height for every generated scene", () => {
    const batch = JSON.parse(readFileSync(batchPath, "utf8")) as {
      shared?: { stage?: { max_height_ratio?: number } };
      trials?: unknown[];
    };

    expect(batch.trials).toHaveLength(23);
    expect(batch.shared?.stage?.max_height_ratio).toBe(0.88);
    expect(readStageRatios("layout-task-run12-core23-preview")).toHaveLength(23);
    expect(readStageRatios("layout-task-run12-core23-preview").every((ratio) => ratio === 0.88)).toBe(true);
    expect(readStageRatios("layout-task-run12-core23-compiled")).toHaveLength(23);
    expect(readStageRatios("layout-task-run12-core23-compiled").every((ratio) => ratio === 0.88)).toBe(true);
  });
});
