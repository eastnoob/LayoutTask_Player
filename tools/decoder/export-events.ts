#!/usr/bin/env tsx

import {
  HelpRequested,
  decodeSourceRecords,
  parseDecoderArgs,
  printUsage,
  readSourceRecords,
  serializeCsv,
  toEventRows,
  writeOutput,
} from "./decoder-utils";

// export-events flattens the event log into long-table CSV.
// 注意：如果前端配置 detail=final-only，events 会是空数组，这里自然不会输出事件行。
async function main(): Promise<void> {
  try {
    const options = parseDecoderArgs(process.argv.slice(2));
    const records = await readSourceRecords(options);
    const decoded = await decodeSourceRecords(records);
    const csv = serializeCsv(toEventRows(decoded));
    await writeOutput(csv, options.output);
  } catch (error) {
    if (error instanceof HelpRequested) {
      process.stdout.write(`${printUsage("export-events.ts")}\n`);
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown export error";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

void main();
