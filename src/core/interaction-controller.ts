import type { LayoutTaskEvent, LayoutAction } from "../types/events";
import type { RuntimeTaskConfig } from "../types/runtime";
import type { LayoutTaskRenderer } from "./renderer";
import type { StateStore } from "./state-store";

export interface ActionRequest {
  objectId: string;
  action: LayoutAction;
  pointer?: { clientX: number; clientY: number; worldX?: number; worldY?: number };
}

interface InteractionRecorder {
  recordEvent(event: Omit<LayoutTaskEvent, "i" | "t">): LayoutTaskEvent;
}

// InteractionController is the behavior layer between SVG UI and state transitions.
// 它负责“能不能做”“做了以后记什么”“以及 UI 应该怎么响应”。
export class InteractionController {
  private activeObjectId: string | undefined;
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
    this.options.renderer.clearActiveObject();
  }

  selectObject(objectId: string): void {
    if (!this.bound || this.options.store.isLocked()) {
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
    if (!this.bound || !this.activeObjectId) {
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
      this.options.renderer.updateControlsDisabled(request.objectId);
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

  getActiveObjectId(): string | undefined {
    return this.activeObjectId;
  }

  private recordBlockedEvent(
    request: ActionRequest,
    reason: { ok: false; reason?: string }["reason"] | "locked",
  ): void {
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
    reason === "rotation_disabled"
  );
}
