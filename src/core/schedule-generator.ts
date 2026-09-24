import type {
  ExperimentSchedule,
  ExperimentScheduleBaseSequence,
  ReferencePresentation,
  SelectedSequence,
} from "../types/schedule";

export interface ScheduleGenerationOptions {
  tutorialTaskId?: string;
}

export function generateWilliamsBaseSequences(
  taskIds: string[],
  options: ScheduleGenerationOptions = {},
): ExperimentSchedule {
  const uniqueTaskIds = [...new Set(taskIds)];
  if (uniqueTaskIds.length !== taskIds.length) {
    throw new Error("Formal schedule task IDs must be unique");
  }
  if (options.tutorialTaskId && uniqueTaskIds.includes(options.tutorialTaskId)) {
    throw new Error(`Tutorial task ${options.tutorialTaskId} cannot be scheduled as formal`);
  }
  if (uniqueTaskIds.length < 2) {
    throw new Error("Formal schedule requires at least two unique tasks");
  }

  const forward = createWilliamsOrder(uniqueTaskIds);
  const reverse = [...forward].reverse();
  const baseSequences = [
    ...createCyclicSequences(forward),
    ...createCyclicSequences(reverse),
  ];

  return {
    schema: "layouttask.schedule.v1",
    strategy: "williams_balanced_first_order",
    uniqueSceneCount: uniqueTaskIds.length,
    presentationCount: uniqueTaskIds.length + 2,
    baseSequenceCount: baseSequences.length,
    minimumInterveningTrials: 7,
    repeatGroups: [],
    sequences: baseSequences.map((sequence) => ({
      sequenceId: sequence.sequenceId,
      presentations: sequence.taskIds.map((taskId, index) => ({
        presentationId: `sequence-${sequence.sequenceId}-presentation-${index + 1}`,
        taskId,
        repeatGroupId: null,
        repeatIndex: 0,
        repeatOfTaskId: null,
        trialIndex: index + 1,
        trialTotal: uniqueTaskIds.length,
      })),
    })),
  };
}

export function insertRepeatedPresentations(
  baseSequence: { sequenceId: number; taskIds?: string[]; presentations?: ReferencePresentation[] },
  repeatGroups: string[],
  minimumInterveningTrials: number,
): ReferencePresentation[] {
  if (repeatGroups.length !== 2 || new Set(repeatGroups).size !== 2) {
    throw new Error("Exactly two distinct repeat groups are required");
  }
  const taskIds = baseSequence.taskIds ?? baseSequence.presentations?.map((item) => item.taskId) ?? [];
  if (new Set(taskIds).size !== taskIds.length) {
    throw new Error("Base sequence must contain unique task IDs");
  }
  for (const taskId of repeatGroups) {
    if (!taskIds.includes(taskId)) {
      throw new Error(`Repeat task ${taskId} is missing from base sequence`);
    }
  }

  const candidate = findRepeatInsertion(taskIds, repeatGroups, minimumInterveningTrials);
  const trialTotal = candidate.length;
  return candidate.map((entry, index) => {
    const occurrence = candidate
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter(({ item }) => item.taskId === entry.taskId);
    const pairIndex = occurrence.findIndex(({ itemIndex }) => itemIndex === index);
    const repeatGroupId = repeatGroups.includes(entry.taskId) ? entry.taskId : null;
    return {
      presentationId: `sequence-${baseSequence.sequenceId}-presentation-${index + 1}`,
      taskId: entry.taskId,
      repeatGroupId,
      repeatIndex: repeatGroupId ? pairIndex + 1 : 0,
      repeatOfTaskId: repeatGroupId && pairIndex === 1 ? entry.taskId : null,
      trialIndex: index + 1,
      trialTotal,
    };
  });
}

export function selectSequence(schedule: ExperimentSchedule, participantNumber: number): SelectedSequence {
  if (!Number.isInteger(participantNumber) || participantNumber < 1) {
    throw new Error("participantNumber must be a positive integer");
  }
  const index = (participantNumber - 1) % schedule.sequences.length;
  const sequence = schedule.sequences[index];
  return {
    sequenceId: sequence.sequenceId,
    participantNumber,
    presentations: sequence.presentations,
  };
}

function createWilliamsOrder(taskIds: string[]): string[] {
  const order = [taskIds[0]];
  for (let index = 1; index < taskIds.length; index += 1) {
    order.push(
      index % 2 === 1
        ? taskIds[Math.ceil(index / 2)]
        : taskIds[taskIds.length - index / 2],
    );
  }
  return order;
}

function createCyclicSequences(order: string[]): ExperimentScheduleBaseSequence[] {
  return order.map((_, offset) => ({
    sequenceId: offset + 1,
    taskIds: order.map((__, index) => order[(index + offset) % order.length]),
  }));
}

function findRepeatInsertion(
  taskIds: string[],
  repeatGroups: string[],
  minimumInterveningTrials: number,
): Array<{ taskId: string; duplicate: boolean }> {
  for (let firstSlot = 0; firstSlot <= taskIds.length; firstSlot += 1) {
    for (let secondSlot = 0; secondSlot <= taskIds.length; secondSlot += 1) {
      const entries = buildWithInsertions(taskIds, repeatGroups, firstSlot, secondSlot);
      if (repeatGroups.every((taskId) => {
        const positions = entries
          .map((entry, index) => entry.taskId === taskId ? index : -1)
          .filter((index) => index >= 0);
        return positions.length === 2 && positions[1] - positions[0] >= minimumInterveningTrials + 1;
      })) {
        const duplicatePositions = entries
          .map((entry, index) => entry.duplicate ? index : -1)
          .filter((index) => index >= 0);
        if (duplicatePositions[1] - duplicatePositions[0] > 1) {
          return entries;
        }
      }
    }
  }
  throw new Error("Unable to insert repeat presentations with the requested lag");
}

function buildWithInsertions(
  taskIds: string[],
  repeatGroups: string[],
  firstSlot: number,
  secondSlot: number,
): Array<{ taskId: string; duplicate: boolean }> {
  const entries: Array<{ taskId: string; duplicate: boolean }> = [];
  for (let index = 0; index <= taskIds.length; index += 1) {
    if (firstSlot === index) entries.push({ taskId: repeatGroups[0], duplicate: true });
    if (secondSlot === index) entries.push({ taskId: repeatGroups[1], duplicate: true });
    if (index < taskIds.length) entries.push({ taskId: taskIds[index], duplicate: false });
  }
  return entries;
}
