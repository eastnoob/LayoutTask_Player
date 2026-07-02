import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseExperimentConfig } from "../../src/schemas/experiment.schema";
import type { ExperimentConfig } from "../../src/types/experiment";
import { validateRuntimePackage } from "./validate-runtime-package";

export interface ExperimentPackageFailure {
  type: "load_error" | "missing_task" | "formal_trial_flow" | "formal_trial_display_image";
  taskId?: string;
  message: string;
}

export interface ExperimentPackageReport {
  ok: boolean;
  failures: ExperimentPackageFailure[];
}

export interface ValidateExperimentPackageOptions {
  baseDir: string;
  configPath?: string;
  skipRuntimePreflight?: boolean;
}

export async function validateExperimentPackage(options: ValidateExperimentPackageOptions): Promise<ExperimentPackageReport> {
  const baseDir = path.resolve(options.baseDir);
  const failures: ExperimentPackageFailure[] = [];
  let config: ExperimentConfig;

  try {
    config = parseExperimentConfig(JSON.parse(await readFile(path.join(baseDir, options.configPath ?? "experiment.json"), "utf8")));
  } catch (error) {
    return { ok: false, failures: [{ type: "load_error", message: errorMessage(error) }] };
  }

  const taskBaseDir = path.resolve(baseDir, config.baseUrl);
  let manifest: { tasks: Array<{ task_id: string; file: string }> };
  try {
    manifest = JSON.parse(await readFile(path.join(taskBaseDir, "manifest.json"), "utf8")) as {
      tasks: Array<{ task_id: string; file: string }>;
    };
  } catch (error) {
    return { ok: false, failures: [{ type: "load_error", message: errorMessage(error) }] };
  }

  const taskEntries = new Map(manifest.tasks.map((task) => [task.task_id, task]));
  if (config.tutorial.enabled && config.tutorial.taskId && !taskEntries.has(config.tutorial.taskId)) {
    failures.push({
      type: "missing_task",
      taskId: config.tutorial.taskId,
      message: `Tutorial task ${config.tutorial.taskId} is missing from manifest`,
    });
  }

  for (const trial of config.trials) {
    const entry = taskEntries.get(trial.taskId);
    if (!entry) {
      failures.push({ type: "missing_task", taskId: trial.taskId, message: `Formal trial ${trial.taskId} is missing from manifest` });
      continue;
    }

    const task = JSON.parse(await readFile(path.join(taskBaseDir, entry.file), "utf8")) as {
      flow?: { mode?: string };
      display_image?: { enabled?: boolean; src?: string };
    };
    if (task.flow?.mode !== "preview_then_reconstruct") {
      failures.push({
        type: "formal_trial_flow",
        taskId: trial.taskId,
        message: `Formal trial ${trial.taskId} must use flow.mode preview_then_reconstruct`,
      });
    }
    if (!task.display_image?.enabled || !task.display_image.src) {
      failures.push({
        type: "formal_trial_display_image",
        taskId: trial.taskId,
        message: `Formal trial ${trial.taskId} must have enabled display_image.src`,
      });
    }
  }

  if (!options.skipRuntimePreflight) {
    const report = await validateRuntimePackage({ baseDir: taskBaseDir, checkTargets: true });
    for (const failure of report.failures) {
      failures.push({
        type: "load_error",
        taskId: "task_id" in failure ? failure.task_id : undefined,
        message: JSON.stringify(failure),
      });
    }
  }

  return { ok: failures.length === 0, failures };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const baseDir = process.argv[2];
  if (!baseDir) {
    console.error("Usage: tsx tools/generator/validate-experiment-package.ts <experiment-base-dir>");
    process.exitCode = 1;
    return;
  }
  const report = await validateExperimentPackage({ baseDir });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
