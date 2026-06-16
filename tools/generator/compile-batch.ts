import { mkdir, readFile, writeFile } from "node:fs/promises";
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

function parseArgs(args: string[]): CliArgs {
  const parsed: CliArgs = { out: defaultOutDir };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--input") {
      parsed.input = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--input=")) {
      parsed.input = arg.slice("--input=".length);
      continue;
    }

    if (arg === "--out") {
      parsed.out = args[index + 1] ?? parsed.out;
      index += 1;
      continue;
    }

    if (arg.startsWith("--out=")) {
      parsed.out = arg.slice("--out=".length);
      continue;
    }

    if (!arg.startsWith("-") && parsed.input === undefined) {
      parsed.input = arg;
    }
  }

  return parsed;
}

async function writeJsonWithinOut(outDir: string, relativeFile: string, value: unknown): Promise<void> {
  const root = path.resolve(outDir);
  const target = path.resolve(root, relativeFile);
  const relativeToRoot = path.relative(root, target);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Refusing to write outside output directory: ${relativeFile}`);
  }

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const { input, out } = parseArgs(process.argv.slice(2));

  if (!input) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  try {
    const raw = await readFile(input, "utf8");
    const batch = batchSchema.parse(JSON.parse(raw));
    const compiled = compileBatch(batch);

    await writeJsonWithinOut(out, "manifest.json", compiled.manifest);
    for (const task of compiled.tasks) {
      await writeJsonWithinOut(out, task.file, task.config);
    }
    await writeJsonWithinOut(out, "scoring/scoring-reference.json", compiled.scoringReference);
    await writeJsonWithinOut(out, "generation-report.json", compiled.report);

    console.log(`Compiled ${compiled.tasks.length} task(s) to ${out}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

await main();
