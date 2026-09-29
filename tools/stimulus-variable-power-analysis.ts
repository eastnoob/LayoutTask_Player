export type DesignRow = { combination_id: string } & Record<string, string>;
export type TaskMatch = { combination_id: string; task_id: string };
export type RawResultRow = {
  trial_type?: string;
  participant_id?: string;
  session_id?: string;
  trial_index?: string;
  task_id: string;
  result_json: string | { final_state?: Record<string, unknown> };
};
export type Observation = RawResultRow & Record<string, unknown> & {
  combination_id: string;
  model_id: string;
  object_id: string;
  point_id?: string;
};
export const CORE_PREDICTORS = [
  "targetFurnitureSilhouetteVisibility",
  "furnitureGroupSilhouetteVisibility",
  "asymmetricCueVisibilityAngleWeighted",
  "featureCueVisibility",
  "relationVisibilityTotal",
  "PerspectiveRank",
  "volumeAxisRetention",
  "volumeAngularSeparation",
] as const;

export function matchTasksToDesign(designRows: DesignRow[], taskIds: string[]): TaskMatch[] {
  const design = new Map(designRows.map((row) => [row.combination_id, row]));
  if (design.size !== designRows.length) throw new Error("duplicate combination_id");
  const matches = taskIds.map((task_id) => {
    const combination_id = task_id.replace(/^scene_/, "");
    if (!design.has(combination_id)) throw new Error(`missing design for ${task_id}`);
    return { combination_id, task_id };
  });
  if (new Set(matches.map((match) => match.combination_id)).size !== matches.length) {
    throw new Error("duplicate task combination");
  }
  return matches;
}

export function buildObservationTable(rawRows: RawResultRow[], designRows: DesignRow[]): Observation[] {
  const designByCombination = new Map(designRows.map((row) => [row.combination_id, row]));
  const observations: Observation[] = [];
  for (const row of rawRows) {
    if (row.trial_type !== "formal") continue;
    const combination_id = row.task_id.replace(/^scene_/, "");
    const design = designByCombination.get(combination_id);
    if (!design) throw new Error(`missing design for ${row.task_id}`);
    const result = typeof row.result_json === "string" ? JSON.parse(row.result_json) : row.result_json;
    for (const object_id of Object.keys(result.final_state ?? {})) {
      const modelMatch = object_id.match(/_m(01|03|04|05)_variable$/i);
      if (!modelMatch) continue;
      const model_id = `M${modelMatch[1]}`;
      const prefix = `${model_id}.`;
      const predictors = Object.fromEntries(Object.entries(design)
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key.slice(prefix.length), Number.isFinite(Number(value)) ? Number(value) : value]));
      observations.push({ ...row, ...predictors, combination_id, model_id, object_id, point_id: String(design[`${prefix}point_id`] ?? "") });
    }
  }
  return observations;
}

export function scorePosition(actual: { dx_steps: number; dy_steps: number }, target: { dx_steps: number; dy_steps: number }) {
  const x_error = Math.abs(actual.dx_steps - target.dx_steps);
  const y_error = Math.abs(actual.dy_steps - target.dy_steps);
  return { x_error, y_error, position_error: x_error + y_error, position_exact: x_error === 0 && y_error === 0 };
}

export function scoreRotation(actualSteps: number, targetSteps: number) {
  const raw = Math.abs(actualSteps - targetSteps) % 8;
  const rotation_error_steps = Math.min(raw, 8 - raw);
  return { rotation_error_steps, rotation_exact: rotation_error_steps === 0 };
}

export function scoreObservation(
  actual: { offsets?: { xSteps?: number; ySteps?: number; rotationSteps?: number } },
  target: { dx_steps: number; dy_steps: number; rotation_steps: number },
) {
  const offsets = actual.offsets ?? {};
  const position = scorePosition(
    { dx_steps: Number(offsets.xSteps ?? 0), dy_steps: Number(offsets.ySteps ?? 0) },
    { dx_steps: target.dx_steps, dy_steps: target.dy_steps },
  );
  const rotation = scoreRotation(Number(offsets.rotationSteps ?? 0), target.rotation_steps);
  return { ...position, ...rotation };
}

export type PowerSimulationOptions = {
  seed: number;
  candidates: number[];
  repetitions: number;
  sceneCount: number;
  modelCount: number;
  participantSummaries?: Array<{
    position_error: number;
    rotation_error_steps: number;
    position_exact_rate: number;
    rotation_exact_rate: number;
  }>;
  targets?: {
    position_error_half_width: number;
    rotation_error_half_width: number;
    position_exact_half_width: number;
    rotation_exact_half_width: number;
  };
};

