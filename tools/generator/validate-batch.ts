import { readFile } from "node:fs/promises";
import { batchSchema } from "../../src/schemas/batch.schema";

const usage = `Usage: tsx tools/generator/validate-batch.ts --input <file>
       tsx tools/generator/validate-batch.ts <file>`;

interface CliArgs {
  input?: string;
}

function parseArgs(args: string[]): CliArgs {
  const parsed: CliArgs = {};

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

    if (!arg.startsWith("-") && parsed.input === undefined) {
      parsed.input = arg;
    }
  }

  return parsed;
}

async function main(): Promise<void> {
  const { input } = parseArgs(process.argv.slice(2));

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
