import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ExperimentSchedule } from "../../src/types/schedule";

export interface ScheduleFailure {
  type: "presentation_count" | "formal_task" | "tutorial_contamination" | "repeat_lag" | "trial_total";
  message: string;
  sequenceId?: number;
}

export interface ScheduleValidationReport {
  ok: boolean;
  failures: ScheduleFailure[];
}

export function validateSchedule(input: {
  schedule: ExperimentSchedule;
  formalTaskIds: string[];
  tutorialTaskId?: string;
}): ScheduleValidationReport {
  const failures: ScheduleFailure[] = [];
  const formal = new Set(input.formalTaskIds);

  for (const sequence of input.schedule.sequences) {
    if (sequence.presentations.length !== input.schedule.presentationCount) {
      failures.push({ type: "presentation_count", sequenceId: sequence.sequenceId, message: `Sequence ${sequence.sequenceId} has ${sequence.presentations.length} presentations; expected ${input.schedule.presentationCount}` });
    }
    for (const presentation of sequence.presentations) {
      if (input.tutorialTaskId && presentation.taskId === input.tutorialTaskId) {
        failures.push({ type: "tutorial_contamination", sequenceId: sequence.sequenceId, message: `Tutorial task ${presentation.taskId} appears in formal schedule` });
      } else if (!formal.has(presentation.taskId)) {
        failures.push({ type: "formal_task", sequenceId: sequence.sequenceId, message: `Formal task ${presentation.taskId} is missing from the formal manifest` });
      }
      if (presentation.trialTotal !== input.schedule.presentationCount) {
        failures.push({ type: "trial_total", sequenceId: sequence.sequenceId, message: `Presentation ${presentation.presentationId} reports trialTotal ${presentation.trialTotal}` });
      }
    }

    const grouped = new Map<string, number[]>();
    for (const presentation of sequence.presentations) {
      if (presentation.repeatGroupId) {
        const positions = grouped.get(presentation.repeatGroupId) ?? [];
        positions.push(presentation.trialIndex);
        grouped.set(presentation.repeatGroupId, positions);
      }
    }
    for (const [groupId, positions] of grouped) {
      positions.sort((a, b) => a - b);
      for (let index = 1; index < positions.length; index += 1) {
        if (positions[index] - positions[index - 1] - 1 < input.schedule.minimumInterveningTrials) {
          failures.push({ type: "repeat_lag", sequenceId: sequence.sequenceId, message: `Repeat group ${groupId} has fewer than ${input.schedule.minimumInterveningTrials} intervening presentations` });
        }
      }
    }
  }

  return { ok: failures.length === 0, failures };
}

async function main(): Promise<void> {
  const schedulePath = process.argv[2];
  if (!schedulePath) {
    console.error("Usage: tsx tools/generator/validate-schedule.ts <schedule.json>");
    process.exitCode = 1;
    return;
  }
  const schedule = JSON.parse(await readFile(path.resolve(schedulePath), "utf8")) as ExperimentSchedule;
  const report = validateSchedule({ schedule, formalTaskIds: [...new Set(schedule.sequences.flatMap((sequence) => sequence.presentations.map((presentation) => presentation.taskId)))] });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
