import type {
  Anchor,
  BackgroundAssetConfig,
  BehaviorConfig,
  CompletionConfig,
  ObjectAssetConfig,
  RecordingConfig,
  WorldConfig,
} from "./config";

export interface ResolvedAssetPath {
  srcResolved: string;
}

export type ResolvedObjectAsset = ObjectAssetConfig & ResolvedAssetPath;
export type ResolvedBackgroundAsset = BackgroundAssetConfig & ResolvedAssetPath;
export type ResolvedBehaviorConfig = BehaviorConfig;

export interface RuntimeTaskObject {
  id: string;
  assetId: string;
  asset: ResolvedObjectAsset;
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
  anchor: Anchor;
  behaviorId: string;
  behavior: ResolvedBehaviorConfig;
}

export interface RuntimeBackground {
  assetId: string;
  asset: ResolvedBackgroundAsset;
  x: number;
  y: number;
  width: number;
  height: number;
}

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
}
