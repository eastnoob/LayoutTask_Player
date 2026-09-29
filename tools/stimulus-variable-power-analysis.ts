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
