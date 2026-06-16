#!/usr/bin/env tsx

import {
  HelpRequested,
  decodeSourceRecords,
  parseDecoderArgs,
  printUsage,
  readSourceRecords,
  serializeCsv,
  writeOutput,
} from "../decoder/decoder-utils";
import { readScoringReference, toObjectStateRows } from "./scoring-utils";

interface ScoringArgs {
  decoderArgs: string[];
  scoringPath?: string;
}

async function main(): Promise<void> {
  try {
    const scoringArgs = extractScoringArgs(process.argv.slice(2));
    const options = parseDecoderArgs(scoringArgs.decoderArgs);
    const scoringReference = scoringArgs.scoringPath
      ? await readScoringReference(scoringArgs.scoringPath)
      : undefined;
    const records = await readSourceRecords(options);
    const decoded = await decodeSourceRecords(records);
    const csv = serializeCsv(toObjectStateRows(decoded, scoringReference));
    await writeOutput(csv, options.output);
  } catch (error) {
    if (error instanceof HelpRequested) {
      process.stdout.write(`${printObjectStateUsage()}\n`);
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown object state export error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

function extractScoringArgs(argv: string[]): ScoringArgs {
  const decoderArgs: string[] = [];
  let scoringPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--scoring") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("Missing value for --scoring");
      }

      scoringPath = value;
      i += 1;
      continue;
    }

    decoderArgs.push(arg);
  }

  return { decoderArgs, scoringPath };
}

function printObjectStateUsage(): string {
  return `${printUsage("export-object-states.ts").replace(
    "tools/decoder/export-object-states.ts",
    "tools/scoring/export-object-states.ts",
  )}\n  --scoring <file>       Optional scoring reference JSON.`;
}

void main();
