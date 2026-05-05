import type { LayoutTaskMessages, MessagesConfig } from "../types/config";

export const DEFAULT_MESSAGES: LayoutTaskMessages = {
  confirm_lock_1: "After confirmation, the object layout will be locked. Continue?",
  confirm_lock_2: "Please confirm again: this will finalize the current layout.",
  confirm_no_edit: "You have not edited any object. Are you sure this unchanged layout is your final answer?",
  status_ready: "Ready",
  status_copy_again_ok: "Encoded result copied again.",
  status_copy_again_fail: "Copy failed. Please copy the encoded result manually.",
  instruction_edit_mode:
    "Click an object to enter edit mode. Controls stay visible until you tap the stage background to exit.",
};

// Messages stay shallow for now: enough to centralize user-visible text without a full i18n layer.
// 研究者可以逐步覆盖文案；没有覆盖的字段继续使用英文默认值。
export function resolveMessages(messages?: MessagesConfig): LayoutTaskMessages {
  return {
    ...DEFAULT_MESSAGES,
    ...messages,
  };
}
