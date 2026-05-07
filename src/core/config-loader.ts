import type {
  BackgroundLibraryConfig,
  BehaviorLibraryConfig,
  ManifestConfig,
  MinViewportRequirement,
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
import { resolveMessages } from "./messages";

// ConfigLoader is the authoring-config entry point.
// 它把 manifest / task / asset / behavior 这些分散文件 resolve 成 RuntimeTaskConfig。
export interface ConfigLoaderOptions {
  baseUrl: string;
  manifestPath?: string;
  fetchImpl?: typeof fetch;
  moduleImportImpl?: (url: string) => Promise<{ default?: unknown }>;
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
  record_display_changes: true,
  record_page_timing: true,
  record_user_agent: true,
  record_blocked_events: false,
};

const DEFAULT_OUTPUT = {
  encoding: "lz-uri" as const,
  detail: "final-only" as const,
  final_state: "relative" as const,
};

const DEFAULT_DATA_PIPE_SAVE = {
  endpoint: "https://pipe.jspsych.org/api/data/",
  filename_prefix: "layout-task",
  payload_format: "json-envelope" as const,
  save_encoded: true,
  save_result: true,
};

const DEFAULT_FEEDBACK = {
  limit_messages: {
    move_left: "You cannot move further left.",
    move_right: "You cannot move further right.",
    move_up: "You cannot move further up.",
    move_down: "You cannot move further down.",
    rotate_cw: "You cannot rotate further clockwise.",
    rotate_ccw: "You cannot rotate further counter-clockwise.",
  },
};

const DEFAULT_DISPLAY_IMAGE = {
  enabled: true,
  alt: "Reference image",
  record_metrics: true,
};

const DEFAULT_REQUIREMENTS = {};

export class ConfigLoader {
  private readonly baseUrl: string;
  private readonly manifestPath: string;
  private readonly fetchImpl: typeof fetch;
  private readonly moduleImportImpl: (url: string) => Promise<{ default?: unknown }>;

  constructor(options: ConfigLoaderOptions) {
    this.baseUrl = options.baseUrl;
    this.manifestPath = options.manifestPath ?? "manifest.json";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.moduleImportImpl = options.moduleImportImpl ?? ((url) => import(/* @vite-ignore */ url) as Promise<{ default?: unknown }>);
  }

  async loadManifest(): Promise<ManifestConfig> {
    const data = await this.loadConfigFile<unknown>(this.manifestPath);
    return validateManifest(data);
  }

  async loadRuntimeConfig(selection: TaskSelection): Promise<RuntimeTaskConfig> {
    // Selection rule: task_id first, then qid, then first task as fallback.
    // 这样独立页面和问卷 URL 都可以宽松地指向同一个 task。
    const manifest = await this.loadManifest();
    const taskEntry =
      manifest.tasks.find((task) => task.task_id === selection.taskId) ??
      manifest.tasks.find((task) => task.qid === selection.qid) ??
      manifest.tasks[0];

    // Static config files load in parallel after the task entry is known.
    // task file 可以是 JSON，也可以是 trusted JS module；libraries 继续推荐 JSON。
    const [taskData, objectData, backgroundData, behaviorData] = await Promise.all([
      this.loadConfigFile<unknown>(taskEntry.file),
      this.loadConfigFile<unknown>(manifest.asset_library),
      this.loadConfigFile<unknown>(manifest.background_library),
      this.loadConfigFile<unknown>(manifest.behavior_library),
    ]);

    const task = validateTask(taskData);
    const objectLibrary = objectLibrarySchema.parse(objectData) as ObjectLibraryConfig;
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

  private async loadConfigFile<T>(relativePath: string): Promise<T> {
    if (isJavaScriptConfigPath(relativePath)) {
      return this.importConfigModule<T>(relativePath);
    }

    return this.fetchJson<T>(relativePath);
  }

  private async fetchJson<T>(relativePath: string): Promise<T> {
    // JSON remains the safest default: static, data-only, and easy for decoder tooling to mirror.
    // JSON 仍是默认格式；JS config 只给可信项目维护者使用。
    const url = new URL(relativePath, this.baseUrl).toString();
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Failed to load ${relativePath}: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  private async importConfigModule<T>(relativePath: string): Promise<T> {
    const url = new URL(relativePath, this.baseUrl);
    url.searchParams.set("layoutTaskConfigVersion", String(Date.now()));

    // JS config is executable code. 这里明确只支持 trusted static config，不支持用户上传配置。
    const module = await this.moduleImportImpl(url.toString());
    if (!("default" in module)) {
      throw new Error(`Config module ${relativePath} must export a default config object`);
    }

    return module.default as T;
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
  // Runtime config is the fully linked version of authoring config:
  // asset ids -> resolved assets, behavior ids -> concrete behavior blocks, defaults applied.
  // 也就是“浏览器真正能直接渲染和运行”的那一层 shape。
  const assetBaseUrl = input.manifest.asset_base_url ?? input.baseUrl;
  const resolvedBackgroundAsset = input.backgroundLibrary.backgrounds[input.task.background.asset];
  const resolvedObjects = input.task.objects.map((objectConfig) => {
    const asset = input.objectLibrary.objects[objectConfig.asset];
    const behavior = input.behaviorLibrary.behaviors[objectConfig.behavior];

    return {
      id: objectConfig.id,
      assetId: objectConfig.asset,
      asset: {
        ...asset,
        srcResolved: resolveAssetUrl(assetBaseUrl, asset.src),
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
        srcResolved: resolveAssetUrl(assetBaseUrl, resolvedBackgroundAsset.src),
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
    dataSave: resolveDataSaveConfig(input.task.data_save),
    feedback: {
      ...DEFAULT_FEEDBACK,
      ...input.task.feedback,
      limit_messages: {
        ...DEFAULT_FEEDBACK.limit_messages,
        ...input.task.feedback?.limit_messages,
      },
    },
    messages: resolveMessages(input.task.messages),
    requirements: {
      ...DEFAULT_REQUIREMENTS,
      min_viewport: resolveMinViewportRequirement(input.task.requirements?.min_viewport),
    },
    displayImage: input.task.display_image
      ? {
          ...DEFAULT_DISPLAY_IMAGE,
          ...input.task.display_image,
          srcResolved: resolveAssetUrl(assetBaseUrl, input.task.display_image.src),
        }
      : undefined,
  };
}

function resolveDataSaveConfig(dataSave: TaskConfig["data_save"]): RuntimeTaskConfig["dataSave"] {
  if (!dataSave || dataSave.mode === "copy") {
    return { mode: "copy" };
  }

  return {
    mode: "datapipe",
    experiment_id: dataSave.experiment_id,
    endpoint: dataSave.endpoint ?? DEFAULT_DATA_PIPE_SAVE.endpoint,
    filename_prefix: dataSave.filename_prefix ?? DEFAULT_DATA_PIPE_SAVE.filename_prefix,
    payload_format: dataSave.payload_format ?? DEFAULT_DATA_PIPE_SAVE.payload_format,
    save_encoded: dataSave.save_encoded ?? DEFAULT_DATA_PIPE_SAVE.save_encoded,
    save_result: dataSave.save_result ?? DEFAULT_DATA_PIPE_SAVE.save_result,
  };
}

function resolveAssetUrl(assetBaseUrl: string, relativePath: string): string {
  return new URL(relativePath, assetBaseUrl).toString();
}

function isJavaScriptConfigPath(path: string): boolean {
  const cleanPath = path.split(/[?#]/, 1)[0].toLowerCase();
  return cleanPath.endsWith(".js") || cleanPath.endsWith(".mjs");
}

function resolveMinViewportRequirement(
  requirement?: MinViewportRequirement,
): RuntimeTaskConfig["requirements"]["min_viewport"] {
  if (!requirement) {
    return undefined;
  }

  return {
    width: requirement.width,
    height: requirement.height,
    mode: requirement.mode ?? "warn",
    message: requirement.message,
  };
}
