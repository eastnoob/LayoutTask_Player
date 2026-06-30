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
  assignIfDefined(task, "completion", mergeConfig(batch.shared.completion, trial.completion));
  assignIfDefined(task, "recording", mergeConfig(batch.shared.recording, trial.recording));
  assignIfDefined(task, "output", mergeConfig(batch.shared.output, trial.output));
  assignIfDefined(task, "data_save", trial.data_save ?? batch.shared.data_save);
  assignIfDefined(task, "display_image", trial.display_image);
  assignIfDefined(task, "flow", trial.flow ?? batch.shared.flow);
  assignIfDefined(task, "stage", mergeConfig(batch.shared.stage, trial.stage));
  assignIfDefined(task, "messages", mergeConfig(batch.shared.messages, trial.messages));
  assignIfDefined(task, "requirements", mergeConfig(batch.shared.requirements, trial.requirements));
  assignIfDefined(task, "collision", trial.collision);

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

  assignIfDefined(runtimeObject, "role", object.role);
  assignIfDefined(runtimeObject, "group_id", object.group_id);
  assignIfDefined(runtimeObject, "rotation", object.rotation);
  assignIfDefined(runtimeObject, "width", object.width);
  assignIfDefined(runtimeObject, "height", object.height);
  assignIfDefined(runtimeObject, "anchor", object.anchor);
  assignIfDefined(runtimeObject, "collision", object.collision);

  return runtimeObject;
}

function compileScoringObjects(trial: BatchTrialConfig): Record<string, ScoringReferenceObject> {
  const objects: Record<string, ScoringReferenceObject> = {};
  const includedObjectIds = new Set(trial.scoring?.include_objects ?? []);

  for (const object of trial.objects) {
    const trialObjectScoring = trial.scoring?.objects?.[object.id];
    const scoring = mergeObjectScoring(trialObjectScoring, object.scoring);
    const target = object.target ?? scoring?.target;
    const hasAnnotation =
      object.role !== undefined ||
      object.group_id !== undefined ||
      target !== undefined ||
      scoring?.tolerance !== undefined ||
      scoring?.labels !== undefined;

    if (
      !shouldIncludeScoringObject({
        hasAnnotation,
        includedByTrial: includedObjectIds.has(object.id),
        objectEnabled: object.scoring?.enabled ?? trialObjectScoring?.enabled,
        trialEnabled: trial.scoring?.enabled,
      })
    ) {
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

function shouldIncludeScoringObject(input: {
  hasAnnotation: boolean;
  includedByTrial: boolean;
  objectEnabled?: boolean;
  trialEnabled?: boolean;
}): boolean {
  if (input.objectEnabled === false) {
    return false;
  }

  if (input.objectEnabled === true || input.includedByTrial) {
    return true;
  }

  if (input.trialEnabled === false) {
    return false;
  }

  return input.hasAnnotation;
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

function mergeConfig<T extends object>(sharedValue: T | undefined, trialValue: T | undefined): T | undefined {
  return sharedValue && trialValue ? { ...sharedValue, ...trialValue } : (trialValue ?? sharedValue);
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
