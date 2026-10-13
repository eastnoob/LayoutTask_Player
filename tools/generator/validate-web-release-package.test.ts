import { cp, mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTutorialPackageLock } from "../../src/core/tutorial-package-lock";
import { describe, expect, it } from "vitest";
import { validateWebReleasePackage } from "./validate-web-release-package";

async function packageFixture(): Promise<string> {
  const base = join(process.cwd(), ".tmp", "validate-web-release-package");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "closure-"));
  const formal = join(root, "layout-task-run12-core23-persistent");
  const tutorial = join(formal, "tutorial");
  const json = async (file: string, value: unknown) => {
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, JSON.stringify(value));
  };
  await mkdir(join(root, "experiment"));
  await writeFile(join(root, "index.html"), '<meta http-equiv="refresh" content="0;url=/experiment/">');
  await writeFile(join(root, "experiment/index.html"), "<html></html>");
  await cp(join(process.cwd(), "public/experiment/layout-task/assets/icons"), join(root, "experiment/layout-task/assets/icons"), { recursive: true });
  const config = {
    schema: "layouttask.experiment.v1", baseUrl: "../layout-task-run12-core23-persistent/",
    schedule_path: "../layout-task-run12-core23-persistent/schedule.json",
    reward: { reference_path: "../layout-task-run12-core23-persistent/scoring/scoring-reference.json" },
    data_save: { mode: "receiver", endpoint: "https://receiver.invalid/submit" },
    tutorial: {
      enabled: true, baseUrl: "../layout-task-run12-core23-persistent/tutorial/",
      referenceBoard: { items: [{ allSvg: "assets/object.svg", variableSvg: "assets/object.svg", allAnimation: "assets/board.gif", variableAnimation: "assets/board.gif" }] },
    },
  };
  for (const name of ["experiment", "experiment-zh", "experiment-en", "experiment-debug-zh", "experiment-debug-en"]) {
    await json(join(root, `experiment/${name}.json`), config);
  }
  for (const [dir, id] of [[formal, "formal"], [tutorial, "tutorial"]]) {
    await json(join(dir, "manifest.json"), {
      schema: "layouttask.manifest.v1", experiment_id: "fixture", asset_library: "assets/objects.json",
      background_library: "assets/backgrounds.json", behavior_library: "behaviors/behaviors.json",
      tasks: [{ task_id: id, qid: id, file: `tasks/${id}.json` }],
    });
    await json(join(dir, "assets/objects.json"), { schema: "layouttask.assets.objects.v1", objects: {
      furniture: { type: "svg", src: "assets/object.svg", default_width: 10, default_height: 10 },
    } });
    await json(join(dir, "assets/backgrounds.json"), { schema: "layouttask.assets.backgrounds.v1", backgrounds: { room: { type: "svg", src: "assets/object.svg" } } });
    await json(join(dir, "behaviors/behaviors.json"), { schema: "layouttask.behaviors.v1", behaviors: {} });
    await json(join(dir, `tasks/${id}.json`), {
      schema: "layouttask.task.v1", task_id: id, qid: id,
      world: { unit: "mm", viewBox: { x: 0, y: 0, width: 100, height: 100 }, origin: { x: 0, y: 0 }, grid: { size: 10, visible: true, snap: true } },
      background: { asset: "room", x: 0, y: 0, width: 100, height: 100 },
      objects: [{ id: "chair", asset: "furniture", role: "variable", x: 50, y: 50, behavior: { config: { movement: { mode: "none" }, free_drag: { enabled: false } } } }],
      display_image: { src: "assets/photo.jpeg", enabled: true },
    });
    await json(join(dir, "scoring/scoring-reference.json"), { tasks: {} });
    await writeFile(join(dir, "assets/object.svg"), '<svg viewBox="0 0 100 100"/>');
    await writeFile(join(dir, "assets/photo.jpeg"), "fixture image bytes");
    await writeFile(join(dir, "assets/board.gif"), "fixture animation bytes");
  }
  await json(join(formal, "schedule.json"), {});
  await json(join(tutorial, "tutorial-package.lock.json"), createTutorialPackageLock({ root: tutorial, taskId: "tutorial", qid: "tutorial", packageVersion: "fixture-v1", sourceGeneration: "fixture" }));
  return root;
}

