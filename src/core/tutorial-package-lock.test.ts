import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readTutorialPackageLock, verifyTutorialPackage } from "./tutorial-package-lock";

function createLockedFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "layout-task-tutorial-"));
  mkdirSync(join(root, "tasks"), { recursive: true });
  writeFileSync(join(root, "tasks", "tutorial.json"), '{"task_id":"tutorial"}\n');
  writeFileSync(join(root, "manifest.json"), '{"tasks":[]}\n');
  const relativePath = "tasks/tutorial.json";
  const content = readFileSync(join(root, relativePath));
  const sha256 = createHash("sha256").update(content).digest("hex");
  writeFileSync(
    join(root, "tutorial-package.lock.json"),
    JSON.stringify({
      schema: "layouttask.tutorial-package-lock.v1",
      package_version: "tutorial-test-v1",
      task_id: "tutorial",
      qid: "Q_tutorial",
      source_generation: "E:/test",
      files: [{ path: relativePath, sha256 }],
    }),
  );
  return root;
}

describe("tutorial package lock", () => {
  it("reads and verifies a locked package", () => {
    const root = createLockedFixture();

    expect(readTutorialPackageLock(root).schema).toBe("layouttask.tutorial-package-lock.v1");
    expect(verifyTutorialPackage(root, join(root, "formal"))).toMatchObject({
      packageVersion: "tutorial-test-v1",
      fileCount: 1,
    });
  });

  it("rejects a missing or modified locked file", () => {
    const root = createLockedFixture();
    writeFileSync(join(root, "tasks", "tutorial.json"), "changed\n");
    expect(() => verifyTutorialPackage(root, join(root, "formal"))).toThrow(/sha256|changed/i);
  });

  it("rejects a tutorial task that appears in the formal manifest", () => {
    const root = createLockedFixture();
    const formalRoot = join(root, "formal");
    mkdirSync(formalRoot, { recursive: true });
    writeFileSync(join(formalRoot, "manifest.json"), '{"tasks":[{"task_id":"tutorial"}]}');

    expect(() => verifyTutorialPackage(root, formalRoot)).toThrow(/formal manifest/i);
  });

  it("rejects a reference-board path outside the tutorial root", () => {
    const root = createLockedFixture();

    expect(() =>
      verifyTutorialPackage(root, join(root, "formal"), {
        referenceBoardPaths: ["../layout-task-run12-core23-preview/assets/object.svg"],
      }),
    ).toThrow(/outside tutorial package/i);
  });
});
