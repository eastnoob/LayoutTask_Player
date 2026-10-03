import { mkdir, writeFile } from "node:fs/promises";
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
});