export type PowerSimulationResult = PowerSimulationOptions["targets"] & {
  n: number;
  repetitions: number;
  scene_count: number;
  model_count: number;
  position_power: number;
  rotation_power: number;
  position_exact_power: number;
  rotation_exact_power: number;
};

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function halfWidth(values: number[]) {
  if (values.length < 2) return Number.POSITIVE_INFINITY;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return 1.96 * Math.sqrt(variance / values.length);
}

function defaultParticipantSummaries() {
  return [
    { position_error: 1.1, rotation_error_steps: 0.9, position_exact_rate: 0.38, rotation_exact_rate: 0.44 },
    { position_error: 1.4, rotation_error_steps: 1.2, position_exact_rate: 0.31, rotation_exact_rate: 0.36 },
    { position_error: 0.8, rotation_error_steps: 0.7, position_exact_rate: 0.51, rotation_exact_rate: 0.56 },
    { position_error: 1.8, rotation_error_steps: 1.5, position_exact_rate: 0.23, rotation_exact_rate: 0.29 },
    { position_error: 1.0, rotation_error_steps: 1.0, position_exact_rate: 0.42, rotation_exact_rate: 0.48 },
    { position_error: 1.3, rotation_error_steps: 1.1, position_exact_rate: 0.35, rotation_exact_rate: 0.41 },
  ];
}

export function simulatePower(options: PowerSimulationOptions): PowerSimulationResult[] {
  if (!Number.isInteger(options.repetitions) || options.repetitions < 1) throw new Error("repetitions must be positive");
  if (!options.candidates.length || options.candidates.some((n) => !Number.isInteger(n) || n < 1)) throw new Error("candidates must be positive integers");
  const targets = options.targets ?? {
    position_error_half_width: 0.25,
    rotation_error_half_width: 0.25,
    position_exact_half_width: 0.08,
    rotation_exact_half_width: 0.08,
  };
  const pilot = options.participantSummaries?.length ? options.participantSummaries : defaultParticipantSummaries();
  const results: PowerSimulationResult[] = [];
  for (const n of options.candidates) {
    let stablePosition = 0;
    let stableRotation = 0;
    let stablePositionExact = 0;
    let stableRotationExact = 0;
    const random = seededRandom(options.seed + n * 1009);
    for (let repetition = 0; repetition < options.repetitions; repetition += 1) {
      const sample = Array.from({ length: n }, () => pilot[Math.floor(random() * pilot.length)]);
      if (halfWidth(sample.map((row) => row.position_error)) <= targets.position_error_half_width) stablePosition += 1;
      if (halfWidth(sample.map((row) => row.rotation_error_steps)) <= targets.rotation_error_half_width) stableRotation += 1;
      if (halfWidth(sample.map((row) => row.position_exact_rate)) <= targets.position_exact_half_width) stablePositionExact += 1;
      if (halfWidth(sample.map((row) => row.rotation_exact_rate)) <= targets.rotation_exact_half_width) stableRotationExact += 1;
    }
    results.push({
      ...targets,
      n,
      repetitions: options.repetitions,
      scene_count: options.sceneCount,
      model_count: options.modelCount,
      position_power: stablePosition / options.repetitions,
      rotation_power: stableRotation / options.repetitions,
      position_exact_power: stablePositionExact / options.repetitions,
      rotation_exact_power: stableRotationExact / options.repetitions,
    });
  }
  return results;
}

export function auditPredictors(rows: Record<string, unknown>[]) {
  const variables = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => !["model_id", "object_id", "point_id"].includes(key));
  return variables.map((variable) => {
    const values = rows.map((row) => row[variable]).filter((value): value is string | number => value !== undefined && value !== null);
    const unique = new Set(values.map(String)).size;
    const category = variable.startsWith("audit.")
      ? "excluded_namespace"
      : unique < 2 ? "excluded_constant"
        : (CORE_PREDICTORS as readonly string[]).includes(variable) ? "core"
          : ["asymmetricCueVisibility", "relationPerspectiveTotal"].includes(variable) ? "exploratory" : "other";
    return { variable, n: values.length, unique, category };
  });
}

export function summarizeOutcomes(rows: Array<{ model_id: string; position_error: number; rotation_error_steps: number; position_exact: boolean; rotation_exact: boolean }>) {
  const groups = new Map<string, typeof rows>();
  for (const row of rows) groups.set(row.model_id, [...(groups.get(row.model_id) ?? []), row]);
  return [...groups.entries()].map(([model_id, group]) => ({
    model_id,
    n: group.length,
    mean_position_error: group.reduce((sum, row) => sum + row.position_error, 0) / group.length,
    mean_rotation_error_steps: group.reduce((sum, row) => sum + row.rotation_error_steps, 0) / group.length,
    position_exact_rate: group.filter((row) => row.position_exact).length / group.length,
    rotation_exact_rate: group.filter((row) => row.rotation_exact).length / group.length,
  }));
}
