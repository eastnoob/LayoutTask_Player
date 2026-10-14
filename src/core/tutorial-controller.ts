import type { ConfidenceController } from "./confidence-controller";

export type TutorialPracticeEvent =
  | "magnifier_entered"
  | "magnifier_zoom_changed"
  | "magnifier_exited"
  | "pause_requested"
  | "pause_cancelled"
  | "pause_confirmed"
  | "pause_resumed";

export type TutorialEvent = TutorialPracticeEvent
  | "preview_acknowledged" | "reconstruction_started" | "view_direction_acknowledged"
  | "reference_board_completed" | "object_selected" | "object_moved_or_rotated"
  | "confidence_chosen" | "object_deselected" | "object_saved" | "submitted";

export interface TutorialEventPayload {
  objectId?: string;
  zoomBefore?: number;
  zoomAfter?: number;
  exitReason?: "escape" | "destroy";
  resumeReason?: "manual_resume" | "auto_resume_10s" | "auto_resume_15m";
}

export interface TutorialStep {
  id: "intro" | "preview" | "view_direction" | "reference_board" | "magnifier_practice"
    | "select_first" | "confidence_first" | "save_first" | "pause_practice"
    | "remaining_objects" | "submit" | "complete";
  anchor: string;
  task: string;
  message: string;
  expectedEvent?: TutorialEvent;
}

interface TutorialFacts {
  confidence?: Pick<ConfidenceController, "getRequiredGroupIds" | "getFinalConfidence" | "getActiveGroupId" | "canLeaveActiveGroup">;
  getGroupId?: (objectId: string) => string | undefined;
  referenceBoardRequired?: boolean;
}

// Guidance reads saved answers from ConfidenceController. Practice state contains
// only observed actions; selecting/deselecting an object never constitutes Save.
export class TutorialController {
  private step: TutorialStep["id"] = "intro";
  private firstGroupId?: string;
  private magnifierActive = false;
  private sessionZoomChanged = false;
  private magnifierComplete = false;
  private pauseState: "available" | "confirming" | "paused" | "complete" = "available";

  constructor(
    private readonly referenceMode: "preview_10s" | "persistent" = "preview_10s",
    private readonly locale: "en-US" | "zh-CN" = "en-US",
    private readonly facts: TutorialFacts = {},
  ) {}

  getCurrentStep(): TutorialStep {
    const [anchor, task, message, expectedEvent] = guidance[this.step];
    const chinese = this.locale === "zh-CN";
    const persistentIntro = this.step === "intro" && this.referenceMode === "persistent";
    return { id: this.step, anchor,
      task: (chinese ? "你的任务：" : "Your task: ") + (persistentIntro
        ? (chinese ? "观察透视图，准备还原平面图。" : "Study the perspective image and prepare to reconstruct the floor plan.")
        : task[chinese ? 1 : 0]),
      message: persistentIntro
        ? (chinese
          ? "你可以随时查看透视图。请注意每件标记家具是否出现、位置和方向。"
          : "You may refer to the image at any time. Remember each marked item's presence, position, and orientation.")
        : message[chinese ? 1 : 0],
      expectedEvent: this.step === "intro" && this.referenceMode === "persistent" ? "reconstruction_started" : expectedEvent };
  }

  isComplete(): boolean { return this.step === "complete"; }

  isInteractionBlocked(): boolean {
    return this.magnifierActive || this.pauseState === "confirming" || this.pauseState === "paused"
      || ["intro", "preview", "view_direction", "reference_board", "magnifier_practice", "pause_practice", "complete"].includes(this.step);
  }

  canSelectObject(objectId: string): boolean {
    if (this.isInteractionBlocked()) return false;
    if (this.step !== "select_first") return true;
    const groupId = this.facts.getGroupId?.(objectId);
    return !!groupId && !!this.facts.confidence?.getRequiredGroupIds().includes(groupId)
      && !this.facts.confidence.getFinalConfidence()[groupId];
  }

  canStartMagnifier(): boolean {
    return !this.magnifierActive && this.pauseState !== "confirming" && this.pauseState !== "paused"
      && (this.step === "magnifier_practice" || !this.isInteractionBlocked());
  }

