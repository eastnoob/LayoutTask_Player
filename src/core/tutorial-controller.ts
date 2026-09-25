export type TutorialEvent =
  | "preview_acknowledged"
  | "reconstruction_started"
  | "object_selected"
  | "object_moved_or_rotated"
  | "confidence_chosen"
  | "object_deselected"
  | "pause_practice_started"
  | "pause_practice_resumed"
  | "submitted";

export interface TutorialStep {
  id:
    | "intro"
    | "preview"
    | "select_first"
    | "move_or_rotate"
    | "confidence_first"
    | "save_first"
    | "select_second"
    | "confidence_second"
    | "save_second"
    | "pause_practice"
    | "pause_practice_resume"
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
      "**You will first study an image for 10 seconds.** Remember the furniture state at each marked point, including which furniture is there, its position, and its orientation. Then reconstruct the scene from memory.",
    expectedEvent: "preview_acknowledged",
  },
  {
    id: "preview",
    anchor: "display-image",
    message: "**Study the reference image.** It will disappear when the countdown ends.",
    expectedEvent: "reconstruction_started",
  },
  {
    id: "select_first",
    anchor: "stage",
    message:
      "Click the [[yellow]]yellow object[[/yellow]] in each furniture group. **You must open every yellow object once, even when its initial state already matches the image.** **Only yellow objects can be moved.** If needed, use the **zoom controls in the lower-right corner** to inspect the scene.",
    expectedEvent: "object_selected",
  },
  {
    id: "move_or_rotate",
    anchor: "controls",
    message:
      "**Use the arrow buttons to move** or **the rotate buttons to adjust** this furniture group. If the handles obstruct your view, move the pointer away from the object to hide them. Point back at the object to show them again; **this does not exit edit mode.**",
    expectedEvent: "object_moved_or_rotated",
  },
  {
    id: "confidence_first",
    anchor: "confidence",
    message:
      "**Your task is to reconstruct the floor plan as closely as possible to the image you just studied.** When you are finished with this object, **choose a confidence rating below.**",
    expectedEvent: "confidence_chosen",
  },
  {
    id: "save_first",
    anchor: "confidence",
    message: "Click **Save** below to store the rating and exit this object's edit mode.",
    expectedEvent: "object_deselected",
  },
  {
    id: "select_second",
    anchor: "stage",
    message: "You have exited the current edit mode. **You can now click another** [[yellow]]yellow object[[/yellow]] **to enter its edit mode.**",
    expectedEvent: "object_selected",
  },
  {
    id: "confidence_second",
    anchor: "confidence",
    message: "When you are finished with this object, **choose its confidence rating below.**",
    expectedEvent: "confidence_chosen",
  },
  {
    id: "save_second",
    anchor: "confidence",
    message: "Click **Save** below to exit this object's edit mode. **Repeat this for every yellow object before submitting the tutorial.**",
    expectedEvent: "object_deselected",
  },
  {
    id: "pause_practice",
    anchor: "status",
    message: "**Practice the pause control.** Click **Pause**, wait for the 10-second practice countdown, then click **Resume**. This practice pause does not use your formal pause opportunity.",
    expectedEvent: "pause_practice_started",
  },
  {
    id: "pause_practice_resume",
    anchor: "status",
    message: "**Keep the experiment paused until the countdown ends, then click Resume** to continue the tutorial.",
    expectedEvent: "pause_practice_resumed",
  },
  {
    id: "submit",
    anchor: "confirm",
    message: "**Submit the tutorial result.**",
    expectedEvent: "submitted",
  },
  {
    id: "complete",
    anchor: "status",
    message: "**Tutorial complete.**",
  },
];

export class TutorialController {
  private index = 0;
  private readonly steps: TutorialStep[];

  constructor(referenceMode: "preview_10s" | "persistent" = "preview_10s") {
    this.steps = referenceMode === "persistent" ? createPersistentSteps() : steps;
  }

  getCurrentStep(): TutorialStep {
    return this.steps[this.index];
  }

  isComplete(): boolean {
    return this.getCurrentStep().id === "complete";
  }

  handle(event: TutorialEvent, _payload?: { objectId?: string }): boolean {
    if (this.getCurrentStep().expectedEvent !== event) {
      return false;
    }

    this.index = Math.min(this.index + 1, this.steps.length - 1);
    return true;
  }
}

function createPersistentSteps(): TutorialStep[] {
  return steps
    .filter((step) => step.id !== "preview")
    .map((step) =>
      step.id === "intro"
        ? {
            ...step,
            expectedEvent: "reconstruction_started" as const,
            message:
              "**You may refer to the perspective image at any time.** Do not enlarge it using browser zoom, **Ctrl + scroll**, or any magnification tool. These actions may be recorded. You may use the floor-plan zoom controls; they do not enlarge the perspective image.",
          }
        : step,
    );
}
