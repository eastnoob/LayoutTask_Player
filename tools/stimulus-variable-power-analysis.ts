import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parse as parseCsv } from "csv-parse/sync";
import { stringify as stringifyCsv } from "csv-stringify/sync";

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
export const PREREGISTERED_PREDICTORS = [
  "relationVisibilityTotal",
  "relationPerspectiveTotal",
  "featureCueVisibility",
  "asymmetricCueVisibilityAngleWeighted",
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

export type PowerSimulationResult = {
  n: number;
  repetitions: number;
  scene_count: number;
  model_count: number;
  position_error_half_width: number;
  rotation_error_half_width: number;
  position_exact_half_width: number;
  rotation_exact_half_width: number;
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

export type ScoringReference = {
  tasks: Record<string, { objects?: Record<string, { target?: { relative?: { dx_steps: number; dy_steps: number; rotation_steps: number } } }> }>;
};

export type ScoredObservation = Observation & ReturnType<typeof scoreObservation>;

export function scoreObservations(rawRows: RawResultRow[], designRows: DesignRow[], scoringReference: ScoringReference): ScoredObservation[] {
  return buildObservationTable(rawRows, designRows).map((observation) => {
    const task = scoringReference.tasks[observation.task_id];
    const target = task?.objects?.[observation.object_id]?.target?.relative;
    if (!target) throw new Error(`missing target for ${observation.task_id}/${observation.object_id}`);
    const result = typeof observation.result_json === "string" ? JSON.parse(observation.result_json) : observation.result_json;
    return { ...observation, ...scoreObservation(result.final_state?.[observation.object_id] ?? {}, target) };
  });
}

function participantSummaries(rows: ScoredObservation[]) {
  const groups = new Map<string, ScoredObservation[]>();
  for (const row of rows) {
    const participant = row.participant_id ?? "unknown";
    groups.set(participant, [...(groups.get(participant) ?? []), row]);
  }
  return [...groups.values()].map((group) => ({
    position_error: mean(group.map((row) => row.position_error)),
    rotation_error_steps: mean(group.map((row) => row.rotation_error_steps)),
    position_exact_rate: group.filter((row) => row.position_exact).length / group.length,
    rotation_exact_rate: group.filter((row) => row.rotation_exact).length / group.length,
  }));
}

export type AnalysisBundle = {
  matches: TaskMatch[];
  observations: ScoredObservation[];
  predictorAudit: ReturnType<typeof auditPredictors>;
  predictorAssociations: ReturnType<typeof summarizePredictorAssociations>;
  outcomeSummary: ReturnType<typeof summarizeOutcomes>;
  power: PowerSimulationResult[];
};

function correlation(values: number[], outcomes: number[]) {
  const xMean = mean(values);
  const yMean = mean(outcomes);
  const numerator = values.reduce((sum, value, index) => sum + (value - xMean) * (outcomes[index] - yMean), 0);
  const xDenominator = Math.sqrt(values.reduce((sum, value) => sum + (value - xMean) ** 2, 0));
  const yDenominator = Math.sqrt(outcomes.reduce((sum, value) => sum + (value - yMean) ** 2, 0));
  return xDenominator && yDenominator ? numerator / (xDenominator * yDenominator) : null;
}

export function summarizePredictorAssociations(rows: ScoredObservation[]) {
  const variables = [...CORE_PREDICTORS, "asymmetricCueVisibility", "relationPerspectiveTotal"];
  return variables.map((variable) => {
    const paired = rows.map((row) => ({ x: Number(row[variable]), row })).filter((item) => Number.isFinite(item.x));
    const position = correlation(paired.map((item) => item.x), paired.map((item) => item.row.position_error));
    const rotation = correlation(paired.map((item) => item.x), paired.map((item) => item.row.rotation_error_steps));
    const positionExact = correlation(paired.map((item) => item.x), paired.map((item) => item.row.position_exact ? 1 : 0));
    const rotationExact = correlation(paired.map((item) => item.x), paired.map((item) => item.row.rotation_exact ? 1 : 0));
    return { variable, n: paired.length, position_error_r: position, rotation_error_r: rotation, position_exact_r: positionExact, rotation_exact_r: rotationExact };
  });
}

export function buildAnalysisBundle(input: {
  rawRows: RawResultRow[];
  designRows: DesignRow[];
  scoringReference: ScoringReference;
}): AnalysisBundle {
  const formalRows = input.rawRows.filter((row) => row.trial_type === "formal");
  if (!formalRows.length) throw new Error("formal raw results are required");
  const taskIds = [...new Set(formalRows.map((row) => row.task_id))];
  const matches = matchTasksToDesign(input.designRows, taskIds);
  const observations = scoreObservations(formalRows, input.designRows, input.scoringReference);
  if (!observations.length) throw new Error("formal raw results contain no variable-object observations");
  const predictorRows = observations.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) =>
    (CORE_PREDICTORS as readonly string[]).includes(key) || ["asymmetricCueVisibility", "relationPerspectiveTotal"].includes(key) || key.startsWith("audit."))));
  return {
    matches,
    observations,
    predictorAudit: auditPredictors(predictorRows),
    predictorAssociations: summarizePredictorAssociations(observations),
    outcomeSummary: summarizeOutcomes(observations),
    power: simulatePower({
      seed: 20260929,
      candidates: [4, 6, 8, 12, 16, 20, 24, 30, 40],
      repetitions: 1000,
      sceneCount: taskIds.length,
      modelCount: new Set(observations.map((row) => row.model_id)).size,
      participantSummaries: participantSummaries(observations),
    }),
  };
}

