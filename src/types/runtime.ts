import type {
  Anchor,
  BackgroundAssetConfig,
  BehaviorConfig,
  CollisionAreaConfig,
  CollisionSourceConfig,
  CompletionConfig,
  DataPipePayloadFormat,
  DisplayImageConfig,
  FeedbackConfig,
  LayoutTaskMessages,
  ObjectRole,
  ObjectAssetConfig,
  ObjectCollisionPolygon,
  OutputConfig,
  PreviewStageMode,
  RecordingConfig,
  StageConfig,
  WorldConfig,
} from "./config";

// Runtime types are the resolved, app-ready shape after config loading.
// 和 `config.ts` 的区别在于：asset path 已解析，defaults 也已经补齐。
export interface ResolvedAssetPath {
  srcResolved: string;
}

export type ResolvedObjectAsset = ObjectAssetConfig & ResolvedAssetPath & {
  inlineSvgText?: string;
};
export type ResolvedBackgroundAsset = BackgroundAssetConfig & ResolvedAssetPath & {
  inlineSvgText?: string;
};
export type ResolvedBehaviorConfig = BehaviorConfig;

export interface RuntimeTaskObject {
  id: string;
  role?: ObjectRole;
  group_id?: string;
  assetId: string;
  asset: ResolvedObjectAsset;
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
  anchor: Anchor;
  behaviorTemplateId?: string;
  behavior: ResolvedBehaviorConfig;
  collision: RuntimeObjectCollisionConfig;
}

export interface RuntimeBackground {
  assetId: string;
  asset: ResolvedBackgroundAsset;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RuntimeDisplayImage extends Required<DisplayImageConfig>, ResolvedAssetPath {}

export interface RuntimeMinViewportRequirement {
  width: number;
  height: number;
  mode: "warn";
  message?: string;
}

export interface RuntimeRequirements {
  min_viewport?: RuntimeMinViewportRequirement;
}

export interface RuntimeStageConfig extends Required<StageConfig> {}

export interface RuntimeCollisionSource extends CollisionSourceConfig, ResolvedAssetPath {
  inlineSvgText?: string;
}

export type RuntimeObjectCollisionConfig =
  | {
      enabled: boolean;
      shape: "box";
      padding: number;
    }
  | {
      enabled: boolean;
      shape: "polygons";
      polygons: ObjectCollisionPolygon[];
      padding: number;
      source?: CollisionSourceConfig & ResolvedAssetPath & { inlineSvgText?: string };
    };

export interface RuntimeCollisionConfig {
  enabled: boolean;
  mode: "discrete";
  areas: CollisionAreaConfig[];
  source?: RuntimeCollisionSource;
}

export interface RuntimeDirectReconstructionFlow {
  mode: "direct_reconstruction";
}

export interface RuntimePreviewThenReconstructFlow {
  mode: "preview_then_reconstruct";
  config: {
    preview_duration_sec: number;
    require_preview_ack: boolean;
    intro_message: string;
    intro_confirm_label: string;
    stage_during_preview: PreviewStageMode;
    show_countdown: boolean;
    message_before: string;
    message_after: string;
  };
}

export type RuntimeFlowConfig = RuntimeDirectReconstructionFlow | RuntimePreviewThenReconstructFlow;

export interface RuntimeTaskConfig {
  schema: "layouttask.runtime.v1";
  experimentId: string;
  configVersion?: string;
  taskConfigHash?: string;
  qid: string;
  taskId: string;
  title?: string;
  baseUrl: string;
  world: WorldConfig;
  background: RuntimeBackground;
  objects: RuntimeTaskObject[];
  completion: Required<CompletionConfig>;
  recording: Required<RecordingConfig>;
  output: Required<OutputConfig>;
  dataSave: RuntimeDataSaveConfig;
  feedback: Required<FeedbackConfig>;
  flow: RuntimeFlowConfig;
  messages: LayoutTaskMessages;
  requirements: RuntimeRequirements;
  stage: RuntimeStageConfig;
  collision: RuntimeCollisionConfig;
  displayImage?: RuntimeDisplayImage;
}

export interface RuntimeCopyDataSaveConfig {
  mode: "copy";
}

export interface RuntimeDataPipeSaveConfig {
  mode: "datapipe";
  experiment_id: string;
  endpoint: string;
  filename_prefix: string;
  payload_format: DataPipePayloadFormat;
  save_encoded: boolean;
  save_result: boolean;
}

export type RuntimeDataSaveConfig = RuntimeCopyDataSaveConfig | RuntimeDataPipeSaveConfig;
