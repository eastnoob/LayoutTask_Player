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
// 它保留嵌套结构，适合研究者逐条查看一个 decoded payload，而不是直接压平成表。
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
