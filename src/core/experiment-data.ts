import type {
  AbsoluteFinalState,
  FinalObjectState,
  LayoutTaskResult,
  RelativeFinalObjectState,
  RelativeFinalState,
} from "../types/result";

export interface ExperimentTrialResultItem {
  taskId: string;
  qid?: string;
  encoded?: string;
  hash8?: string;
  result?: LayoutTaskResult | unknown;
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

export interface ExperimentCsvFile {
  filename: string;
  data: string;
}

export interface ExperimentDataPipePayloadsInput {
  experimentId: string;
  files: ExperimentCsvFile[];
}

export function createExperimentCsvFiles(input: ExperimentCsvInput): ExperimentCsvFile[] {
  return [
    {
      filename: createExperimentFilename("layout_session", input.participantId, input.sessionId),
      data: createSessionCsv(input),
    },
    {
      filename: createExperimentFilename("layout_results", input.participantId, input.sessionId),
      data: createResultsCsv(input),
    },
    {
      filename: createExperimentFilename("layout_events", input.participantId, input.sessionId),
      data: createEventsCsv(input),
    },
  ];
}

export function createExperimentFilename(prefix: string, participantId: string, sessionId: string): string {
  return `${sanitizeFilenamePart(prefix)}_${sanitizeFilenamePart(participantId)}_${sanitizeFilenamePart(sessionId)}.csv`;
}

export function createExperimentDataPipePayloads(input: ExperimentDataPipePayloadsInput): Array<{
  experimentID: string;
  filename: string;
  data: string;
}> {
  return input.files.map((file) => ({
    experimentID: input.experimentId,
    filename: file.filename,
    data: file.data,
  }));
}

function createSessionCsv(input: ExperimentCsvInput): string {
  const firstResult = input.trialResults.map((trial) => trial.result).find(isLayoutTaskResult);
  return csv(
    [
      "participant_id",
      "session_id",
      "experiment_id",
      "started_at",
      "ended_at",
      "duration_ms",
      "tutorial_completed",
      "tutorial_duration_ms",
      "n_trials",
      "trial_order_json",
      "user_agent",
      "viewport_width",
      "viewport_height",
      "screen_width",
      "screen_height",
    ],
    [
      [
        input.participantId,
        input.sessionId,
        input.experimentId,
        input.startTime,
        input.endTime,
        input.endTime - input.startTime,
        input.tutorialCompleted,
        input.tutorialDurationMs,
        input.trialResults.length,
        JSON.stringify(input.trialOrder),
        firstResult?.user_agent,
        firstResult?.display?.viewport.width,
        firstResult?.display?.viewport.height,
        firstResult?.display?.screen.width,
        firstResult?.display?.screen.height,
      ],
    ],
  );
}

function createResultsCsv(input: ExperimentCsvInput): string {
  const rows: CsvValue[][] = [];
  input.trialResults.forEach((trial, trialIndex) => {
    if (!isLayoutTaskResult(trial.result)) {
      return;
    }

    for (const objectId of Object.keys(trial.result.final_state)) {
      const context = trial.result.context?.objects[objectId];
      const final = getFinalObjectValues(trial.result, objectId);
      rows.push([
        input.participantId,
        input.sessionId,
        input.experimentId,
        trialIndex,
        trial.result.task_id,
        trial.result.qid,
        objectId,
        trial.result.confidence?.[objectId],
        context?.origin.x,
        context?.origin.y,
        context?.origin.r,
        context?.movement_step,
        context?.rotation_step,
        final.x,
        final.y,
        final.r,
        final.dxSteps,
        final.dySteps,
        final.rotationSteps,
        trial.result.start_time,
        trial.result.end_time,
        trial.result.duration_ms,
        trial.result.flow?.mode,
        trial.result.flow?.preview_duration_ms,
        trial.result.task_config_hash,
        trial.encoded,
        trial.hash8,
      ]);
    }
  });

  return csv(
    [
      "participant_id",
      "session_id",
      "experiment_id",
      "trial_index",
      "task_id",
      "qid",
      "object_id",
      "confidence",
      "origin_x",
      "origin_y",
      "origin_rotation",
      "movement_step",
      "rotation_step",
      "final_x",
      "final_y",
      "final_rotation",
      "relative_dx_steps",
      "relative_dy_steps",
      "relative_rotation_steps",
      "start_time",
      "end_time",
      "duration_ms",
      "flow_mode",
      "preview_duration_ms",
      "task_config_hash",
      "encoded",
      "hash8",
    ],
    rows,
  );
}

function createEventsCsv(input: ExperimentCsvInput): string {
  const rows: CsvValue[][] = [];
  input.trialResults.forEach((trial, trialIndex) => {
    if (!isLayoutTaskResult(trial.result)) {
      return;
    }

    for (const event of trial.result.events) {
      rows.push([
        input.participantId,
        input.sessionId,
        input.experimentId,
        trialIndex,
        trial.result.task_id,
        trial.result.qid,
        event.i,
        event.t,
        event.object,
        event.action,
        event.valid,
        event.blocked_reason,
        event.before?.x,
        event.before?.y,
        event.before?.r,
        event.after?.x,
        event.after?.y,
        event.after?.r,
        event.offsets?.xSteps,
        event.offsets?.ySteps,
        event.offsets?.rotationSteps,
        event.pointer?.clientX,
        event.pointer?.clientY,
        event.pointer?.worldX,
        event.pointer?.worldY,
      ]);
    }
  });

  return csv(
    [
      "participant_id",
      "session_id",
      "experiment_id",
      "trial_index",
      "task_id",
      "qid",
      "event_index",
      "event_time_ms",
      "object_id",
      "action",
      "valid",
      "blocked_reason",
      "before_x",
      "before_y",
      "before_rotation",
      "after_x",
      "after_y",
      "after_rotation",
      "relative_dx_steps",
      "relative_dy_steps",
      "relative_rotation_steps",
      "pointer_client_x",
      "pointer_client_y",
      "pointer_world_x",
      "pointer_world_y",
    ],
    rows,
  );
}

type CsvValue = string | number | boolean | undefined;

function csv(headers: string[], rows: CsvValue[][]): string {
  return `${headers.join(",")}\n${rows.map((row) => row.map((value) => formatCsvCell(value ?? "")).join(",")).join("\n")}\n`;
}

function isLayoutTaskResult(value: unknown): value is LayoutTaskResult {
  return Boolean(value && typeof value === "object" && (value as { schema?: unknown }).schema === "layouttask.result.v1");
}

function getFinalObjectValues(result: LayoutTaskResult, objectId: string): {
  x?: number;
  y?: number;
  r?: number;
  dxSteps?: number;
  dySteps?: number;
  rotationSteps?: number;
} {
  if (isRelativeFinalState(result.final_state)) {
    const state = result.final_state[objectId];
    return {
      dxSteps: state?.dx_steps,
      dySteps: state?.dy_steps,
      rotationSteps: state?.rotation_steps,
    };
  }

  const state = (result.final_state as AbsoluteFinalState)[objectId];
  return {
    x: state?.x,
    y: state?.y,
    r: state?.r,
    dxSteps: state?.offsets?.xSteps,
    dySteps: state?.offsets?.ySteps,
    rotationSteps: state?.offsets?.rotationSteps,
  };
}

function isRelativeFinalState(value: LayoutTaskResult["final_state"]): value is RelativeFinalState {
  const first = Object.values(value)[0] as FinalObjectState | RelativeFinalObjectState | undefined;
  return Boolean(first && "dx_steps" in first);
}

function formatCsvCell(value: CsvValue): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "layout-task";
}
