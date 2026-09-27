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
      "**You will first study an image for 10 seconds.** Remember the furniture state at each marked point, including which furniture is there, its position, and its orientation. Then reconstruct the floor plan based on the picture you just studied.",
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
    anchor: "viewport-tools",
    message:
      "Use the picture at the top of the page to reconstruct the floor plan below. Move the [[yellow]]yellow objects[[/yellow]] in the floor plan so that their positions and orientations match the furniture in the perspective image above. **You must open every yellow object once, even when its initial state already matches the image.** **Only yellow objects can be moved.** If needed, use the **zoom in**, **zoom out**, and **reset** controls in the **upper-right corner** of the floor plan. To inspect the scene, hold **Pan** and drag; release **Pan** to stop panning. These controls change only the view, not furniture positions or orientations. Right-click is not used for panning.",
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

  constructor(referenceMode: "preview_10s" | "persistent" = "preview_10s", locale: "en-US" | "zh-CN" = "en-US") {
    const selectedSteps = referenceMode === "persistent" ? createPersistentSteps() : steps;
    this.steps = locale === "zh-CN" ? createChineseSteps(selectedSteps) : selectedSteps;
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

function createChineseSteps(source: TutorialStep[]): TutorialStep[] {
  const messages: Record<TutorialStep["id"], string> = {
    intro:
      "**你可以随时查看页面顶部的透视图。** 你的任务是根据刚才看到的图片还原场景平面图。请不要使用浏览器缩放、**Ctrl + 滚轮**或其他放大工具；这些行为可能会被记录。你可以使用平面图右下角的缩放按钮。",
    preview: "**观察顶部的参考图片。** 倒计时结束后图片会消失。",
    select_first:
      "请根据页面上方的图片，还原下方的场景平面图。具体来说，请移动平面图中的[[yellow]]黄色物体[[/yellow]]，使它们的位置和方向与上方透视图中的家具一致。即使初始状态已经正确，**也必须打开每个黄色物体一次。****只有黄色物体可以移动。**如需查看细节，可使用平面图**右上角的放大、缩小和重置按钮**。按住**Pan**并拖动即可移动视图，松开**Pan**后停止平移；这些操作只改变视图，不改变家具位置或方向。请勿使用右键平移。",
    move_or_rotate:
      "**使用箭头按钮移动**，或**使用旋转按钮调整方向**。如果操作箭头挡住视线，请将鼠标移出物体以隐藏箭头；重新指向物体即可显示，**这不会退出编辑模式。**",
    confidence_first:
      "**你的任务是尽可能根据刚刚看到的图片还原场景平面图。**完成这个物体后，**请在下方选择置信度。**",
    save_first: "点击下方的**Save**保存置信度并退出这个物体的编辑模式。",
    select_second: "你已退出当前编辑模式。**现在可以点击另一个**[[yellow]]黄色物体[[/yellow]]**进入其编辑模式。**",
    confidence_second: "完成这个物体后，**请在下方选择它的置信度。**",
    save_second: "点击下方的**Save**退出这个物体的编辑模式。**提交教程前，请对每个黄色物体重复此操作。**",
    pause_practice: "**练习暂停功能。**点击**Pause**，等待10秒练习倒计时，然后点击**Resume**。练习暂停不会消耗正式暂停机会。",
    pause_practice_resume: "**保持暂停直到倒计时结束，然后点击Resume**继续教程。",
    submit: "**提交教程结果。**",
    complete: "**教程完成。**",
  };

  return source.map((step) => ({ ...step, message: messages[step.id] }));
}
