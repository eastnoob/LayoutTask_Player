import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateExperimentPackage } from "./validate-experiment-package";

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createBase(root: string, taskOverride: Record<string, unknown> = {}) {
  await writeJson(join(root, "experiment.json"), {
    schema: "layouttask.experiment.v1",
    experiment_id: "layout_task_v1",
    baseUrl: "./layout-task/",
    order: "fixed",
    tutorial: { enabled: true, taskId: "tutorial_room", qid: "QTUTORIAL" },
    trials: [{ taskId: "scene_001", qid: "Q001" }],
  });
  await writeJson(join(root, "layout-task", "manifest.json"), {
    schema: "layouttask.manifest.v1",
    experiment_id: "layout_task_v1",
    asset_library: "assets/objects.json",
    background_library: "assets/backgrounds.json",
    behavior_library: "behaviors/behaviors.json",
    tasks: [
      { task_id: "tutorial_room", qid: "QTUTORIAL", file: "tasks/tutorial_room.json" },
      { task_id: "scene_001", qid: "Q001", file: "tasks/scene_001.json" },
    ],
  });
  await writeJson(join(root, "layout-task", "tasks", "tutorial_room.json"), {
    schema: "layouttask.task.v1",
    task_id: "tutorial_room",
    qid: "QTUTORIAL",
    flow: { mode: "preview_then_reconstruct" },
    display_image: { enabled: true, src: "assets/display/tutorial.png" },
  });
  await writeJson(join(root, "layout-task", "tasks", "scene_001.json"), {
    schema: "layouttask.task.v1",
    task_id: "scene_001",
    qid: "Q001",
    flow: { mode: "preview_then_reconstruct" },
    display_image: { enabled: true, src: "assets/display/scene_001.png" },
    ...taskOverride,
  });
}

describe("validateExperimentPackage", () => {
  it("passes when tutorial and formal preview trials are present", async ({ task }) => {
    const root = join(process.cwd(), ".tmp", "validate-experiment-package", task.id);
    await createBase(root);

    const report = await validateExperimentPackage({ baseDir: root, skipRuntimePreflight: true });

    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);
  });

  it("fails when a formal trial is not preview_then_reconstruct", async ({ task }) => {
    const root = join(process.cwd(), ".tmp", "validate-experiment-package", task.id);
    await createBase(root, { flow: { mode: "direct_reconstruction" } });

    const report = await validateExperimentPackage({ baseDir: root, skipRuntimePreflight: true });

    expect(report.ok).toBe(false);
    expect(report.failures).toContainEqual({
      type: "formal_trial_flow",
      taskId: "scene_001",
      message: "Formal trial scene_001 must use flow.mode preview_then_reconstruct",
    });
  });
});
