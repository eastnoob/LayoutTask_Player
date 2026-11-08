import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copyWebReleaseAssets } from "./copy-web-release-assets";

describe("copyWebReleaseAssets", () => {
  it("copies experiment configs, player icons and the current persistent package", async ({ task }) => {
    const root = join(process.cwd(), ".tmp", "copy-web-release-assets", task.id);
    const publicDir = join(root, "public");
    const distDir = join(root, "dist");
    await mkdir(join(publicDir, "experiment"), { recursive: true });
    await mkdir(join(publicDir, "experiment", "layout-task", "assets", "icons"), { recursive: true });
    await mkdir(join(publicDir, "layout-task-run12-core23-persistent", "tasks"), { recursive: true });
    await mkdir(join(publicDir, "layout-task-generated-first5-svg-only"), { recursive: true });
    await mkdir(join(distDir, "assets"), { recursive: true });
    await writeFile(join(publicDir, "experiment", "experiment.json"), JSON.stringify({ baseUrl: "../layout-task-run12-core23-persistent/" }), "utf8");
    await writeFile(join(publicDir, "experiment", "README.md"), "not a runtime asset", "utf8");
    await writeFile(join(publicDir, "experiment", "layout-task", "assets", "icons", "arrow-up.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>', "utf8");
    await writeFile(join(publicDir, "layout-task-run12-core23-persistent", "manifest.json"), "{}", "utf8");
    await writeFile(join(publicDir, "layout-task-run12-core23-persistent", "tasks", "scene.json"), "{}", "utf8");
    await writeFile(join(publicDir, "layout-task-generated-first5-svg-only", "obsolete.png"), "unused", "utf8");
    await writeFile(join(distDir, "assets", "app.js"), "built runtime", "utf8");

    await copyWebReleaseAssets({ publicDir, distDir });

    expect(await readdir(distDir)).toEqual(expect.arrayContaining([
      "assets",
      "experiment",
      "layout-task-run12-core23-persistent",
    ]));
    expect(await readdir(distDir)).not.toContain("layout-task-generated-first5-svg-only");
    expect(await readdir(join(distDir, "experiment"))).toEqual(["experiment.json", "layout-task"]);
    expect(await readFile(join(distDir, "experiment", "layout-task", "assets", "icons", "arrow-up.svg"), "utf8")).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(await readFile(join(distDir, "layout-task-run12-core23-persistent", "tasks", "scene.json"), "utf8")).toBe("{}");
    expect(await readFile(join(distDir, "assets", "app.js"), "utf8")).toBe("built runtime");
  });

  it("copies the formal package selected by an explicit Run 37 entry config", async () => {
    const root = await mkdtemp(join(process.cwd(), ".tmp", "copy-web-release-assets", "run37-"));
    const publicDir = join(root, "public");
    const distDir = join(root, "dist");
    await mkdir(join(publicDir, "experiment", "layout-task", "assets", "icons"), { recursive: true });
    await mkdir(join(publicDir, "layout-task-run12-core23-persistent"), { recursive: true });
    await mkdir(join(publicDir, "layout-task-run37-native25-persistent"), { recursive: true });
    await writeFile(join(publicDir, "experiment", "experiment.json"), JSON.stringify({ baseUrl: "../layout-task-run12-core23-persistent/" }), "utf8");
    await writeFile(join(publicDir, "experiment", "experiment-run37-native25-zh.json"), JSON.stringify({ baseUrl: "../layout-task-run37-native25-persistent/" }), "utf8");
    await writeFile(join(publicDir, "experiment", "experiment-run37-native25-en.json"), JSON.stringify({ baseUrl: "../layout-task-run37-native25-persistent/" }), "utf8");
    await writeFile(join(publicDir, "layout-task-run12-core23-persistent", "old.txt"), "old", "utf8");
    await writeFile(join(publicDir, "layout-task-run37-native25-persistent", "new.txt"), "new", "utf8");

    await copyWebReleaseAssets({
      publicDir,
      distDir,
      entryConfig: join(publicDir, "experiment", "experiment-run37-native25-zh.json"),
    });

    expect(await readFile(join(distDir, "layout-task-run37-native25-persistent", "new.txt"), "utf8")).toBe("new");
    expect(await readdir(distDir)).not.toContain("layout-task-run12-core23-persistent");
    expect(await readdir(join(distDir, "experiment"))).toEqual(expect.arrayContaining([
      "experiment-run37-native25-zh.json",
      "experiment-run37-native25-en.json",
    ]));
  });

  it("copies every formal package referenced by the release configs", async () => {
    const root = await mkdtemp(join(process.cwd(), ".tmp", "copy-web-release-assets", "all-packages-"));
    const publicDir = join(root, "public");
    const distDir = join(root, "dist");
    await mkdir(join(publicDir, "experiment", "layout-task", "assets", "icons"), { recursive: true });
    for (const [name, marker] of [["layout-task-run12-core23-persistent", "old"], ["layout-task-run41-persistent", "current"]]) {
      await mkdir(join(publicDir, name), { recursive: true });
      await writeFile(join(publicDir, name, "marker.txt"), marker, "utf8");
    }
    await mkdir(join(publicDir, "experiment"), { recursive: true });
    await writeFile(join(publicDir, "experiment", "experiment.json"), JSON.stringify({ baseUrl: "../layout-task-run12-core23-persistent/" }), "utf8");
    await writeFile(join(publicDir, "experiment", "experiment-run41-zh.json"), JSON.stringify({ baseUrl: "../layout-task-run41-persistent/" }), "utf8");

    await copyWebReleaseAssets({ publicDir, distDir });

    expect(await readFile(join(distDir, "layout-task-run12-core23-persistent", "marker.txt"), "utf8")).toBe("old");
    expect(await readFile(join(distDir, "layout-task-run41-persistent", "marker.txt"), "utf8")).toBe("current");
  });
});