  canStartPause(): boolean {
    return this.step === "pause_practice" && this.pauseState === "available" && !this.magnifierActive;
  }

  canSubmit(): boolean {
    const confidence = this.facts.confidence;
    return this.step === "submit" && this.magnifierComplete && this.pauseState === "complete"
      && !this.magnifierActive && !!confidence && confidence.getActiveGroupId() === undefined
      && confidence.canLeaveActiveGroup().ok && this.allGroupsSaved();
  }

  handle(event: TutorialEvent, payload: TutorialEventPayload = {}): boolean {
    if (event === "magnifier_entered") {
      if (!this.canStartMagnifier()) return false;
      this.magnifierActive = true; this.sessionZoomChanged = false; return true;
    }
    if (event === "magnifier_zoom_changed") {
      if (!this.magnifierActive || !Number.isFinite(payload.zoomBefore) || !Number.isFinite(payload.zoomAfter)
        || payload.zoomBefore === payload.zoomAfter) return false;
      this.sessionZoomChanged = true; return true;
    }
    if (event === "magnifier_exited") {
      if (!this.magnifierActive) return false;
      this.magnifierActive = false;
      if (this.step === "magnifier_practice" && this.sessionZoomChanged && payload.exitReason === "escape") {
        this.magnifierComplete = true; this.step = "select_first";
      }
      this.sessionZoomChanged = false; return true;
    }
    if (event === "pause_requested") {
      if (!this.canStartPause()) return false;
      this.pauseState = "confirming"; return true;
    }
    if (event === "pause_cancelled") {
      if (this.pauseState !== "confirming") return false;
      this.pauseState = "available"; return true;
    }
    if (event === "pause_confirmed") {
      if (this.pauseState !== "confirming") return false;
      this.pauseState = "paused"; return true;
    }
    if (event === "pause_resumed") {
      if (this.pauseState !== "paused" || !["manual_resume", "auto_resume_10s"].includes(payload.resumeReason ?? "")) return false;
      this.pauseState = "complete"; this.step = this.allGroupsSaved() ? "submit" : "remaining_objects"; return true;
    }
    if (this.magnifierActive || this.pauseState === "confirming" || this.pauseState === "paused") return false;
    if (this.step === "intro" && event === this.getCurrentStep().expectedEvent) {
      this.step = this.referenceMode === "persistent"
        ? (this.facts.referenceBoardRequired ? "reference_board" : "view_direction") : "preview"; return true;
    }
    if (this.step === "preview" && event === "reconstruction_started") {
      this.step = this.facts.referenceBoardRequired ? "reference_board" : "view_direction"; return true;
    }
    if (this.step === "reference_board" && event === "reference_board_completed") { this.step = "view_direction"; return true; }
    if (this.step === "view_direction" && event === "view_direction_acknowledged") {
      this.step = "magnifier_practice"; return true;
    }
    if (this.step === "select_first" && event === "object_selected" && payload.objectId && this.canSelectObject(payload.objectId)) {
      this.firstGroupId = this.facts.getGroupId?.(payload.objectId); this.step = "confidence_first"; return true;
    }
    if (this.step === "confidence_first" && event === "confidence_chosen") {
      const gate = this.facts.confidence?.canLeaveActiveGroup();
      if (!gate || gate.ok || gate.reason !== "confidence_save_required") return false;
      this.step = "save_first"; return true;
    }
    if (event === "object_saved") {
      const groupId = payload.objectId && this.facts.getGroupId?.(payload.objectId);
      if (!groupId || !this.facts.confidence?.getFinalConfidence()[groupId]
        || this.facts.confidence.getActiveGroupId() !== undefined) return false;
      if (this.step === "save_first" && groupId === this.firstGroupId) { this.step = "pause_practice"; return true; }
      if (this.step === "remaining_objects" && this.allGroupsSaved()) { this.step = "submit"; return true; }
    }
    if (event === "submitted" && this.canSubmit()) { this.step = "complete"; return true; }
    return false;
  }