export function renderAnalysisReport(bundle: AnalysisBundle) {
  const participantCount = new Set(bundle.observations.map((row) => row.participant_id)).size;
  const formalPresentations = new Set(bundle.observations.map((row) => `${row.participant_id}/${row.session_id}/${row.trial_index}`)).size;
  const repeatedScenes = bundle.observations.reduce((counts, row) => counts.set(row.task_id, (counts.get(row.task_id) ?? 0) + 1), new Map<string, number>());
  const repeats = [...repeatedScenes.values()].filter((count) => count > 1).length;
  const powerRows = bundle.power.map((row) => `| ${row.n} | ${(row.position_power * 100).toFixed(1)}% | ${(row.rotation_power * 100).toFixed(1)}% | ${(row.position_exact_power * 100).toFixed(1)}% | ${(row.rotation_exact_power * 100).toFixed(1)}% |`).join("\n");
  const outcomeRows = bundle.outcomeSummary.map((row) => `| ${row.model_id} | ${row.n} | ${row.mean_position_error.toFixed(2)} | ${row.mean_rotation_error_steps.toFixed(2)} | ${(row.position_exact_rate * 100).toFixed(1)}% | ${(row.rotation_exact_rate * 100).toFixed(1)}% |`).join("\n");
  const auditRows = bundle.predictorAudit.map((row) => `| ${row.variable} | ${row.n} | ${row.unique} | ${row.category} |`).join("\n");
  const associationRows = bundle.predictorAssociations.map((row) => `| ${row.variable} | ${row.n} | ${row.position_error_r === null ? "NA" : row.position_error_r.toFixed(3)} | ${row.rotation_error_r === null ? "NA" : row.rotation_error_r.toFixed(3)} | ${row.position_exact_r === null ? "NA" : row.position_exact_r.toFixed(3)} | ${row.rotation_exact_r === null ? "NA" : row.rotation_exact_r.toFixed(3)} |`).join("\n");
  return `# 刺激变量与恢复正确性分析\n\n## 数据完整性\n\n- 独立 participant cluster：${participantCount}。\n- 任务对位：${bundle.matches.length}/23 个正式场景。\n- 逐家具观测：${bundle.observations.length} 行（只含 formal，不含 tutorial）。\n- 正式 presentation：${formalPresentations}；重复场景 presentation：${repeats} 个场景。\n- 位置和旋转误差分开计算；旋转使用 8 步圆周距离。\n\n## 逐模型描述性结果\n\n| 模型 | 观测数 | 平均位置误差（步） | 平均旋转误差（步） | 位置完全正确 | 旋转完全正确 |\n|---|---:|---:|---:|---:|---:|\n${outcomeRows}\n\n## 变量审计\n\n| 变量 | 非空数 | 唯一值数 | 分类 |\n|---|---:|---:|---|\n${auditRows}\n\n## 变量关联筛查\n\n下面是逐家具观测的 Pearson 相关系数，仅用于筛查，不是控制 participant/scene 聚类后的正式效应估计，也不代表因果关系。\n\n| 变量 | n | 位置误差 r | 旋转误差 r | 位置完全正确 r | 旋转完全正确 r |\n|---|---:|---:|---:|---:|---:|\n${associationRows}\n\n## 被试数量模拟\n\n这是**精度稳定性模拟**，不是自动排除规则：以被试为聚类单位进行 bootstrap，保留每个被试的 23 场景 × 4 家具模型结构。表中 power 表示 95% 置信区间半宽达到预设阈值的比例：位置/旋转误差阈值均为 0.25 步，完全正确率阈值均为 0.08。\n\n| 被试数 | 位置误差稳定 | 旋转误差稳定 | 位置完全正确率稳定 | 旋转完全正确率稳定 |\n|---:|---:|---:|---:|---:|\n${powerRows}\n\n当前 bootstrap 显示最小候选 ${bundle.power[0]?.n ?? "NA"} 已达到这些精度阈值，但 pilot 只有 ${participantCount} 个独立 participant cluster，因此不能把这个数当作最终招募承诺；应继续收集 pilot 或预注册正式模型后复核。\n`;
}

