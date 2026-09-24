import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

export interface TutorialPackageLock {
  schema: "layouttask.tutorial-package-lock.v1";
  package_version: string;
  task_id: string;
  qid: string;
  source_generation: string;
  files: Array<{ path: string; sha256: string }>;
}

export interface TutorialPackageVerification {
  packageVersion: string;
  taskId: string;
  qid: string;
  fileCount: number;
}

export function createTutorialPackageLock(input: {
  root: string;
  packageVersion: string;
  taskId: string;
  qid: string;
  sourceGeneration: string;
}): TutorialPackageLock {
  const root = resolve(input.root);
  const files = listFiles(root)
    .filter((path) => path !== "tutorial-package.lock.json")
    .sort()
    .map((path) => ({
      path,
      sha256: createHash("sha256").update(readFileSync(join(root, path))).digest("hex"),
    }));

  return {
    schema: "layouttask.tutorial-package-lock.v1",
    package_version: input.packageVersion,
    task_id: input.taskId,
    qid: input.qid,
    source_generation: input.sourceGeneration,
    files,
  };
}

export function readTutorialPackageLock(root: string): TutorialPackageLock {
  const lockPath = join(root, "tutorial-package.lock.json");
  if (!existsSync(lockPath)) {
    throw new Error(`Tutorial package lock is missing: ${lockPath}`);
  }
  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as TutorialPackageLock;
  if (lock.schema !== "layouttask.tutorial-package-lock.v1" || !Array.isArray(lock.files)) {
    throw new Error("Invalid tutorial package lock schema");
  }
  return lock;
}

export function verifyTutorialPackage(
  root: string,
  formalRoot: string,
  options: { referenceBoardPaths?: string[] } = {},
): TutorialPackageVerification {
  const packageRoot = resolve(root);
  const lock = readTutorialPackageLock(packageRoot);

  for (const boardPath of options.referenceBoardPaths ?? []) {
    assertInsidePackage(packageRoot, boardPath, "Reference-board path");
    assertExists(packageRoot, boardPath, "Reference-board file");
  }

  const manifest = readJson(join(packageRoot, "manifest.json"));
  const formalManifestPath = join(resolve(formalRoot), "manifest.json");
  if (existsSync(formalManifestPath)) {
    const formalManifest = readJson(formalManifestPath);
    const formalTaskIds = new Set((formalManifest.tasks ?? []).map((task) => String(task.task_id)));
    if (formalTaskIds.has(lock.task_id)) {
      throw new Error(`Tutorial task ${lock.task_id} is present in the formal manifest`);
    }
  }

  assertManifestReferences(packageRoot, manifest, lock);

  for (const entry of lock.files) {
    assertInsidePackage(packageRoot, entry.path, "Locked file");
    const filePath = join(packageRoot, entry.path);
    assertExists(packageRoot, entry.path, "Locked file");
    const actual = createHash("sha256").update(readFileSync(filePath)).digest("hex");
    if (actual !== entry.sha256) {
      throw new Error(`Locked file sha256 changed: ${entry.path}`);
    }
  }

  return {
    packageVersion: lock.package_version,
    taskId: lock.task_id,
    qid: lock.qid,
    fileCount: lock.files.length,
  };
}

function assertManifestReferences(root: string, manifest: JsonRecord, lock: TutorialPackageLock): void {
  assertExists(root, "manifest.json", "Tutorial manifest");
  for (const path of [manifest.asset_library, manifest.background_library, manifest.behavior_library, manifest.scoring_reference]) {
    if (typeof path === "string") {
      assertExists(root, path, "Tutorial library");
    }
  }

  const objects = typeof manifest.asset_library === "string" ? readJson(join(root, manifest.asset_library)).objects ?? {} : {};
  const backgrounds =
    typeof manifest.background_library === "string" ? readJson(join(root, manifest.background_library)).backgrounds ?? {} : {};
  const behaviors = typeof manifest.behavior_library === "string" ? readJson(join(root, manifest.behavior_library)).behaviors ?? {} : {};
  for (const entry of manifest.tasks ?? []) {
    if (String(entry.task_id) !== lock.task_id) {
      continue;
    }
    assertExists(root, String(entry.file), "Tutorial task");
    const task = readJson(join(root, String(entry.file)));
    if (task.task_id !== lock.task_id || task.qid !== lock.qid) {
      throw new Error("Tutorial task identity does not match the package lock");
    }
    const background = backgrounds[task.background?.asset];
    if (background?.src) {
      assertExists(root, background.src, "Tutorial background");
    }
    if (task.display_image?.src) {
      assertExists(root, task.display_image.src, "Tutorial display image");
    }
    for (const object of task.objects ?? []) {
      const asset = objects[object.asset];
      if (asset?.src) {
        assertExists(root, asset.src, "Tutorial object");
      }
      if (object.collision?.source?.src) {
        assertExists(root, object.collision.source.src, "Tutorial collision asset");
      }
      if (object.behavior?.template && !behaviors[object.behavior.template]) {
        throw new Error(`Tutorial behavior is missing: ${object.behavior.template}`);
      }
    }
  }
}

function assertInsidePackage(root: string, path: string, label: string): void {
  const resolved = resolve(root, path);
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
    throw new Error(`${label} is outside tutorial package: ${path}`);
  }
}

function assertExists(root: string, path: string, label: string): void {
  assertInsidePackage(root, path, label);
  if (!existsSync(join(root, path))) {
    throw new Error(`${label} is missing: ${path}`);
  }
}

type JsonRecord = Record<string, any>;

function readJson(path: string): JsonRecord {
  return JSON.parse(readFileSync(path, "utf8")) as JsonRecord;
}

function listFiles(root: string, current = ""): string[] {
  return readdirSync(join(root, current), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = current ? `${current}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(root, relativePath) : [relativePath];
  });
}
