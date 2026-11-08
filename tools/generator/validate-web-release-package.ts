import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { verifyTutorialPackage } from "../../src/core/tutorial-package-lock";
import { validateRuntimePackage } from "./validate-runtime-package";

export interface ValidateWebReleasePackageOptions {
  distDir: string;
  entryConfig?: string;
}

export interface WebReleasePackageReport {
  ok: boolean;
  failures: string[];
}

export async function validateWebReleasePackage(options: ValidateWebReleasePackageOptions): Promise<WebReleasePackageReport> {
  const distDir = path.resolve(options.distDir);
  const failures: string[] = [];
  const entryConfig = path.resolve(options.entryConfig ?? path.join(distDir, "experiment", "experiment.json"));
  const experimentDir = path.join(distDir, "experiment");
  const configFiles = options.entryConfig
    ? [entryConfig]
    : (await exists(experimentDir)
      ? (await readdir(experimentDir, { withFileTypes: true }))
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
          .map((entry) => path.join(experimentDir, entry.name))
      : []);
  const formalRoots = await resolveFormalRoots(configFiles, distDir, failures);
  const allowedTopLevel = new Set([
    "assets",
    "experiment",
    "index.html",
    ...formalRoots.map((root) => path.basename(root)),
  ]);
  for (const entry of await readdir(distDir)) {
    if (!allowedTopLevel.has(entry)) failures.push(`unexpected top-level path: ${entry}`);
  }
  const requiredConfigs = options.entryConfig
    ? [`experiment/${path.basename(entryConfig)}`]
    : [
        "experiment/experiment.json",
        "experiment/experiment-zh.json",
        "experiment/experiment-en.json",
        "experiment/experiment-debug-zh.json",
        "experiment/experiment-debug-en.json",
      ];
  const required = [
    "index.html",
    "experiment/index.html",
    ...requiredConfigs,
    ...[
      "arrow-up.svg", "arrow-down.svg", "arrow-left.svg", "arrow-right.svg",
      "rotate-ccw.svg", "rotate-cw.svg", "move.svg", "info.svg", "hand.svg", "alert-circle.svg",
    ].map((icon) => `experiment/layout-task/assets/icons/${icon}`),
    ...formalRoots.flatMap((formalRoot) => {
      const formalName = path.basename(formalRoot);
      return [
        `${formalName}/manifest.json`,
        `${formalName}/scoring/scoring-reference.json`,
        `${formalName}/tutorial/manifest.json`,
        `${formalName}/tutorial/tutorial-package.lock.json`,
      ];
    }),
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

  await validateAssetClosure(distDir, formalRoots, failures);
  // Closure runs first so the existing file loaders cannot follow escaping references.
  if (failures.length === 0) {
    for (const formalRoot of formalRoots) {
      const tutorialRoot = path.join(formalRoot, "tutorial");
      for (const baseDir of [formalRoot, tutorialRoot]) {
        const report = await validateRuntimePackage({ baseDir, checkTargets: true });
        for (const failure of report.failures) {
          failures.push(`runtime ${path.relative(distDir, baseDir)}: ${JSON.stringify(failure)}`);
        }
      }
      try {
        verifyTutorialPackage(tutorialRoot, formalRoot);
      } catch (error) {
        failures.push(`tutorial ${path.relative(distDir, tutorialRoot)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return { ok: failures.length === 0, failures: [...new Set(failures)] };
}

async function validateAssetClosure(distDir: string, formalRoots: string[], failures: string[]): Promise<void> {
  const visited = new Set<string>();
  const referenceKeys = new Set([
    "src", "file", "asset_library", "background_library", "behavior_library", "scoring_reference",
    "schedule_path", "reference_path", "allSvg", "variableSvg", "allAnimation", "variableAnimation",
  ]);
  const inside = (root: string, target: string) => target === root || target.startsWith(`${root}${path.sep}`);
  const label = (file: string) => path.relative(distDir, file).replaceAll(path.sep, "/");

  const resolveReference = (reference: string, baseDir: string, boundary: string, source: string): string | undefined => {
    try {
      const base = new URL(`${label(baseDir)}/`, "https://release.invalid/");
      const url = new URL(reference, base);
      const target = path.resolve(distDir, `.${decodeURIComponent(url.pathname)}`);
      if (url.origin !== base.origin || !inside(boundary, target)) throw new Error("outside package");
      return target;
    } catch {
      failures.push(`outside package: ${source} -> ${reference}`);
      return undefined;
    }
  };

  const visitFile = async (file: string, baseDir: string, boundary: string): Promise<void> => {
    if (visited.has(file)) return;
    visited.add(file);
    if (!(await isFile(file))) {
      failures.push(`missing referenced file: ${label(file)}`);
      return;
    }
    if (!file.endsWith(".json")) return;
    let value: unknown;
    try {
      value = JSON.parse(await readFile(file, "utf8"));
    } catch {
      failures.push(`invalid JSON: ${label(file)}`);
      return;
    }
    await visitValue(value, baseDir, boundary, label(file));
  };

  const visitValue = async (value: unknown, baseDir: string, boundary: string, source: string): Promise<void> => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const entry of value) await visitValue(entry, baseDir, boundary, source);
      return;
    }
    const record = value as Record<string, unknown>;
    let boardRoot = baseDir;
    if (typeof record.baseUrl === "string") {
      const packageRoot = resolveReference(record.baseUrl, baseDir, boundary, source);
      if (packageRoot) {
        boardRoot = packageRoot;
        await visitFile(path.join(packageRoot, "manifest.json"), packageRoot, packageRoot);
      }
    }
    for (const [key, entry] of Object.entries(record)) {
      if (typeof entry === "string" && (referenceKeys.has(key) || (key === "path" && record.sha256))) {
        const target = resolveReference(entry, baseDir, boundary, source);
        if (target) await visitFile(target, baseDir, boundary);
      } else if (key === "referenceBoard") {
        await visitValue(entry, boardRoot, boardRoot, source);
      } else {
        await visitValue(entry, baseDir, boundary, source);
      }
    }
  };

  const experimentDir = path.join(distDir, "experiment");
  if (await exists(experimentDir)) {
    for (const entry of await readdir(experimentDir)) {
      if (entry.endsWith(".json")) await visitFile(path.join(experimentDir, entry), experimentDir, distDir);
    }
  }
  for (const formalRoot of formalRoots) {
    const tutorialRoot = path.join(formalRoot, "tutorial");
    await visitFile(path.join(formalRoot, "manifest.json"), formalRoot, formalRoot);
    await visitFile(path.join(tutorialRoot, "manifest.json"), tutorialRoot, tutorialRoot);
    await visitFile(path.join(tutorialRoot, "tutorial-package.lock.json"), tutorialRoot, tutorialRoot);
  }
}

async function resolveFormalRoots(configFiles: string[], distDir: string, failures: string[]): Promise<string[]> {
  const formalRoots = new Set<string>();
  for (const configFile of configFiles) {
    try {
      const config = JSON.parse(await readFile(configFile, "utf8")) as { baseUrl?: string };
      if (!config.baseUrl) {
        failures.push(`config has no baseUrl: ${path.relative(distDir, configFile)}`);
        continue;
      }
      const formalRoot = path.resolve(path.dirname(configFile), config.baseUrl);
      const relative = path.relative(distDir, formalRoot);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        failures.push(`formal package outside release: ${config.baseUrl}`);
        continue;
      }
      formalRoots.add(formalRoot);
    } catch {
      failures.push(`invalid JSON: ${path.relative(distDir, configFile)}`);
    }
  }
  if (formalRoots.size === 0) formalRoots.add(path.join(distDir, "layout-task-run12-core23-persistent"));
  return [...formalRoots];
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

async function main(): Promise<void> {
  const distDir = process.argv[2];
  const entryConfig = process.argv[3];
  if (!distDir) {
    console.error("Usage: tsx tools/generator/validate-web-release-package.ts <dist-dir> [entry-config]");
    process.exitCode = 1;
    return;
  }
  const report = await validateWebReleasePackage({ distDir, entryConfig });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
