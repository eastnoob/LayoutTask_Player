import type { LayoutAction } from "../types/events";

export interface ActionRequest {
  objectId: string;
  action: LayoutAction;
}

export class InteractionController {
  bind(): void {
    // Placeholder for v0.1 interaction wiring.
  }

  unbind(): void {
    // Placeholder for v0.1 interaction teardown.
  }

  requestAction(_request: ActionRequest): { ok: boolean } {
    return { ok: false };
  }
}
