import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { compileBatch } from "../../src/core/batch-compiler";
import { batchSchema } from "../../src/schemas/batch.schema";

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

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function copyStaticDirectory(inputFile: string, outDir: string, relativeDirectory: string): Promise<boolean> {
  const inputRoot = path.dirname(path.resolve(inputFile));
  const source = path.resolve(inputRoot, relativeDirectory);
  const outputRoot = path.resolve(outDir);
  const target = path.resolve(outputRoot, relativeDirectory);

  if (!isInside(inputRoot, source) || !isInside(outputRoot, target)) {
    throw new Error(`Refusing to copy unsafe static directory: ${relativeDirectory}`);
  }

  if (!(await pathExists(source))) {
    return false;
  }

  await rm(target, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, force: true });
  return true;
}

async function copyPlayerIconAssets(outDir: string): Promise<boolean> {
  const source = path.resolve("public", "layout-task", "assets", "icons");
  const outputRoot = path.resolve(outDir);
  const target = path.resolve(outputRoot, "assets", "icons");

  if (!isInside(outputRoot, target) || !(await pathExists(source))) {
    return false;
  }

  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, force: true });
  return true;
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
    const raw = await readFile(input, "utf8");
    const batch = batchSchema.parse(JSON.parse(raw));
    const compiled = compileBatch(batch);
    const outputFiles = [
      resolveOutputFile(out, "manifest.json", compiled.manifest),
      ...compiled.tasks.map((task) => resolveOutputFile(out, task.file, task.config)),
      resolveOutputFile(out, "scoring/scoring-reference.json", compiled.scoringReference),
      resolveOutputFile(out, "generation-report.json", compiled.report),
    ];

    for (const file of outputFiles) {
      await writeJsonFile(file);
    }

    const copiedDirectories = [];
    for (const relativeDirectory of ["assets", "behaviors"]) {
      if (await copyStaticDirectory(input, out, relativeDirectory)) {
        copiedDirectories.push(relativeDirectory);
      }
    }
    if (await copyPlayerIconAssets(out)) {
      copiedDirectories.push("assets/icons");
    }

    console.log(`Compiled ${compiled.tasks.length} task(s) to ${out}`);
    if (copiedDirectories.length > 0) {
      console.log(`Copied static director${copiedDirectories.length === 1 ? "y" : "ies"}: ${copiedDirectories.join(", ")}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

await main();
