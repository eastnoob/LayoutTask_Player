import type { LayoutTaskMessages, MessagesConfig } from "../types/config";

export const DEFAULT_MESSAGES: LayoutTaskMessages = {
  confirm_lock_1: "After confirmation, the object layout will be locked. Continue?",
  confirm_lock_2: "Please confirm again: this will finalize the current layout.",
  confirm_no_edit: "You have not edited any object. Are you sure this unchanged layout is your final answer?",
  status_ready: "Ready",
  status_copy_again_ok: "Encoded result copied.",
  status_copy_again_fail: "Copy failed. Please copy the encoded result manually.",
  instruction_edit_mode:
    "The picture is shown at the top of the page. Reconstruct the floor plan as closely as possible to the picture, then choose confidence ratings for both position and rotation.",
  reconstruction_hint_title: "Reconstruct the floor plan based on the picture you just studied.",
  reconstruction_hint_drag: "Drag movable objects to place them.",
  reconstruction_hint_button: "Use the arrow buttons to move selected objects.",
  reconstruction_hint_rotation: "Use the rotate buttons to adjust orientation.",
  reconstruction_hint_select: "Click an object to show its available controls.",
  reconstruction_hint_no_information:
    "If you truly cannot obtain any information, click the furniture without changing its position or rotation, then set both confidence ratings to Completely unsure. Use this option sparingly: too many such responses may lead to rejection.",
};

const CHINESE_MESSAGES: LayoutTaskMessages = {
  confirm_lock_1: "确认后，家具布局将被锁定。继续吗？",
  confirm_lock_2: "请再次确认：这将提交当前家具布局。",
  confirm_no_edit: "你尚未编辑任何物体，确定要提交这个未改变的布局吗？",
  status_ready: "准备就绪",
  status_copy_again_ok: "已再次复制编码结果。",
  status_copy_again_fail: "复制失败。请手动复制编码结果。",
  instruction_edit_mode: "图片显示在页面顶部。请尽可能根据图片恢复下方平面图，然后分别选择位置和旋转的置信度。",
  reconstruction_hint_title: "请根据刚才看到的图片还原场景平面图。",
  reconstruction_hint_drag: "拖动可移动物体进行摆放。",
  reconstruction_hint_button: "使用箭头按钮移动选中的物体。",
  reconstruction_hint_rotation: "使用旋转按钮调整方向。",
  reconstruction_hint_select: "点击物体以显示可用的操作。",
  reconstruction_hint_no_information:
    "如果你确实无法获得任何信息，只需点击家具，不改变其位置和旋转，然后将两个置信度选择为“完全不确定”。请谨慎使用：过多此类回答可能导致答案被拒绝。",
};

// Messages stay shallow for now: enough to centralize user-visible text without a full i18n layer.
// 研究者可以逐步覆盖文案；没有覆盖的字段继续使用英文默认值。
export function resolveMessages(messages?: MessagesConfig, locale: "en-US" | "zh-CN" = "en-US"): LayoutTaskMessages {
  return {
    ...DEFAULT_MESSAGES,
    ...messages,
    ...(locale === "zh-CN" ? CHINESE_MESSAGES : {}),
  };
}
