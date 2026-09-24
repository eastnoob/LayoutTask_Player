import { zipSync } from "fflate";
import type { ExperimentCsvFile } from "./experiment-data";

export interface RecoveryManifestInput {
  participantId: string;
  sessionId: string;
  experimentId: string;
  failedFilenames?: string[];
  sequenceId?: number;
}

export async function createCompleteRecoveryZip(
  files: ExperimentCsvFile[],
  input: RecoveryManifestInput,
): Promise<Blob> {
  const manifest = {
    schema: "layouttask.recovery-manifest.v1",
    participant_id: input.participantId,
    session_id: input.sessionId,
    experiment_id: input.experimentId,
    sequence_id: input.sequenceId,
    failed_filenames: input.failedFilenames ?? [],
    files: files.map((file) => ({ filename: file.filename, content_type: file.contentType })),
  };
  const archive = zipSync({
    ...Object.fromEntries(files.map((file) => [file.filename, new TextEncoder().encode(file.data)])),
    "manifest.json": new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
  });
  return new Blob([archive.buffer as ArrayBuffer], { type: "application/zip" });
}