function csvRows(text: string) {
  return parseCsv(text, { columns: true, skip_empty_lines: true, bom: true }) as Record<string, string>[];
}

async function runCli() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
  const rawPath = args.get("--raw");
  const designPath = args.get("--design");
  const scoringPath = args.get("--scoring");
  const outputDir = args.get("--out") ?? "analysis/output";
  if (!rawPath || !designPath || !scoringPath) throw new Error("usage: --raw raw_results.csv --design selected_23.csv --scoring scoring-reference.json --out output-dir");
  const rawRows = csvRows(await readFile(rawPath, "utf8")) as RawResultRow[];
  const designRows = csvRows(await readFile(designPath, "utf8")) as DesignRow[];
  const scoringReference = JSON.parse(await readFile(scoringPath, "utf8")) as ScoringReference;
  const bundle = buildAnalysisBundle({ rawRows, designRows, scoringReference });
  await mkdir(outputDir, { recursive: true });
  await writeFile(`${outputDir}/stimulus-observations.csv`, stringifyCsv(bundle.observations.map((row) => ({ participant_id: row.participant_id, session_id: row.session_id, trial_index: row.trial_index, task_id: row.task_id, combination_id: row.combination_id, model_id: row.model_id, point_id: row.point_id, position_error: row.position_error, rotation_error_steps: row.rotation_error_steps, position_exact: row.position_exact, rotation_exact: row.rotation_exact, ...Object.fromEntries([...CORE_PREDICTORS, ...PREREGISTERED_PREDICTORS].map((key) => [key, row[key]])) })), { header: true }));
  await writeFile(`${outputDir}/predictor-audit.csv`, stringifyCsv(bundle.predictorAudit, { header: true }));
  await writeFile(`${outputDir}/outcome-summary.csv`, stringifyCsv(bundle.outcomeSummary, { header: true }));
  await writeFile(`${outputDir}/predictor-associations.csv`, stringifyCsv(bundle.predictorAssociations, { header: true }));
  await writeFile(`${outputDir}/power-simulation.csv`, stringifyCsv(bundle.power, { header: true }));
  await writeFile(`${outputDir}/stimulus-variable-power-analysis.md`, renderAnalysisReport(bundle));
  console.log(`wrote ${outputDir}; matches=${bundle.matches.length}; observations=${bundle.observations.length}`);
}

if (process.argv[1]?.endsWith("stimulus-variable-power-analysis.ts")) void runCli();
