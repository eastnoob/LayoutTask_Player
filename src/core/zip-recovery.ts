import { zipSync } from "fflate";
import type { ExperimentCsvFile } from "./experiment-data";
import type { ExperimentAssignmentMetadata } from "./experiment-data";
import type { PauseSummary } from "../types/result";

export interface RecoveryManifestInput {
  participantId: string;
  prolificId?: string;
  sessionId: string;
  experimentId: string;
  completionCode?: string;
  failedFilenames?: string[];
  sequenceId?: number;
  assignment?: ExperimentAssignmentMetadata;
  pauseSummary?: PauseSummary;
}

export async function createCompleteRecoveryZip(
  files: ExperimentCsvFile[],
  input: RecoveryManifestInput,
): Promise<Blob> {
  const manifest = {
    schema: "layouttask.recovery-manifest.v1",
    participant_id: input.participantId,
    prolific_id: input.prolificId ?? "",
    session_id: input.sessionId,
    experiment_id: input.experimentId,
    completion_code: input.completionCode ?? "",
    sequence_id: input.sequenceId,
    ...input.assignment,
    failed_filenames: input.failedFilenames ?? [],
    pause: input.pauseSummary,
    files: files.map((file) => ({ filename: file.filename, content_type: file.contentType })),
  };
  const archive = zipSync({
    ...Object.fromEntries(files.map((file) => [file.filename, new TextEncoder().encode(file.data)])),
    "manifest.json": new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
  });
  return new Blob([archive.buffer as ArrayBuffer], { type: "application/zip" });
}
