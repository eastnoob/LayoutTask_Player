export type TutorialEvent =
  | "preview_acknowledged"
  | "reconstruction_started"
  | "object_selected"
  | "object_moved_or_rotated"
  | "confidence_chosen"
  | "object_deselected"
  | "submitted";

export interface TutorialStep {
  id:
    | "intro"
    | "preview"
    | "select_first"
    | "move_or_rotate"
    | "confidence_first"
    | "deselect"
    | "select_second"
    | "confidence_second"
    | "submit"
    | "complete";
  anchor: string;
  message: string;
  expectedEvent?: TutorialEvent;
}

const steps: TutorialStep[] = [
  {
    id: "intro",
    anchor: "flow-modal",
    message:
      "You will first study an image. Remember the position and orientation of each furniture group, then reconstruct the scene from memory.",
    expectedEvent: "preview_acknowledged",
  },
  {
    id: "preview",
    anchor: "display-image",
    message: "Study the reference image. It will disappear when the countdown ends.",
    expectedEvent: "reconstruction_started",
  },
  {
    id: "select_first",
    anchor: "stage",
    message: "Click a furniture group to enter edit mode.",
    expectedEvent: "object_selected",
  },
  {
    id: "move_or_rotate",
    anchor: "controls",
    message: "Use the controls to move or rotate this furniture group.",
    expectedEvent: "object_moved_or_rotated",
  },
  {
    id: "confidence_first",
    anchor: "confidence",
    message: "Choose a confidence rating for this furniture group.",
    expectedEvent: "confidence_chosen",
  },
  {
    id: "deselect",
    anchor: "stage",
    message: "Click the stage background to exit edit mode.",
    expectedEvent: "object_deselected",
  },
  {
    id: "select_second",
    anchor: "stage",
    message: "Now select another furniture group. You must choose confidence for the current group before switching.",
    expectedEvent: "object_selected",
  },
  {
    id: "confidence_second",
    anchor: "confidence",
    message: "Adjust this group, then choose its confidence rating.",
    expectedEvent: "confidence_chosen",
  },
  {
    id: "submit",
    anchor: "confirm",
    message: "Submit the tutorial result.",
    expectedEvent: "submitted",
  },
  {
    id: "complete",
    anchor: "status",
    message: "Tutorial complete.",
  },
];

export class TutorialController {
  private index = 0;

  getCurrentStep(): TutorialStep {
    return steps[this.index];
  }

  isComplete(): boolean {
    return this.getCurrentStep().id === "complete";
  }

  handle(event: TutorialEvent, _payload?: { objectId?: string }): boolean {
    if (this.getCurrentStep().expectedEvent !== event) {
      return false;
    }

    this.index = Math.min(this.index + 1, steps.length - 1);
    return true;
  }
}
