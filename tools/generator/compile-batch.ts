import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileBatch } from "../../src/core/batch-compiler";
import { batchSchema } from "../../src/schemas/batch.schema";
import type { BatchConfig } from "../../src/types/batch";
import { readTutorialPackageLock, verifyTutorialPackage } from "../../src/core/tutorial-package-lock";

const defaultOutDir = "public/layout-task-generated";
const usage = `Usage: tsx tools/generator/compile-batch.ts --input <file> [--out <dir>]
       tsx tools/generator/compile-batch.ts <file> [--out <dir>]`;

interface CliArgs {
  input?: string;
  out: string;
}

interface OutputFile {
  target: string;
  value: unknown;
}

interface CompileToDirectoryOptions {
  input: string;
  out: string;
  tutorialSourceRoot?: string;
}

interface CompileToDirectoryResult {
  taskCount: number;
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];

  if (!value || value.startsWith("-")) {
    throw new Error(`${option} requires a value`);
  }

  return value;
}

function parseArgs(args: string[]): CliArgs {
  const parsed: CliArgs = { out: defaultOutDir };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--input") {
      parsed.input = requireValue(args, index, "--input");
      index += 1;
      continue;
    }

    if (arg.startsWith("--input=")) {
      const value = arg.slice("--input=".length);
      if (!value || value.startsWith("-")) {
        throw new Error("--input requires a value");
      }
      parsed.input = value;
      continue;
    }

    if (arg === "--out") {
      parsed.out = requireValue(args, index, "--out");
      index += 1;
      continue;
    }

    if (arg.startsWith("--out=")) {
      const value = arg.slice("--out=".length);
      if (!value || value.startsWith("-")) {
        throw new Error("--out requires a value");
      }
      parsed.out = value;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!arg.startsWith("-") && parsed.input === undefined) {
      parsed.input = arg;
      continue;
    }

    if (!arg.startsWith("-")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return parsed;
}

function isInside(root: string, target: string): boolean {
  const relativeToRoot = path.relative(root, target);
  return relativeToRoot === "" || (!relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot));
}

function resolveOutputFile(outDir: string, relativeFile: string, value: unknown): OutputFile {
  const root = path.resolve(outDir);
  const target = path.resolve(root, relativeFile);

  if (!isInside(root, target)) {
    throw new Error(`Refusing to write outside output directory: ${relativeFile}`);
  }

  if (relativeFile.startsWith("tasks/") && !isInside(path.resolve(root, "tasks"), target)) {
    throw new Error(`Refusing to write task outside tasks directory: ${relativeFile}`);
  }

  return { target, value };
}

async function writeJsonFile(file: OutputFile): Promise<void> {
  await mkdir(path.dirname(file.target), { recursive: true });
  await writeFile(file.target, `${JSON.stringify(file.value, null, 2)}\n`, "utf8");
}

export async function compileBatchToDirectory(options: CompileToDirectoryOptions): Promise<CompileToDirectoryResult> {
  if (path.basename(path.resolve(options.out)) === "layout-task-tutorial") {
    throw new Error("Refusing to compile into the protected tutorial package");
  }
  const raw = await readFile(options.input, "utf8");
  const batch = batchSchema.parse(JSON.parse(raw));
  const compiled = compileBatch(batch);
  const outputFiles = [
    resolveOutputFile(options.out, "manifest.json", compiled.manifest),
    ...compiled.tasks.map((task) => resolveOutputFile(options.out, task.file, task.config)),
    resolveOutputFile(options.out, "scoring/scoring-reference.json", compiled.scoringReference),
    resolveOutputFile(options.out, "generation-report.json", compiled.report),
  ];

  for (const file of outputFiles) {
    await writeJsonFile(file);
  }

  await copyRuntimeAssets({
    batch,
    sourceRoot: path.dirname(path.resolve(options.input)),
    outDir: options.out,
  });

  await copyVerifiedTutorialPackage({
    sourceRoot: options.tutorialSourceRoot ?? path.resolve("public/layout-task-tutorial"),
    formalRoot: options.out,
    outDir: options.out,
  });

  return { taskCount: compiled.tasks.length };
}

