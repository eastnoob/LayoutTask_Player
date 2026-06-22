import type {
  BackgroundLibraryConfig,
  BackgroundAssetConfig,
  BehaviorConfig,
  BehaviorLibraryConfig,
  ManifestConfig,
  MinViewportRequirement,
  ObjectLibraryConfig,
  ObjectAssetConfig,
  ObjectCollisionPolygon,
  PartialBehaviorConfig,
  TaskObjectBehaviorConfig,
  TaskConfig,
  ViewBox,
} from "../types/config";
import type { RuntimeTaskConfig } from "../types/runtime";
import { behaviorSchema, objectLibrarySchema } from "../schemas/config.schema";
import {
  validateBackgroundLibrary,
  validateBehaviorLibrary,
  validateManifest,
  validateTask,
} from "./config-validator";
import { parseCollisionSvg } from "./collision-svg";
import { resolveMessages } from "./messages";
import { parseObjectColliderSvg } from "./object-collider-svg";

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

const DEFAULT_STAGE = {
  fit: "contain" as const,
  max_height_ratio: 0.72,
  padding: 16,
};

const DEFAULT_TASK_COLLISION = {
  enabled: false,
  mode: "discrete" as const,
  areas: [],
};

const DEFAULT_OBJECT_COLLISION = {
  enabled: true,
  shape: "box" as const,
  padding: 0,
};

