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
    return { id: this.step, anchor, task: (chinese ? "你的任务：" : "Your task: ") + task[chinese ? 1 : 0],
      message: this.step === "intro" && this.referenceMode === "persistent"
        ? (chinese ? "你可以随时查看透视图。请注意每件标记家具的位置和方向。" : "You may refer to the perspective image at any time. Remember each marked item's position and orientation.")
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
      this.step = this.referenceMode === "persistent" ? "view_direction" : "preview"; return true;
    }
    if (this.step === "preview" && event === "reconstruction_started") { this.step = "view_direction"; return true; }
    if (this.step === "view_direction" && event === "view_direction_acknowledged") {
      this.step = this.facts.referenceBoardRequired ? "reference_board" : "magnifier_practice"; return true;
    }
    if (this.step === "reference_board" && event === "reference_board_completed") { this.step = "magnifier_practice"; return true; }
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
  intro: ["flow-modal", ["Study the reference image and prepare to reconstruct the floor plan.", "观察参考图，准备还原平面图。"],
    ["You have 10 seconds to remember the furniture positions and orientations.", "你有 10 秒记住家具的位置和方向。"], "preview_acknowledged"],
  preview: ["display-image", ["Remember the furniture before the image disappears.", "在图片消失前记住家具信息。"],
    ["Study the image until the countdown ends.", "请观察图片，直到倒计时结束。"], "reconstruction_started"],
  view_direction: ["viewport-tools", ["Confirm the viewing direction shown by the yellow arrow.", "确认黄色箭头所示的观察方向。"],
    ["You are standing at the bottom of the floor plan. The yellow arrow shows your viewing direction throughout the experiment.", "你当前站在平面图的最下方。黄色箭头表示整个实验中的观察方向。"], "view_direction_acknowledged"],
  reference_board: ["reference-board", ["Study the four furniture reference pages.", "观察四页家具参考板。"],
    ["Each page becomes available to continue after 5 seconds.", "每页观察 5 秒后即可继续。"], "reference_board_completed"],
  magnifier_practice: ["viewport-tools", ["Try the magnifier, change its zoom, then press ESC.", "使用放大镜，改变倍率后按 ESC 退出。"],
    ["Enter the magnifier, use the wheel to change the zoom, and press ESC in the same use. You can retry after an early exit.", "进入放大镜，使用滚轮改变倍率，并在同一次使用中按 ESC 退出。提前退出后可以重试。"], "magnifier_exited"],
  select_first: ["stage", ["Click an unsaved yellow object to begin editing.", "点击一个尚未保存的黄色物体，开始编辑。"],
    ["Click one [[yellow]]yellow object[[/yellow]] to enter edit mode.", "点击一个尚未保存的[[yellow]]黄色物体[[/yellow]]进入编辑模式。"], "object_selected"],
  confidence_first: ["confidence", ["Choose both position and rotation confidence ratings.", "选择位置与方向两项置信度。"],
    ["Use the arrow and rotate buttons if needed, or keep the current pose. Choose both confidence ratings below.", "可使用箭头和旋转按钮调整，也可保持当前姿态。请在下方选择两项置信度。"], "confidence_chosen"],
  save_first: ["confidence", ["Save both ratings for this object.", "保存这个物体的两项置信度。"],
    ["Click **Save** to store both ratings and leave edit mode.", "点击**Save**保存两项置信度并退出编辑模式。"], "object_saved"],
  pause_practice: ["pause", ["Try Pause, confirm, then resume.", "点击暂停并确认，然后恢复。"],
    ["Confirm Pause, then select Resume or wait for the 10-second automatic resume. Cancelling confirmation allows another try.", "确认暂停后，点击恢复或等待 10 秒自动恢复。取消确认后可以重试。"], "pause_resumed"],
  remaining_objects: ["stage", ["Save both ratings for every remaining yellow object.", "为每个剩余黄色物体保存两项置信度。"],
    ["You may keep each pose or adjust it before choosing both ratings and clicking **Save**.", "可以保持或调整姿态，再选择两项置信度并点击**Save**。"], "object_saved"],
  submit: ["confirm", ["Submit your saved furniture answers.", "提交已保存的家具回答。"],
    ["Every required furniture group must have both ratings saved. Finish any current edit before selecting **Confirm**.", "每个必答家具组都必须保存两项置信度。完成当前编辑后选择**Confirm**。"], "submitted"],
  complete: ["status", ["Tutorial complete.", "教程完成。"], ["Tutorial complete.", "教程完成。"]],
};