async function copyVerifiedTutorialPackage(input: {
  sourceRoot: string;
  formalRoot: string;
  outDir: string;
}): Promise<void> {
  const sourceRoot = path.resolve(input.sourceRoot);
  const outDir = path.resolve(input.outDir);
  verifyTutorialPackage(sourceRoot, input.formalRoot);
  const lock = readTutorialPackageLock(sourceRoot);
  const tutorialOut = path.resolve(outDir, "tutorial");

  for (const entry of lock.files) {
    const source = resolveWithin(sourceRoot, entry.path, "read");
    const target = resolveWithin(tutorialOut, entry.path, "write");
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }

  const lockTarget = resolveWithin(tutorialOut, "tutorial-package.lock.json", "write");
  await mkdir(path.dirname(lockTarget), { recursive: true });
  await copyFile(resolveWithin(sourceRoot, "tutorial-package.lock.json", "read"), lockTarget);

  verifyTutorialPackage(tutorialOut, input.formalRoot);
}

function resolveWithin(root: string, relativeFile: string, operation: "read" | "write"): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativeFile);
  if (!isInside(resolvedRoot, target)) {
    throw new Error(`Refusing to ${operation} outside tutorial package: ${relativeFile}`);
  }
  return target;
}

async function copyRuntimeAssets(input: { batch: BatchConfig; sourceRoot: string; outDir: string }): Promise<void> {
  const objectLibrary = await readPackageJson(input.sourceRoot, input.batch.shared.asset_library);
  const backgroundLibrary = await readPackageJson(input.sourceRoot, input.batch.shared.background_library);
  const referencedFiles = new Set<string>();

  addRelativeFile(referencedFiles, input.batch.shared.asset_library);
  addRelativeFile(referencedFiles, input.batch.shared.background_library);
  addRelativeFile(referencedFiles, input.batch.shared.behavior_library);

  for (const trial of input.batch.trials) {
    addRelativeFile(referencedFiles, trial.display_image?.src);
    addRelativeFile(referencedFiles, trial.collision?.source?.src);

    const backgroundAsset = getRecordValue(
      getRecordValue(backgroundLibrary, "backgrounds"),
      trial.background.asset,
    );
    addRelativeFile(referencedFiles, getStringProperty(backgroundAsset, "src"));

    for (const object of trial.objects) {
      const objectAsset = getRecordValue(getRecordValue(objectLibrary, "objects"), object.asset);
      addRelativeFile(referencedFiles, getStringProperty(objectAsset, "src"));
      addRelativeFile(referencedFiles, getCollisionSourcePath(object.collision));
    }
  }

  for (const relativeFile of referencedFiles) {
    await copyPackageFile(input.sourceRoot, input.outDir, relativeFile);
  }
}

async function readPackageJson(sourceRoot: string, relativeFile: string): Promise<unknown> {
  const source = resolveSourceFile(sourceRoot, relativeFile);
  return JSON.parse(await readFile(source, "utf8"));
}

async function copyPackageFile(sourceRoot: string, outDir: string, relativeFile: string): Promise<void> {
  const source = resolveSourceFile(sourceRoot, relativeFile);
  const target = resolveOutputPath(outDir, relativeFile);

  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}

function resolveSourceFile(sourceRoot: string, relativeFile: string): string {
  if (!isCopyableRelativePath(relativeFile)) {
    throw new Error(`Refusing to copy non-local package asset: ${relativeFile}`);
  }

  const root = path.resolve(sourceRoot);
  const source = path.resolve(root, relativeFile);
  if (!isInside(root, source)) {
    throw new Error(`Refusing to read outside input package directory: ${relativeFile}`);
  }

  return source;
}

function resolveOutputPath(outDir: string, relativeFile: string): string {
  if (!isCopyableRelativePath(relativeFile)) {
    throw new Error(`Refusing to write non-local package asset: ${relativeFile}`);
  }

  const root = path.resolve(outDir);
  const target = path.resolve(root, relativeFile);
  if (!isInside(root, target)) {
    throw new Error(`Refusing to write outside output directory: ${relativeFile}`);
  }

  return target;
}

function addRelativeFile(files: Set<string>, value: string | undefined): void {
  if (!value || !isCopyableRelativePath(value)) {
    return;
  }

  files.add(value);
}

function isCopyableRelativePath(value: string): boolean {
  return !path.isAbsolute(value) && !/^[a-z][a-z\d+.-]*:/i.test(value);
}

function getRecordValue(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function getStringProperty(value: unknown, key: string): string | undefined {
  const property = getRecordValue(value, key);
  return typeof property === "string" ? property : undefined;
}

function getCollisionSourcePath(collision: BatchConfig["trials"][number]["objects"][number]["collision"]): string | undefined {
  if (!collision || !("source" in collision)) {
    return undefined;
  }

  return collision.source.src;
}

async function main(): Promise<void> {
  let input: string | undefined;
  let out = defaultOutDir;

  try {
    ({ input, out } = parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  if (!input) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await compileBatchToDirectory({ input, out });
    console.log(`Compiled ${result.taskCount} task(s) to ${out}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
