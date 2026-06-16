import type {
  BatchConfig,
  BatchObjectConfig,
  BatchTrialConfig,
  CompiledBatch,
  ObjectScoringConfig,
  ScoringReferenceConfig,
  ScoringReferenceObject,
} from "../types/batch";
import type { ManifestConfig, TaskConfig, TaskObjectConfig, WorldConfig } from "../types/config";

export function compileBatch(batch: BatchConfig): CompiledBatch {
  const tasks = batch.trials.map((trial) => ({
    file: getTaskFile(trial.task_id),
    config: compileTrial(batch, trial),
  }));

  const manifest: ManifestConfig = {
    schema: "layouttask.manifest.v1",
    experiment_id: batch.experiment_id,
    asset_library: batch.shared.asset_library,
    background_library: batch.shared.background_library,
    behavior_library: batch.shared.behavior_library,
    tasks: tasks.map((task) => ({
      qid: task.config.qid,
      task_id: task.config.task_id,
      file: task.file,
    })),
  };
  assignIfDefined(manifest, "title", batch.title);
  assignIfDefined(manifest, "config_version", batch.config_version);

  const scoringReference: ScoringReferenceConfig = {
    schema: "layouttask.scoring-reference.v1",
    experiment_id: batch.experiment_id,
    tasks: Object.fromEntries(
      batch.trials.map((trial) => [
        trial.task_id,
        {
          qid: trial.qid,
          ...(trial.metadata !== undefined ? { metadata: trial.metadata } : {}),
          objects: compileScoringObjects(trial),
        },
      ]),
    ),
  };

  return {
    manifest,
    tasks,
    scoringReference,
    report: {
      schema: "layouttask.generation-report.v1",
      experiment_id: batch.experiment_id,
      task_count: tasks.length,
      generated_files: [
        "manifest.json",
        ...tasks.map((task) => task.file),
        "scoring/scoring-reference.json",
        "generation-report.json",
      ],
      warnings: [],
    },
  };
}

function compileTrial(batch: BatchConfig, trial: BatchTrialConfig): TaskConfig {
  const task: TaskConfig = {
    schema: "layouttask.task.v1",
    task_id: trial.task_id,
    qid: trial.qid,
    world: trial.world ?? requireSharedWorld(batch.shared.world),
    background: trial.background,
    objects: trial.objects.map(toRuntimeObject),
  };

  assignIfDefined(task, "title", trial.title);
  assignIfDefined(task, "completion", trial.completion ?? batch.shared.completion);
  assignIfDefined(task, "recording", trial.recording ?? batch.shared.recording);
  assignIfDefined(task, "output", trial.output ?? batch.shared.output);
  assignIfDefined(task, "data_save", trial.data_save ?? batch.shared.data_save);
  assignIfDefined(task, "display_image", trial.display_image);
  assignIfDefined(task, "flow", trial.flow ?? batch.shared.flow);
  assignIfDefined(task, "stage", trial.stage ?? batch.shared.stage);
  assignIfDefined(task, "messages", trial.messages ?? batch.shared.messages);
  assignIfDefined(task, "requirements", trial.requirements ?? batch.shared.requirements);

  return task;
}

function toRuntimeObject(object: BatchObjectConfig): TaskObjectConfig {
  const runtimeObject: TaskObjectConfig = {
    id: object.id,
    asset: object.asset,
    x: object.x,
    y: object.y,
    behavior: object.behavior,
  };

  assignIfDefined(runtimeObject, "rotation", object.rotation);
  assignIfDefined(runtimeObject, "width", object.width);
  assignIfDefined(runtimeObject, "height", object.height);
  assignIfDefined(runtimeObject, "anchor", object.anchor);

  return runtimeObject;
}

function compileScoringObjects(trial: BatchTrialConfig): Record<string, ScoringReferenceObject> {
  const objects: Record<string, ScoringReferenceObject> = {};

  for (const object of trial.objects) {
    const scoring = mergeObjectScoring(trial.scoring?.objects?.[object.id], object.scoring);
    const target = object.target ?? scoring?.target;
    const hasReference =
      object.role !== undefined ||
      object.group_id !== undefined ||
      target !== undefined ||
      scoring?.tolerance !== undefined ||
      scoring?.labels !== undefined;

    if (!hasReference) {
      continue;
    }

    const reference: ScoringReferenceObject = {};
    assignIfDefined(reference, "role", object.role);
    assignIfDefined(reference, "group_id", object.group_id);
    assignIfDefined(reference, "target", target);
    assignIfDefined(reference, "tolerance", scoring?.tolerance ?? trial.scoring?.default_tolerance);
    assignIfDefined(reference, "labels", scoring?.labels);

    objects[object.id] = reference;
  }

  return objects;
}

function mergeObjectScoring(
  trialScoring?: ObjectScoringConfig,
  objectScoring?: ObjectScoringConfig,
): ObjectScoringConfig | undefined {
  if (!trialScoring) {
    return objectScoring;
  }

  if (!objectScoring) {
    return trialScoring;
  }

  return {
    ...trialScoring,
    ...objectScoring,
    target: objectScoring.target ?? trialScoring.target,
    tolerance: objectScoring.tolerance ?? trialScoring.tolerance,
    labels:
      trialScoring.labels || objectScoring.labels
        ? {
            ...trialScoring.labels,
            ...objectScoring.labels,
          }
        : undefined,
  };
}

function assignIfDefined<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function requireSharedWorld(world: WorldConfig | undefined): WorldConfig {
  if (!world) {
    throw new Error("Missing shared world");
  }

  return world;
}

function getTaskFile(taskId: string): string {
  return `tasks/${taskId}.json`;
}
