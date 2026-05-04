import type {
  BackgroundLibraryConfig,
  BehaviorLibraryConfig,
  ManifestConfig,
  ObjectLibraryConfig,
  TaskConfig,
} from "../types/config";
import type { RuntimeTaskConfig } from "../types/runtime";
import { objectLibrarySchema } from "../schemas/config.schema";
import {
  validateBackgroundLibrary,
  validateBehaviorLibrary,
  validateManifest,
  validateTask,
} from "./config-validator";

export interface ConfigLoaderOptions {
  baseUrl: string;
  manifestPath?: string;
  fetchImpl?: typeof fetch;
}

export interface TaskSelection {
  taskId?: string;
  qid?: string;
}

const DEFAULT_COMPLETION = {
  double_confirm: true,
  lock_after_confirm: true,
  allow_copy_again: true,
};

const DEFAULT_RECORDING = {
  record_events: true,
  record_final_state: true,
  record_display_info: true,
  record_user_agent: true,
  record_blocked_events: false,
};

const DEFAULT_OUTPUT = {
  encoding: "lz-uri" as const,
  detail: "final-only" as const,
  final_state: "relative" as const,
};

export class ConfigLoader {
  private readonly baseUrl: string;
  private readonly manifestPath: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ConfigLoaderOptions) {
    this.baseUrl = options.baseUrl;
    this.manifestPath = options.manifestPath ?? "manifest.json";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async loadManifest(): Promise<ManifestConfig> {
    const data = await this.fetchJson<unknown>(this.manifestPath);
    return validateManifest(data);
  }

  async loadRuntimeConfig(selection: TaskSelection): Promise<RuntimeTaskConfig> {
    const manifest = await this.loadManifest();
    const taskEntry =
      manifest.tasks.find((task) => task.task_id === selection.taskId) ??
      manifest.tasks.find((task) => task.qid === selection.qid) ??
      manifest.tasks[0];

    const [taskData, objectData, backgroundData, behaviorData] = await Promise.all([
      this.fetchJson<unknown>(taskEntry.file),
      this.fetchJson<unknown>(manifest.asset_library),
      this.fetchJson<unknown>(manifest.background_library),
      this.fetchJson<unknown>(manifest.behavior_library),
    ]);

    const task = validateTask(taskData);
    const objectLibrary = objectLibrarySchema.parse(taskData ? objectData : objectData) as ObjectLibraryConfig;
    const backgroundLibrary = validateBackgroundLibrary(backgroundData);
    const behaviorLibrary = validateBehaviorLibrary(behaviorData);

    return resolveRuntimeConfig({
      baseUrl: this.baseUrl,
      manifest,
      objectLibrary,
      backgroundLibrary,
      behaviorLibrary,
      task,
    });
  }

  private async fetchJson<T>(relativePath: string): Promise<T> {
    const url = new URL(relativePath, this.baseUrl).toString();
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Failed to load ${relativePath}: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }
}

interface ResolveRuntimeConfigInput {
  baseUrl: string;
  manifest: ManifestConfig;
  objectLibrary: ObjectLibraryConfig;
  backgroundLibrary: BackgroundLibraryConfig;
  behaviorLibrary: BehaviorLibraryConfig;
  task: TaskConfig;
}

export function resolveRuntimeConfig(input: ResolveRuntimeConfigInput): RuntimeTaskConfig {
  const resolvedBackgroundAsset = input.backgroundLibrary.backgrounds[input.task.background.asset];
  const resolvedObjects = input.task.objects.map((objectConfig) => {
    const asset = input.objectLibrary.objects[objectConfig.asset];
    const behavior = input.behaviorLibrary.behaviors[objectConfig.behavior];

    return {
      id: objectConfig.id,
      assetId: objectConfig.asset,
      asset: {
        ...asset,
        srcResolved: resolveAssetUrl(input.baseUrl, asset.src),
      },
      x: objectConfig.x,
      y: objectConfig.y,
      rotation: objectConfig.rotation ?? 0,
      width: objectConfig.width ?? asset.default_width,
      height: objectConfig.height ?? asset.default_height,
      anchor: objectConfig.anchor ?? asset.anchor ?? "center",
      behaviorId: objectConfig.behavior,
      behavior,
    };
  });

  return {
    schema: "layouttask.runtime.v1",
    experimentId: input.manifest.experiment_id,
    configVersion: input.manifest.config_version,
    qid: input.task.qid,
    taskId: input.task.task_id,
    title: input.task.title,
    baseUrl: input.baseUrl,
    world: input.task.world,
    background: {
      assetId: input.task.background.asset,
      asset: {
        ...resolvedBackgroundAsset,
        srcResolved: resolveAssetUrl(input.baseUrl, resolvedBackgroundAsset.src),
      },
      x: input.task.background.x,
      y: input.task.background.y,
      width: input.task.background.width,
      height: input.task.background.height,
    },
    objects: resolvedObjects,
    completion: {
      ...DEFAULT_COMPLETION,
      ...input.task.completion,
    },
    recording: {
      ...DEFAULT_RECORDING,
      ...input.task.recording,
    },
    output: {
      ...DEFAULT_OUTPUT,
      ...input.task.output,
    },
  };
}

function resolveAssetUrl(baseUrl: string, relativePath: string): string {
  return new URL(relativePath, baseUrl).toString();
}
