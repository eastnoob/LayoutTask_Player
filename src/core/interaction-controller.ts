import type { LayoutAction } from "../types/events";

// Reserved home for future interaction wiring.
// 当前最小版本把点击接在 renderer/main 上；drag、keyboard policy、blocked-event logging
// 后续可以集中迁移到这里。
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
