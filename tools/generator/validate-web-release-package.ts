import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface ValidateWebReleasePackageOptions {
  distDir: string;
}

export interface WebReleasePackageReport {
  ok: boolean;
  failures: string[];
}

export async function validateWebReleasePackage(options: ValidateWebReleasePackageOptions): Promise<WebReleasePackageReport> {
  const distDir = path.resolve(options.distDir);
  const failures: string[] = [];
  const allowedTopLevel = new Set([
    "assets",
    "experiment",
    "index.html",
    "layout-task-run12-core23-persistent",
  ]);
  for (const entry of await readdir(distDir)) {
    if (!allowedTopLevel.has(entry)) failures.push(`unexpected top-level path: ${entry}`);
  }
  const required = [
    "index.html",
    "experiment/index.html",
    "experiment/experiment.json",
    "experiment/experiment-zh.json",
    "experiment/experiment-en.json",
    "experiment/experiment-debug-zh.json",
    "experiment/experiment-debug-en.json",
    ...[
      "arrow-up.svg", "arrow-down.svg", "arrow-left.svg", "arrow-right.svg",
      "rotate-ccw.svg", "rotate-cw.svg", "move.svg", "info.svg", "hand.svg", "alert-circle.svg",
    ].map((icon) => `experiment/layout-task/assets/icons/${icon}`),
    "layout-task-run12-core23-persistent/manifest.json",
    "layout-task-run12-core23-persistent/scoring/scoring-reference.json",
    "layout-task-run12-core23-persistent/tutorial/manifest.json",
    "layout-task-run12-core23-persistent/tutorial/tutorial-package.lock.json",
  ];

  for (const relativePath of required) {
    const fullPath = path.join(distDir, relativePath);
    if (relativePath.includes("/assets/icons/") ? !(await isFile(fullPath)) : !(await exists(fullPath))) {
      failures.push(relativePath);
    }
  }

  const rootIndex = await readText(path.join(distDir, "index.html"));
  if (rootIndex !== undefined && !rootIndex.includes("/experiment/")) {
    failures.push("index.html must redirect to /experiment/");
  }

  const manifest = await readJson<{ tasks?: Array<{ file?: string }> }>(
    path.join(distDir, "layout-task-run12-core23-persistent/manifest.json"),
  );
  for (const task of manifest?.tasks ?? []) {
    if (task.file && !(await exists(path.join(distDir, "layout-task-run12-core23-persistent", task.file)))) {
      failures.push(`layout-task-run12-core23-persistent/${task.file}`);
    }
  }

  const tutorialManifest = await readJson<{ tasks?: Array<{ file?: string }> }>(
    path.join(distDir, "layout-task-run12-core23-persistent/tutorial/manifest.json"),
  );
  for (const task of tutorialManifest?.tasks ?? []) {
    if (task.file && !(await exists(path.join(distDir, "layout-task-run12-core23-persistent/tutorial", task.file)))) {
      failures.push(`layout-task-run12-core23-persistent/tutorial/${task.file}`);
    }
  }

  return { ok: failures.length === 0, failures };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function readText(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

async function readJson<T>(filePath: string): Promise<T | undefined> {
  const text = await readText(filePath);
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const distDir = process.argv[2];
  if (!distDir) {
    console.error("Usage: tsx tools/generator/validate-web-release-package.ts <dist-dir>");
    process.exitCode = 1;
    return;
  }
  const report = await validateWebReleasePackage({ distDir });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
