#!/usr/bin/env tsx

import {
  HelpRequested,
  decodeSourceRecords,
  decodedRecordsToJson,
  parseDecoderArgs,
  printUsage,
  readSourceRecords,
  writeOutput,
} from "./decoder-utils";

// decode-results is the inspection tool:
// it keeps the nested structure so researchers can inspect one decoded payload at a time.
async function main(): Promise<void> {
  try {
    const options = parseDecoderArgs(process.argv.slice(2));
    const records = await readSourceRecords(options);
    const decoded = await decodeSourceRecords(records);
    await writeOutput(decodedRecordsToJson(decoded, options.pretty), options.output);
  } catch (error) {
    if (error instanceof HelpRequested) {
      process.stdout.write(`${printUsage("decode-results.ts")}\n`);
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown decoder error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

void main();
