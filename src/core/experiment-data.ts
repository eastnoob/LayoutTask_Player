export interface ExperimentTrialResultItem {
  taskId: string;
  qid?: string;
  encoded?: string;
  result?: unknown;
}

export interface ExperimentCsvInput {
  participantId: string;
  sessionId: string;
  experimentId: string;
  startTime: number;
  endTime: number;
  tutorialCompleted: boolean;
  tutorialDurationMs: number;
  trialOrder: string[];
  trialResults: ExperimentTrialResultItem[];
}

export interface ExperimentDataPipePayloadInput {
  experimentId: string;
  filenamePrefix: string;
  participantId: string;
  sessionId: string;
  data: string;
}

export function createExperimentCsv(input: ExperimentCsvInput): string {
  const header = [
    "participant_id",
    "session_id",
    "experiment_id",
    "start_time",
    "end_time",
    "n_trials",
    "tutorial_completed",
    "tutorial_duration_ms",
    "trial_order_json",
    "trial_results_json",
  ];
  const row = [
    input.participantId,
    input.sessionId,
    input.experimentId,
    String(input.startTime),
    String(input.endTime),
    String(input.trialResults.length),
    String(input.tutorialCompleted),
    String(input.tutorialDurationMs),
    JSON.stringify(input.trialOrder),
    JSON.stringify(input.trialResults),
  ];

  return `${header.join(",")}\n${row.map(formatCsvCell).join(",")}\n`;
}

export function createExperimentFilename(prefix: string, participantId: string, sessionId: string): string {
  return `${sanitizeFilenamePart(prefix)}_${sanitizeFilenamePart(participantId)}_${sanitizeFilenamePart(sessionId)}.csv`;
}

export function createExperimentDataPipePayload(input: ExperimentDataPipePayloadInput): {
  experimentID: string;
  filename: string;
  data: string;
} {
  return {
    experimentID: input.experimentId,
    filename: createExperimentFilename(input.filenamePrefix, input.participantId, input.sessionId),
    data: input.data,
  };
}

function formatCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "layout-task";
}
