import type { LayoutTaskEvent, LayoutAction, ObjectOffsets, ObjectPose, OperationCounts } from "../types/events";
import type { RuntimeTaskConfig } from "../types/runtime";
import { isObjectInteractive, type LayoutTaskRenderer, type RendererPointer } from "./renderer";
import type { DragTransition, StateStore } from "./state-store";

export interface ActionRequest {
  objectId: string;
  action: LayoutAction;
  pointer?: { clientX: number; clientY: number; worldX?: number; worldY?: number };
}

export interface DragRequest {
  objectId: string;
  pointer: RendererPointer;
}

interface InteractionRecorder {
  recordEvent(event: Omit<LayoutTaskEvent, "i" | "t">): LayoutTaskEvent;
}

interface DragSession {
  objectId: string;
  pointerId: number;
  startPose: ObjectPose;
  startOffsets: ObjectOffsets;
  startCounts: OperationCounts;
  grabOffset: { x: number; y: number };
}

// InteractionController is the behavior layer between renderer gestures and
// StateStore rule checks. It owns selection, status/feedback, and recording of
// user intent around each action, while StateStore stays focused on pose rules.
export class InteractionController {
  private activeObjectId: string | undefined;
  private dragSession: DragSession | undefined;
  private lastDragLimitFeedbackAt = 0;
  private bound = false;

  constructor(
    private readonly options: {
      config: RuntimeTaskConfig;
      store: StateStore;
      renderer: LayoutTaskRenderer;
      recorder: InteractionRecorder;
    },
  ) {}

  bind(): void {
    this.bound = true;
  }

  unbind(): void {
    this.bound = false;
    this.activeObjectId = undefined;
    this.dragSession = undefined;
    this.options.renderer.clearActiveObject();
  }

  selectObject(objectId: string): void {
    if (!this.bound || this.options.store.isLocked()) {
      return;
    }

    const objectConfig = this.options.config.objects.find((item) => item.id === objectId);
    // Fixed/context objects can still be visible collision geometry, but only
    // interactive variable objects should enter reconstruction edit mode.
    if (!objectConfig || !isObjectInteractive(objectConfig)) {
      return;
    }

    if (this.activeObjectId && this.activeObjectId !== objectId) {
      this.options.renderer.setStatus(
        `Editing ${this.activeObjectId}. Tap the stage background to exit before selecting another object.`,
      );
      return;
    }

    this.activeObjectId = objectId;
    this.options.renderer.activateObject(objectId);
    this.options.renderer.updateControlsDisabled(objectId);
    this.options.renderer.setStatus(`Editing ${objectId}. Tap the stage background to exit edit mode.`);
  }

  deselectObject(): void {
    if (!this.bound || !this.activeObjectId || this.dragSession) {
      return;
    }

    const previousObjectId = this.activeObjectId;
    this.activeObjectId = undefined;
    this.options.renderer.clearActiveObject();
    this.options.renderer.setStatus(`Exited ${previousObjectId} edit mode.`);
  }

  requestAction(request: ActionRequest): { ok: boolean; reason?: string } {
    if (!this.bound) {
      return { ok: false, reason: "controller_not_bound" };
    }

    if (this.activeObjectId !== request.objectId) {
      this.options.renderer.setStatus("Select an object before using its controls.");
      return { ok: false, reason: "object_not_active" };
    }

    if (this.options.store.isLocked()) {
      this.options.renderer.setStatus("Task is locked. Use the copy button to copy the saved result.");
      this.recordBlockedEvent(request, "locked");
      return { ok: false, reason: "locked" };
    }

    const canApply = this.options.store.canApplyAction(request.objectId, request.action);
    if (!canApply.ok) {
      // The attempted gesture still matters for analysis, even though the store
      // rejects the candidate pose and leaves object state unchanged.
      this.options.renderer.updateControlsDisabled(request.objectId);
      if (canApply.reason === "limit_reached" || canApply.reason === "collision") {
        this.options.renderer.showLimitFeedback(request.objectId, request.action);
      }
      this.options.renderer.setStatus(`${request.objectId}: ${request.action} is unavailable (${canApply.reason}).`);
      this.recordBlockedEvent(request, canApply.reason);
      return { ok: false, reason: canApply.reason };
    }

    const transition = this.options.store.applyAction(request.objectId, request.action);
    if (this.options.config.recording.record_events) {
      this.options.recorder.recordEvent({
        object: request.objectId,
        action: request.action,
        valid: true,
        before: transition.before,
        after: transition.after,
        counts: transition.counts,
        offsets: transition.offsets,
        pointer: request.pointer,
      });
    }

    this.options.renderer.updateObject(request.objectId);
    this.options.renderer.updateControlsDisabled(request.objectId);
    this.options.renderer.setStatus(`${request.objectId}: ${request.action} applied.`);
    return { ok: true };
  }

