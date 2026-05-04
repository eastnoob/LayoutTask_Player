import type {
  BackgroundLibraryConfig,
  BehaviorLibraryConfig,
  ManifestConfig,
  TaskConfig,
} from "../types/config";
import {
  backgroundLibrarySchema,
  behaviorLibrarySchema,
  manifestSchema,
  taskSchema,
} from "../schemas/config.schema";

// Validation is intentionally kept as a thin boundary layer.
// 这里不做 resolve 逻辑，只负责把 unknown 输入收口成强类型 config。
export function validateManifest(input: unknown): ManifestConfig {
  return manifestSchema.parse(input);
}

export function validateTask(input: unknown): TaskConfig {
  return taskSchema.parse(input);
}

export function validateBackgroundLibrary(input: unknown): BackgroundLibraryConfig {
  return backgroundLibrarySchema.parse(input);
}

export function validateBehaviorLibrary(input: unknown): BehaviorLibraryConfig {
  return behaviorLibrarySchema.parse(input);
}
