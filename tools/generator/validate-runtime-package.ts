import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { evaluateCollision, type CollisionResult } from "../../src/core/collision-geometry";
import { ConfigLoader } from "../../src/core/config-loader";
import type { ScoringReferenceConfig, ScoringReferenceObject } from "../../src/types/batch";
import type { ObjectPose } from "../../src/types/events";
import type { RuntimeTaskConfig, RuntimeTaskObject } from "../../src/types/runtime";

type CollisionFailureReason = Exclude<CollisionResult, { ok: true }>["reason"];

export type RuntimePackageFailure =
  | {
      type: "load_error";
      task_id?: string;
      message: string;
    }
  | {
      type: "initial_collision" | "target_collision";
      task_id: string;
      object_id: string;
      reason: CollisionFailureReason;
      collided_with?: string;
    };

export interface RuntimePackageReport {
  ok: boolean;
  baseDir: string;
  taskCount: number;
  variableCount: number;
  failures: RuntimePackageFailure[];
}

export interface ValidateRuntimePackageOptions {
  baseDir: string;
  checkTargets?: boolean;
}

const usage = `Usage: tsx tools/generator/validate-runtime-package.ts --base <compiled-base-dir> [--check-targets]
       tsx tools/generator/validate-runtime-package.ts <compiled-base-dir> [--check-targets]`;

export async function validateRuntimePackage(options: ValidateRuntimePackageOptions): Promise<RuntimePackageReport> {
  const baseDir = path.resolve(options.baseDir);
  const loader = new ConfigLoader({
    baseUrl: pathToFileURL(`${baseDir}${path.sep}`).href,
    fetchImpl: createFileFetch(),
  });
  const failures: RuntimePackageFailure[] = [];
  const scoringReference = options.checkTargets ? await loadScoringReference(baseDir, failures) : undefined;
  let taskCount = 0;
  let variableCount = 0;

  try {
    const manifest = await loader.loadManifest();
    taskCount = manifest.tasks.length;

    for (const task of manifest.tasks) {
      try {
        const config = await loader.loadRuntimeConfig({ taskId: task.task_id });
        variableCount += validateTaskConfig(config, scoringReference?.tasks[config.taskId]?.objects, failures);
      } catch (error) {
        failures.push({ type: "load_error", task_id: task.task_id, message: errorMessage(error) });
      }
    }
  } catch (error) {
    failures.push({ type: "load_error", message: errorMessage(error) });
  }

  return {
    ok: failures.length === 0,
    baseDir,
    taskCount,
    variableCount,
    failures,
  };
}

function validateTaskConfig(
  config: RuntimeTaskConfig,
  scoringObjects: Record<string, ScoringReferenceObject> | undefined,
  failures: RuntimePackageFailure[],
): number {
  const variables = config.objects.filter((object) => object.role === "variable");
  if (!config.collision.enabled) {
    return variables.length;
  }

  for (const object of variables) {
    const initial = evaluateObjectPose(config, object, { x: object.x, y: object.y, r: object.rotation });
    if (!initial.ok) {
      failures.push(failureFromCollision("initial_collision", config.taskId, object.id, initial));
    }

    const targetPose = getRelativeTargetPose(config, object, scoringObjects?.[object.id]);
    if (targetPose) {
      const target = evaluateObjectPose(config, object, targetPose);
      if (!target.ok) {
        failures.push(failureFromCollision("target_collision", config.taskId, object.id, target));
      }
    }
  }

  return variables.length;
}

function evaluateObjectPose(config: RuntimeTaskConfig, object: RuntimeTaskObject, candidatePose: ObjectPose) {
  return evaluateCollision({
    movingObject: object,
    candidatePose,
    objects: config.objects,
    areas: config.collision.areas,
    worldViewBox: config.world.viewBox,
  });
}

function failureFromCollision(
  type: "initial_collision" | "target_collision",
  taskId: string,
  objectId: string,
  result: Exclude<CollisionResult, { ok: true }>,
): RuntimePackageFailure {
  return {
    type,
    task_id: taskId,
    object_id: objectId,
    reason: result.reason,
    collided_with: result.reason === "object" ? result.objectId : result.areaId,
  };
}

function getRelativeTargetPose(
  config: RuntimeTaskConfig,
  object: RuntimeTaskObject,
  scoringObject: ScoringReferenceObject | undefined,
): ObjectPose | undefined {
  const target = scoringObject?.target?.relative;
  if (!target) {
    return undefined;
  }

  const movementStep = object.behavior.movement.step ?? config.world.grid.size;
  const rotationStep = object.behavior.rotation?.step ?? 45;
  return {
    x: object.x + target.dx_steps * movementStep,
    y: object.y + target.dy_steps * movementStep,
    r: object.rotation + target.rotation_steps * rotationStep,
  };
}

async function loadScoringReference(
  baseDir: string,
  failures: RuntimePackageFailure[],
): Promise<ScoringReferenceConfig | undefined> {
  try {
    return JSON.parse(await readFile(path.join(baseDir, "scoring", "scoring-reference.json"), "utf8")) as ScoringReferenceConfig;
  } catch (error) {
    failures.push({ type: "load_error", message: `Failed to load scoring/scoring-reference.json: ${errorMessage(error)}` });
    return undefined;
  }
}

function createFileFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = input instanceof URL ? input : new URL(String(input));
    const body = await readFile(fileURLToPath(url), "utf8");
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => JSON.parse(body),
      text: async () => body,
    } as Response;
  }) as typeof fetch;
}

function parseArgs(args: string[]): ValidateRuntimePackageOptions {
  const options: ValidateRuntimePackageOptions = { baseDir: "", checkTargets: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--check-targets") {
      options.checkTargets = true;
      continue;
    }
    if (arg === "--base") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--base requires a value");
      }
      options.baseDir = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--base=")) {
      options.baseDir = arg.slice("--base=".length);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (!options.baseDir) {
      options.baseDir = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!options.baseDir) {
    throw new Error("Missing --base");
  }
  return options;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  try {
    const report = await validateRuntimePackage(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(errorMessage(error));
    console.error(usage);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
