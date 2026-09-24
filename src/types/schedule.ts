export interface ReferencePresentation {
  presentationId: string;
  taskId: string;
  repeatGroupId: string | null;
  repeatIndex: number;
  repeatOfTaskId: string | null;
  trialIndex: number;
  trialTotal: number;
}

export interface ExperimentScheduleBaseSequence {
  sequenceId: number;
  taskIds: string[];
}

export interface ExperimentScheduleSequence {
  sequenceId: number;
  presentations: ReferencePresentation[];
}

export interface ExperimentSchedule {
  schema: "layouttask.schedule.v1";
  strategy: "williams_balanced_first_order";
  uniqueSceneCount: number;
  presentationCount: number;
  baseSequenceCount: number;
  minimumInterveningTrials: number;
  repeatGroups: string[];
  sequences: ExperimentScheduleSequence[];
}

export interface SelectedSequence {
  sequenceId: number;
  participantNumber: number;
  presentations: ReferencePresentation[];
}
