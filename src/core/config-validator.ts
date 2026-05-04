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
