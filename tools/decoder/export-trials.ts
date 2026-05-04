#!/usr/bin/env tsx

import {
  HelpRequested,
  decodeSourceRecords,
  parseDecoderArgs,
  printUsage,
  readSourceRecords,
  serializeCsv,
  toTrialRows,
  writeOutput,
} from "./decoder-utils";

// export-trials flattens one encoded string into one CSV row.
// 适合和问卷原表 merge，做 trial-level QC 和统计。
async function main(): Promise<void> {
  try {
    const options = parseDecoderArgs(process.argv.slice(2));
    const records = await readSourceRecords(options);
    const decoded = await decodeSourceRecords(records);
    const csv = serializeCsv(toTrialRows(decoded));
    await writeOutput(csv, options.output);
  } catch (error) {
    if (error instanceof HelpRequested) {
      process.stdout.write(`${printUsage("export-trials.ts")}\n`);
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown export error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

void main();