  requestDragStart(request: DragRequest): { ok: boolean; reason?: string } {
    if (!this.bound) {
      return { ok: false, reason: "controller_not_bound" };
    }

    const canDrag = this.options.store.canDragObject(request.objectId);
    if (!canDrag.ok) {
      if (canDrag.reason === "locked") {
        this.options.renderer.setStatus("Task is locked. Use the copy button to copy the saved result.");
      }
      return { ok: false, reason: canDrag.reason };
    }

    if (this.activeObjectId && this.activeObjectId !== request.objectId) {
      this.options.renderer.setStatus(
        `Editing ${this.activeObjectId}. Tap the stage background to exit before dragging another object.`,
      );
      return { ok: false, reason: "object_not_active" };
    }

    const state = this.options.store.getObjectState(request.objectId);
    this.activeObjectId = request.objectId;
    this.dragSession = {
      objectId: request.objectId,
      pointerId: request.pointer.pointerId,
      startPose: { x: state.x, y: state.y, r: state.r },
      startCounts: { ...state.counts },
      startOffsets: this.options.store.getObjectOffsets(request.objectId),
      grabOffset: {
        x: request.pointer.worldX - state.x,
        y: request.pointer.worldY - state.y,
      },
    };

    this.options.renderer.activateObject(request.objectId);
    this.options.renderer.setDragging(request.objectId, true);
    this.options.renderer.setStatus(`Dragging ${request.objectId}.`);
    this.recordDragStart(request);
    return { ok: true };
  }

  requestDragMove(request: DragRequest): { ok: boolean; reason?: string } {
    const session = this.dragSession;
    if (!session || session.objectId !== request.objectId || session.pointerId !== request.pointer.pointerId) {
      return { ok: false, reason: "drag_not_active" };
    }

    const transition = this.applyDragFromPointer(session, request.pointer);
    this.options.renderer.updateObject(request.objectId);
    this.options.renderer.updateControlsDisabled(request.objectId);
    this.showDragLimitFeedback(request.objectId, transition);
    this.recordBlockedDragMove(request, transition);
    this.options.renderer.setStatus(`${request.objectId}: dragged to ${transition.after.x}, ${transition.after.y}.`);
    return { ok: true };
  }

  requestDragEnd(request: DragRequest): { ok: boolean; reason?: string } {
    const session = this.dragSession;
    if (!session || session.objectId !== request.objectId || session.pointerId !== request.pointer.pointerId) {
      return { ok: false, reason: "drag_not_active" };
    }

    const transition = this.applyDragFromPointer(session, request.pointer);
    this.recordBlockedDragMove(request, transition);
    this.recordDragEnd(session, request, transition);
    this.dragSession = undefined;
    this.options.renderer.setDragging(request.objectId, false);
    this.options.renderer.updateObject(request.objectId);
    this.options.renderer.updateControlsDisabled(request.objectId);
    this.options.renderer.setStatus(`${request.objectId}: drag finished.`);
    return { ok: true };
  }