  private allGroupsSaved(): boolean {
    const confidence = this.facts.confidence;
    if (!confidence) return false;
    const saved = confidence.getFinalConfidence();
    return confidence.getRequiredGroupIds().every((id) => saved[id]?.position !== undefined && saved[id]?.rotation !== undefined);
  }
}

type Guidance = [string, [string, string], [string, string], TutorialEvent?];
const guidance: Record<TutorialStep["id"], Guidance> = {
  intro: ["flow-modal", ["Study the image and prepare to reconstruct the floor plan.", "观察参考图，准备还原平面图。"],
    ["You have 10 seconds to remember each marked item's presence, position, and orientation.", "你有 10 秒记住每件标记家具是否出现、位置和方向。"], "preview_acknowledged"],
  preview: ["display-image", ["Remember the furniture before the image disappears.", "在图片消失前记住家具信息。"],
    ["Study the image until the countdown ends.", "请观察图片，直到倒计时结束。"], "reconstruction_started"],
  view_direction: ["viewport-tools", ["Confirm the viewing direction shown by the yellow arrow.", "确认黄色箭头所示的观察方向。"],
    ["The observer is at the bottom of the plan. This direction stays fixed throughout the experiment.", "观察者位于平面图下方；该方向在整个实验中保持不变。"], "view_direction_acknowledged"],
  reference_board: ["reference-board", ["Inspect each furniture arrangement.", "观察每组家具的摆放。"],
    ["Click and hold either floor plan to drag; use the wheel while holding to zoom. Dragging is optional.", "按住并拖动平面图，按住时可用滚轮缩放；拖动不是必做项。"], "reference_board_completed"],
  magnifier_practice: ["viewport-tools", ["Open the magnifier, change its zoom with the wheel, then press ESC to exit.", "打开放大镜，滚轮调节倍率，再按 ESC 退出。"],
    ["It magnifies only the floor plan. Do not enlarge the perspective image with browser zoom, Ctrl+scroll, or another tool; these actions may be recorded.", "放大镜仅用于平面图。请勿用浏览器缩放、Ctrl+滚轮或其他工具放大透视图；这些行为可能会被记录。"], "magnifier_exited"],
  select_first: ["stage", ["Click a glowing yellow object to begin editing.", "点击发红光的黄色物体，开始编辑。"],
    ["Red glow means its first edit has not been saved. Only yellow objects can be edited.", "红光表示尚未保存首次编辑。只有黄色物体可以编辑。"], "object_selected"],
  confidence_first: ["confidence", ["Match this object's position and orientation to the perspective image.", "根据透视图，还原所选家具的位置和方向。"],
    ["Refer to the control tips in the gray box on the right, then rate your confidence in position and orientation at the bottom left.", "参考页面右侧灰色框中的操作提示，完成调整后在左下方填写位置和方向置信度。"], "confidence_chosen"],
  save_first: ["confidence", ["Save both ratings.", "保存两项置信度。"],
    ["Select Save to finish this edit. The red glow disappears after the first save.", "点击 Save 完成本次编辑；首次保存后红光消失。"], "object_saved"],
  pause_practice: ["pause", ["Complete the Pause practice.", "完成 Pause 练习。"],
    ["Click the highlighted Pause button and confirm. Wait for automatic resume or choose Resume.", "点击高亮的 Pause 并确认；等待自动恢复，或点击 Resume。"], "pause_resumed"],
  remaining_objects: ["stage", ["Edit and save each remaining yellow object.", "编辑并保存其余每个黄色物体。"],
    ["Save both position and orientation confidence ratings for each one.", "每个都要保存位置和方向两项置信度。"], "object_saved"],
  submit: ["confirm", ["Finish all remaining objects, then continue.", "完成所有剩余物体，然后继续。"],
    ["Every yellow object must have both ratings saved at least once. You can reopen any saved object and edit it as often as you like. Select Confirm when all are saved.", "每个黄色物体都必须至少保存两项置信度一次；之后可无限次重新编辑。全部保存后选择 Confirm。"], "submitted"],
  complete: ["status", ["Tutorial complete.", "教程完成。"], ["Tutorial complete.", "教程完成。"]],
};
