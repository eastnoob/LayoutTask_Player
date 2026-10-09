import { mkdir, mkdtemp, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateWebReleasePackage } from "./validate-web-release-package";

describe("validateWebReleasePackage", () => {
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