  requestDragCancel(request: DragRequest): { ok: boolean; reason?: string } {
    const session = this.dragSession;
    if (!session || session.objectId !== request.objectId || session.pointerId !== request.pointer.pointerId) {
      return { ok: false, reason: "drag_not_active" };
    }

    this.dragSession = undefined;
    this.options.renderer.setDragging(request.objectId, false);
    this.options.renderer.updateObject(request.objectId);
    this.options.renderer.setStatus(`${request.objectId}: drag cancelled.`);
    return { ok: true };
  }

  getActiveObjectId(): string | undefined {
    return this.activeObjectId;
  }

  private applyDragFromPointer(session: DragSession, pointer: RendererPointer): DragTransition {
    // Pointer world position is converted in Renderer; controller only applies grab offset.
    // 这样拖拽开始点不会强行跳到物体中心。
    return this.options.store.applyDragPosition(session.objectId, {
      x: pointer.worldX - session.grabOffset.x,
      y: pointer.worldY - session.grabOffset.y,
    });
  }

  private showDragLimitFeedback(objectId: string, transition: DragTransition): void {
    if (!transition.limitedAction) {
      return;
    }

    const now = Date.now();
    if (now - this.lastDragLimitFeedbackAt < 800) {
      return;
    }

    this.lastDragLimitFeedbackAt = now;
    this.options.renderer.showLimitFeedback(objectId, transition.limitedAction);
  }

  private recordDragStart(request: DragRequest): void {
    if (!this.options.config.recording.record_events || !this.dragSession) {
      return;
    }

    this.options.recorder.recordEvent({
      object: request.objectId,
      action: "drag_start",
      valid: true,
      before: this.dragSession.startPose,
      after: this.dragSession.startPose,
      counts: this.dragSession.startCounts,
      offsets: this.dragSession.startOffsets,
      pointer: request.pointer,
    });
  }

  private recordDragEnd(session: DragSession, request: DragRequest, transition: DragTransition): void {
    if (!this.options.config.recording.record_events) {
      return;
    }

    this.options.recorder.recordEvent({
      object: request.objectId,
      action: "drag_end",
      valid: true,
      before: session.startPose,
      after: transition.after,
      counts: transition.counts,
      offsets: transition.offsets,
      pointer: request.pointer,
    });
  }

  private recordBlockedDragMove(request: DragRequest, transition: DragTransition): void {
    if (!this.options.config.recording.record_blocked_events || transition.blockedReason !== "collision") {
      return;
    }

    this.options.recorder.recordEvent({
      object: request.objectId,
      action: "drag_move",
      valid: false,
      blocked_reason: transition.blockedReason,
      before: transition.before,
      after: transition.after,
      counts: transition.counts,
      offsets: transition.offsets,
      pointer: request.pointer,
    });
  }

  private recordBlockedEvent(
    request: ActionRequest,
    reason: { ok: false; reason?: string }["reason"] | "locked",
  ): void {
    // Blocked attempts are recorded in the controller because the gesture and
    // pointer context are real participant intent, even when StateStore keeps
    // the pose unchanged after rejecting the action.
    if (!this.options.config.recording.record_blocked_events) {
      return;
    }

    if (!isRecordableBlockedReason(reason)) {
      return;
    }

    const state = this.options.store.getObjectState(request.objectId);
    this.options.recorder.recordEvent({
      object: request.objectId,
      action: request.action,
      valid: false,
      blocked_reason: reason,
      before: {
        x: state.x,
        y: state.y,
        r: state.r,
      },
      after: {
        x: state.x,
        y: state.y,
        r: state.r,
      },
      counts: state.counts,
      offsets: this.options.store.getObjectOffsets(request.objectId),
      pointer: request.pointer,
    });
  }
}

function isRecordableBlockedReason(
  reason: string | undefined,
): reason is NonNullable<LayoutTaskEvent["blocked_reason"]> {
  return (
    reason === "locked" ||
    reason === "limit_reached" ||
    reason === "movement_disabled" ||
    reason === "rotation_disabled" ||
    reason === "collision"
  );
}
