import type { RuntimeTaskConfig, RuntimeTaskObject } from "../types/runtime";

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
  private activeValue: number | undefined;
  private readonly finalValues = new Map<string, number>();
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
      this.activeValue = undefined;
      return;
    }

    this.activeGroupId = groupId;
    this.activeValue = undefined;
  }

  choose(value: number): void {
    if (!this.activeGroupId || !this.options.scale.includes(value)) {
      return;
    }

    this.activeValue = value;
  }

  canLeaveActiveGroup(): ConfidenceGateResult {
    if (!this.options.required || !this.activeGroupId) {
      return { ok: true };
    }

    return {
      ok: false,
      reason: this.activeValue === undefined ? "confidence_required" : "confidence_save_required",
      groupId: this.activeGroupId,
    };
  }

  saveActiveGroup(): ConfidenceGateResult {
    if (!this.activeGroupId) {
      return { ok: true };
    }

    if (this.activeValue === undefined) {
      if (this.options.required) {
        return { ok: false, reason: "confidence_required", groupId: this.activeGroupId };
      }

      this.activeGroupId = undefined;
      return { ok: true };
    }

    this.finalValues.set(this.activeGroupId, this.activeValue);
    this.activeGroupId = undefined;
    this.activeValue = undefined;
    return { ok: true };
  }

  canSubmit(): ConfidenceGateResult {
    if (!this.options.required) {
      return { ok: true };
    }

    return this.canLeaveActiveGroup();
  }

  getActiveGroupId(): string | undefined {
    return this.activeGroupId;
  }

  getFinalConfidence(): Record<string, number> {
    return Object.fromEntries(this.finalValues);
  }
}

function getConfidenceGroupId(object: RuntimeTaskObject): string {
  return object.group_id ?? object.id;
}
