import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("R12 formal trial flow", () => {
  it("shows each corresponding stimulus image before reconstruction", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "public/layout-task-run12-core23-preview/manifest.json"), "utf8"),
    ) as { tasks: Array<{ file: string }> };

    expect(manifest.tasks).toHaveLength(23);
    for (const entry of manifest.tasks) {
      const task = JSON.parse(
        readFileSync(resolve(process.cwd(), "public/layout-task-run12-core23-preview", entry.file), "utf8"),
      ) as { flow?: { mode?: string }; display_image?: { enabled?: boolean; src?: string } };

      expect(task.flow?.mode).toBe("preview_then_reconstruct");
      expect(task.display_image?.enabled).toBe(true);
      expect(task.display_image?.src).toMatch(/^assets\/images\/stimulus\/.+/);
    }
  });
});
