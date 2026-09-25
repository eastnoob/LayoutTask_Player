import type { RuntimeTaskConfig, RuntimeTaskObject } from "../types/runtime";
import type { ConfidenceByGroup, ConfidenceDimension } from "../types/result";

export type ConfidenceGateResult =
  | { ok: true }
  | {
      ok: false;
      reason: "confidence_required" | "confidence_save_required" | "missing_confidence";
      groupId: string;
    };

export interface ConfidenceControllerOptions {
  config: RuntimeTaskConfig;
  required: boolean;
  scale: number[];
  requireAllGroupsOnSubmit?: boolean;
}

export class ConfidenceController {
  private activeGroupId: string | undefined;
  private activeValues: Partial<Record<ConfidenceDimension, number>> = {};
  private readonly finalValues = new Map<string, { position: number; rotation: number }>();
  private readonly objectToGroup = new Map<string, string>();
  private readonly requiredGroupIds: string[];

  constructor(private readonly options: ConfidenceControllerOptions) {
    const required = new Set<string>();

    for (const object of options.config.objects) {
      const groupId = getConfidenceGroupId(object);
      this.objectToGroup.set(object.id, groupId);
      if (object.role === "variable") {
        required.add(groupId);
      }
    }

    this.requiredGroupIds = Array.from(required);
  }

  getRequiredGroupIds(): string[] {
    return [...this.requiredGroupIds];
  }

  canEnterObjectEdit(objectId: string): ConfidenceGateResult {
    if (!this.options.required) {
      return { ok: true };
    }

    const nextGroupId = this.objectToGroup.get(objectId);
    if (!nextGroupId || nextGroupId === this.activeGroupId) {
      return { ok: true };
    }

    return this.canLeaveActiveGroup();
  }

  enterObjectEdit(objectId: string): void {
    const groupId = this.objectToGroup.get(objectId);
    if (!groupId || !this.requiredGroupIds.includes(groupId)) {
      this.activeGroupId = undefined;
      this.activeValues = {};
      return;
    }

    this.activeGroupId = groupId;
    this.activeValues = {};
  }

  choose(dimension: ConfidenceDimension, value: number): void {
    if (!this.activeGroupId || !this.options.scale.includes(value)) {
      return;
    }

    this.activeValues[dimension] = value;
  }

  canLeaveActiveGroup(): ConfidenceGateResult {
    if (!this.options.required || !this.activeGroupId) {
      return { ok: true };
    }

    const complete = this.activeValues.position !== undefined && this.activeValues.rotation !== undefined;
    return complete
      ? { ok: false, reason: "confidence_save_required", groupId: this.activeGroupId }
      : { ok: false, reason: "confidence_required", groupId: this.activeGroupId };
  }

  saveActiveGroup(): ConfidenceGateResult {
    if (!this.activeGroupId) {
      return { ok: true };
    }

    if (this.activeValues.position === undefined || this.activeValues.rotation === undefined) {
      if (this.options.required) {
        return { ok: false, reason: "confidence_required", groupId: this.activeGroupId };
      }

      this.activeGroupId = undefined;
      return { ok: true };
    }

    this.finalValues.set(this.activeGroupId, {
      position: this.activeValues.position,
      rotation: this.activeValues.rotation,
    });
    this.activeGroupId = undefined;
    this.activeValues = {};
    return { ok: true };
  }

  canSubmit(): ConfidenceGateResult {
    if (!this.options.required) {
      return { ok: true };
    }

    const activeGate = this.canLeaveActiveGroup();
    if (!activeGate.ok) {
      return activeGate;
    }

    if (this.options.requireAllGroupsOnSubmit) {
      const missingGroupId = this.requiredGroupIds.find((groupId) => !this.finalValues.has(groupId));
      if (missingGroupId) {
        return { ok: false, reason: "missing_confidence", groupId: missingGroupId };
      }
    }

    return { ok: true };
  }

  getActiveGroupId(): string | undefined {
    return this.activeGroupId;
  }

  getFinalConfidence(): ConfidenceByGroup {
    return Object.fromEntries(this.finalValues);
  }
}

function getConfidenceGroupId(object: RuntimeTaskObject): string {
  return object.group_id ?? object.id;
}