describe("validateWebReleasePackage", () => {
  it("accepts a closed package using the existing runtime and tutorial validators", async () => {
    const report = await validateWebReleasePackage({ distDir: await packageFixture() });
    expect(report).toEqual({ ok: true, failures: [] });
  });

  it.each([
    "assets/photo.jpeg", "assets/object.svg", "assets/objects.json", "behaviors/behaviors.json",
    "schedule.json", "scoring/scoring-reference.json", "tutorial/assets/board.gif", "tutorial/assets/photo.jpeg",
  ])("rejects a missing referenced file: %s", async (file) => {
    const root = await packageFixture();
    await unlink(join(root, "layout-task-run12-core23-persistent", file));
    const report = await validateWebReleasePackage({ distDir: root });
    expect(report.ok).toBe(false);
    expect(report.failures.join("\n")).toContain(file);
  });

  it.each(["../../../outside.png", "https://cdn.invalid/object.svg", "%2e%2e/%2e%2e/outside.png"])("rejects an out-of-package asset: %s", async (src) => {
    const root = await packageFixture();
    const file = join(root, "layout-task-run12-core23-persistent/tasks/formal.json");
    const task = JSON.parse(await readFile(file, "utf8"));
    task.display_image.src = src;
    await writeFile(file, JSON.stringify(task));
    const report = await validateWebReleasePackage({ distDir: root });
    expect(report.ok).toBe(false);
    expect(report.failures.join("\n")).toContain("outside package");
  });

  it("reports invalid referenced JSON rather than silently skipping it", async () => {
    const root = await packageFixture();
    await writeFile(join(root, "layout-task-run12-core23-persistent/schedule.json"), "{");
    const report = await validateWebReleasePackage({ distDir: root });
    expect(report.failures.join("\n")).toContain("invalid JSON: layout-task-run12-core23-persistent/schedule.json");
  });

  it("rejects tutorial-lock hash drift even when every file exists", async () => {
    const root = await packageFixture();
    await writeFile(join(root, "layout-task-run12-core23-persistent/tutorial/assets/board.gif"), "changed bytes");
    const report = await validateWebReleasePackage({ distDir: root });
    expect(report.ok).toBe(false);
    expect(report.failures.join("\n")).toContain("sha256 changed: assets/board.gif");
  });

  it("rejects a package without the current experiment entry and persistent tutorial copy", async ({ task }) => {
    const root = join(process.cwd(), ".tmp", "validate-web-release-package", task.id);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "index.html"), "<html>legacy standalone</html>\n", "utf8");

    const report = await validateWebReleasePackage({ distDir: root });

    expect(report.ok).toBe(false);
    expect(report.failures).toContain("index.html must redirect to /experiment/");
    expect(report.failures).toContain("experiment/experiment.json");
    expect(report.failures).toContain("layout-task-run12-core23-persistent/manifest.json");
    expect(report.failures).toContain("layout-task-run12-core23-persistent/tutorial/manifest.json");
  });

  it("rejects unrelated top-level packages that inflate the deployment checkout", async ({ task }) => {
    const root = join(process.cwd(), ".tmp", "validate-web-release-package", task.id);
    await mkdir(join(root, "layout-task-generated-first5-svg-only"), { recursive: true });

    const report = await validateWebReleasePackage({ distDir: root });

    expect(report.failures).toContain("unexpected top-level path: layout-task-generated-first5-svg-only");
  });

  it("requires all player control and hint icons at the experiment-relative URL", async ({ task }) => {
    const base = join(process.cwd(), ".tmp", "validate-web-release-package");
    await mkdir(base, { recursive: true });
    const root = await mkdtemp(join(base, `${task.id}-`));
    const iconDir = join(root, "experiment", "layout-task", "assets", "icons");
    const icons = [
      "arrow-up.svg", "arrow-down.svg", "arrow-left.svg", "arrow-right.svg",
      "rotate-ccw.svg", "rotate-cw.svg", "move.svg", "info.svg", "hand.svg", "alert-circle.svg",
    ];
    const missing = await validateWebReleasePackage({ distDir: root });
    for (const icon of icons) {
      expect(missing.failures).toContain(`experiment/layout-task/assets/icons/${icon}`);
    }

    await mkdir(iconDir, { recursive: true });
    for (const icon of icons) {
      await writeFile(join(iconDir, icon), '<svg xmlns="http://www.w3.org/2000/svg"/>', "utf8");
    }
    const present = await validateWebReleasePackage({ distDir: root });
    expect(present.failures.filter((failure) => failure.includes("assets/icons/"))).toEqual([]);

    await unlink(join(iconDir, "rotate-cw.svg"));
    const incomplete = await validateWebReleasePackage({ distDir: root });
    expect(incomplete.ok).toBe(false);
    expect(incomplete.failures.filter((failure) => failure.includes("assets/icons/"))).toEqual([
      "experiment/layout-task/assets/icons/rotate-cw.svg",
    ]);

    await mkdir(join(iconDir, "rotate-cw.svg"));
    const wrongType = await validateWebReleasePackage({ distDir: root });
    expect(wrongType.failures).toContain("experiment/layout-task/assets/icons/rotate-cw.svg");
  });
});
