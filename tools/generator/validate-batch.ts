import { readFile } from "node:fs/promises";
import { batchSchema } from "../../src/schemas/batch.schema";

const usage = `Usage: tsx tools/generator/validate-batch.ts --input <file>
       tsx tools/generator/validate-batch.ts <file>`;

interface CliArgs {
  input?: string;
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];

  if (!value || value.startsWith("-")) {
    throw new Error(`${option} requires a value`);
  }

  return value;
}

function parseArgs(args: string[]): CliArgs {
  const parsed: CliArgs = {};

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

async function main(): Promise<void> {
  let input: string | undefined;

  try {
    ({ input } = parseArgs(process.argv.slice(2)));
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

    console.log(
      JSON.stringify(
        {
          valid: true,
          experiment_id: batch.experiment_id,
          trial_count: batch.trials.length,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

await main();