const DEFAULT_PREVIEW_FLOW_CONFIG = {
  preview_duration_sec: 10,
  require_preview_ack: true,
  intro_message:
    "Next, you will have {seconds} seconds to study the image. After the image disappears, reconstruct the scene from memory.",
  intro_confirm_label: "Start preview",
  stage_during_preview: "hidden" as const,
  show_countdown: true,
  message_before: "Next, you will have {seconds} seconds to study the image.",
  message_after: "Please reconstruct the scene from memory.",
};

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
    // ===== 1. Select and fetch authoring files =====
    // Authoring packages stay split for humans/generators: manifest picks a task,
    // then task/assets/behaviors are joined once into browser-ready runtime config.
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

    await this.attachInlineSvgLibraryAssets({
      task,
      objectLibrary,
      backgroundLibrary,
    });

    const runtimeConfig = resolveRuntimeConfig({
      baseUrl: this.baseUrl,
      manifest,
      objectLibrary,
      backgroundLibrary,
      behaviorLibrary,
      task,
    });

    await this.attachInlineSvgObjectAssets(runtimeConfig);
    await this.attachCollisionSource(runtimeConfig);
    await this.attachObjectCollisionSources(runtimeConfig);
    return runtimeConfig;
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

  private async fetchText(relativePath: string): Promise<string> {
    const url = new URL(relativePath, this.baseUrl).toString();
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Failed to load ${relativePath}: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  private async attachInlineSvgObjectAssets(config: RuntimeTaskConfig): Promise<void> {
    // Runtime objects carry resolved asset copies, so SVG text is attached again here
    // before renderer/sizing helpers inspect viewBox data on the final object asset.
    const svgAssets = new Map<string, Promise<string>>();
    for (const objectConfig of config.objects) {
      if (objectConfig.asset.type !== "svg") {
        continue;
      }

      if (objectConfig.asset.inlineSvgText) {
        continue;
      }

      let svgText = svgAssets.get(objectConfig.asset.src);
      if (!svgText) {
        svgText = this.fetchText(objectConfig.asset.src);
        svgAssets.set(objectConfig.asset.src, svgText);
      }
      objectConfig.asset.inlineSvgText = await svgText;
    }
  }

  private async attachInlineSvgLibraryAssets(input: {
    task: TaskConfig;
    objectLibrary: ObjectLibraryConfig;
    backgroundLibrary: BackgroundLibraryConfig;
  }): Promise<void> {
    // ===== 2. Attach inline SVG text for sizing/rendering =====
    // SVG viewBox can be the source of truth for 1:1 Rhino/CAD exports. If JSON
    // already gives dimensions/placement, that wins; otherwise later helpers read SVG text.
    const svgAssets = new Map<string, Promise<string>>();
    const attachObjectAsset = async (assetId: string): Promise<void> => {
      const asset = input.objectLibrary.objects[assetId] as ObjectAssetConfig & { inlineSvgText?: string };
      if (!asset || asset.type !== "svg" || asset.inlineSvgText) {
        return;
      }

      let svgText = svgAssets.get(asset.src);
      if (!svgText) {
        svgText = this.fetchText(asset.src);
        svgAssets.set(asset.src, svgText);
      }
      asset.inlineSvgText = await svgText;
    };

    await Promise.all(input.task.objects.map((objectConfig) => attachObjectAsset(objectConfig.asset)));

    const backgroundAsset = input.backgroundLibrary.backgrounds[input.task.background.asset] as
      | (BackgroundAssetConfig & { inlineSvgText?: string })
      | undefined;
    if (!backgroundAsset || backgroundAsset.type !== "svg" || backgroundAsset.inlineSvgText) {
      return;
    }

    let svgText = svgAssets.get(backgroundAsset.src);
    if (!svgText) {
      svgText = this.fetchText(backgroundAsset.src);
      svgAssets.set(backgroundAsset.src, svgText);
    }
    backgroundAsset.inlineSvgText = await svgText;
  }

  private async attachCollisionSource(config: RuntimeTaskConfig): Promise<void> {
    if (!config.collision.enabled || !config.collision.source) {
      return;
    }

    const svgText = await this.fetchText(config.collision.source.srcResolved);
    config.collision.source.inlineSvgText = svgText;
    config.collision.areas = [
      ...config.collision.areas,
      ...parseCollisionSvg(svgText),
    ];
  }

  private async attachObjectCollisionSources(config: RuntimeTaskConfig): Promise<void> {
    // ===== 3. Resolve object collider sidecars =====
    // asset_outline is authoring sugar. Runtime collision only consumes polygons,
    // so parsed collider points are mapped into rendered object-local coordinates here.
    const svgSources = new Map<string, Promise<string>>();

    for (const objectConfig of config.objects) {
      if (!objectConfig.collision.enabled || objectConfig.collision.shape !== "polygons" || !objectConfig.collision.source) {
        continue;
      }

      let svgText = svgSources.get(objectConfig.collision.source.srcResolved);
      if (!svgText) {
        svgText = this.fetchText(objectConfig.collision.source.srcResolved);
        svgSources.set(objectConfig.collision.source.srcResolved, svgText);
      }

      const inlineSvgText = await svgText;
      objectConfig.collision.source.inlineSvgText = inlineSvgText;
      objectConfig.collision.polygons = parseObjectColliderSvg(inlineSvgText);
    }
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
  // RuntimeTaskConfig is the ingestion boundary for package users: ids are resolved,
  // defaults are applied, and later modules no longer need to know which authoring file
  // a value came from. 也就是“浏览器真正能直接渲染和运行”的那一层 shape。
  const assetBaseUrl = input.manifest.asset_base_url ?? input.baseUrl;
  const resolvedBackgroundAsset = input.backgroundLibrary.backgrounds[input.task.background.asset];
  const backgroundPlacement = resolveBackgroundPlacement(input.task, resolvedBackgroundAsset);
  const resolvedObjects = input.task.objects.map((objectConfig) => {
    const asset = input.objectLibrary.objects[objectConfig.asset] as ObjectAssetConfig & { inlineSvgText?: string };
    const { behavior, templateId } = resolveObjectBehavior(objectConfig.behavior, input.behaviorLibrary);
    const dimensions = resolveObjectDimensions(objectConfig, asset);

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
      width: dimensions.width,
      height: dimensions.height,
      anchor: objectConfig.anchor ?? asset.anchor ?? "center",
      behaviorTemplateId: templateId,
      behavior,
      collision: resolveObjectCollision(objectConfig.collision, assetBaseUrl),
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
      x: backgroundPlacement.x,
      y: backgroundPlacement.y,
      width: backgroundPlacement.width,
      height: backgroundPlacement.height,
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
    flow: resolveFlowConfig(input.task),
    messages: resolveMessages(input.task.messages),
    requirements: {
      ...DEFAULT_REQUIREMENTS,
      min_viewport: resolveMinViewportRequirement(input.task.requirements?.min_viewport),
    },
    stage: {
      ...DEFAULT_STAGE,
      ...input.task.stage,
    },
    collision: resolveTaskCollision(input.task, assetBaseUrl),
    displayImage: input.task.display_image
      ? {
          ...DEFAULT_DISPLAY_IMAGE,
          ...input.task.display_image,
          srcResolved: resolveAssetUrl(assetBaseUrl, input.task.display_image.src),
        }
      : undefined,
  };
}

function resolveObjectCollision(
  collision: TaskConfig["objects"][number]["collision"],
  assetBaseUrl: string,
): RuntimeTaskConfig["objects"][number]["collision"] {
  const enabled = collision?.enabled ?? DEFAULT_OBJECT_COLLISION.enabled;
  const padding = collision?.padding ?? DEFAULT_OBJECT_COLLISION.padding;

  if (!collision || collision.shape === undefined || collision.shape === "box") {
    return {
      enabled,
      shape: "box",
      padding,
    };
  }

  if (collision.shape === "polygons") {
    return {
      enabled,
      shape: "polygons",
      polygons: cloneObjectCollisionPolygons(collision.polygons),
      padding,
    };
  }

  if (collision.shape === "asset_outline") {
    // asset_outline defers polygon extraction to runtime so the sidecar can preserve
    // its own local SVG/viewBox coordinates before runtime normalization.
    return {
      enabled,
      shape: "polygons",
      polygons: [],
      padding,
      source: {
        ...collision.source,
        srcResolved: resolveAssetUrl(assetBaseUrl, collision.source.src),
      },
    };
  }

  return {
    enabled,
    shape: "box",
    padding,
  };
}

function cloneObjectCollisionPolygons(polygons: ObjectCollisionPolygon[]): ObjectCollisionPolygon[] {
  return polygons.map((polygon) => ({
    ...polygon,
    points: polygon.points.map((point) => ({ ...point })),
  }));
}

function resolveObjectDimensions(
  objectConfig: TaskConfig["objects"][number],
  asset: ObjectAssetConfig & { inlineSvgText?: string },
): { width: number; height: number } {
  // Object width/height are world-unit dimensions used by rendering, controls, and
  // collision. Explicit bbox-style numbers are safest; SVG viewBox inference only works
  // when the SVG numbers are meant to define runtime size directly or via viewbox_scale.
  if (objectConfig.width !== undefined || objectConfig.height !== undefined) {
    if (objectConfig.width === undefined || objectConfig.height === undefined) {
      throw new Error(`Object ${objectConfig.id} must supply both width and height when overriding dimensions`);
    }

    return { width: objectConfig.width, height: objectConfig.height };
  }

  if (asset.default_width !== undefined || asset.default_height !== undefined) {
    if (asset.default_width === undefined || asset.default_height === undefined) {
      throw new Error(`Object asset ${objectConfig.asset} must supply both default_width and default_height`);
    }

    return { width: asset.default_width, height: asset.default_height };
  }

  if (asset.type === "svg" && asset.inlineSvgText) {
    const viewBox = parseSvgViewBox(asset.inlineSvgText);
    if (viewBox) {
      const scale = asset.viewbox_scale ?? 1;
      return { width: viewBox.width * scale, height: viewBox.height * scale };
    }
  }

  throw new Error(
    `Object ${objectConfig.id} asset ${objectConfig.asset} requires explicit dimensions or a valid SVG viewBox`,
  );
}

function resolveBackgroundPlacement(
  task: TaskConfig,
  asset: BackgroundAssetConfig & { inlineSvgText?: string },
): ViewBox {
  // Background placement is room placement, not object sizing. A background SVG root
  // viewBox can supply x/y/width/height directly when those numbers, or viewbox_scale,
  // are intended to define runtime placement in world coordinates.
  const background = task.background;
  const hasExplicitPlacement =
    background.x !== undefined ||
    background.y !== undefined ||
    background.width !== undefined ||
    background.height !== undefined;

  if (hasExplicitPlacement) {
    if (
      background.x === undefined ||
      background.y === undefined ||
      background.width === undefined ||
      background.height === undefined
    ) {
      throw new Error("Background placement must include all of x, y, width, and height or omit all of them");
    }

    return {
      x: background.x,
      y: background.y,
      width: background.width,
      height: background.height,
    };
  }

  if (asset.type === "svg" && asset.inlineSvgText) {
    const viewBox = parseSvgViewBox(asset.inlineSvgText);
    if (viewBox) {
      const scale = asset.viewbox_scale ?? 1;
      return {
        x: viewBox.x * scale,
        y: viewBox.y * scale,
        width: viewBox.width * scale,
        height: viewBox.height * scale,
      };
    }
  }

  throw new Error(`Background asset ${background.asset} requires explicit placement or a valid SVG viewBox`);
}

function resolveTaskCollision(
  task: TaskConfig,
  assetBaseUrl: string,
): RuntimeTaskConfig["collision"] {
  const collision: RuntimeTaskConfig["collision"] = {
    enabled: task.collision?.enabled ?? DEFAULT_TASK_COLLISION.enabled,
    mode: task.collision?.mode ?? DEFAULT_TASK_COLLISION.mode,
    areas: [...(task.collision?.areas ?? DEFAULT_TASK_COLLISION.areas)],
  };

  if (!task.collision?.source) {
    return collision;
  }

  return {
    ...collision,
    source: {
      ...task.collision.source,
      srcResolved: resolveAssetUrl(assetBaseUrl, task.collision.source.src),
    },
  };
}

function resolveFlowConfig(task: TaskConfig): RuntimeTaskConfig["flow"] {
  if (!task.flow || task.flow.mode === "direct_reconstruction") {
    return { mode: "direct_reconstruction" };
  }

  if (!task.display_image || task.display_image.enabled === false) {
    throw new Error("preview_then_reconstruct requires display_image.enabled=true");
  }

  return {
    mode: "preview_then_reconstruct",
    config: {
      ...DEFAULT_PREVIEW_FLOW_CONFIG,
      ...task.flow.config,
    },
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

function resolveObjectBehavior(
  behaviorConfig: TaskObjectBehaviorConfig,
  behaviorLibrary: BehaviorLibraryConfig,
): { behavior: BehaviorConfig; templateId?: string } {
  const template = behaviorConfig.template
    ? behaviorLibrary.behaviors[behaviorConfig.template]
    : undefined;

  if (behaviorConfig.template && !template) {
    throw new Error(`Unknown behavior template: ${behaviorConfig.template}`);
  }

  const merged = mergeBehaviorConfig(template, behaviorConfig.config);
  const behavior = behaviorSchema.parse(merged) as BehaviorConfig;

  return {
    behavior,
    templateId: behaviorConfig.template,
  };
}

function mergeBehaviorConfig(
  template?: BehaviorConfig,
  override?: PartialBehaviorConfig,
): unknown {
  // Merge only known behavior sections. 模板提供 base，object.config 只覆盖局部行为参数。
  return {
    movement: {
      ...template?.movement,
      ...override?.movement,
    },
    rotation:
      template?.rotation || override?.rotation
        ? {
            ...template?.rotation,
            ...override?.rotation,
          }
        : undefined,
    free_drag: {
      ...template?.free_drag,
      ...override?.free_drag,
    },
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

function parseSvgViewBox(svgText: string): ViewBox | undefined {
  const match = svgText.match(/<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i);
  if (!match) {
    return undefined;
  }

  const parts = match[1]
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part)) || parts[2] <= 0 || parts[3] <= 0) {
    return undefined;
  }

  return {
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
  };
}
