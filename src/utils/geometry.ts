export function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export interface MovementLimitFeedbackInput {
  origin: { x: number; y: number };
  step: number;
  objectWidth?: number;
  objectHeight?: number;
  maxLeft?: number;
  maxRight?: number;
  maxUp?: number;
  maxDown?: number;
}

export interface MovementLimitFeedbackRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RotationLimitFeedbackInput {
  center: { x: number; y: number };
  radius: number;
  initialRotation: number;
  step: number;
  maxCw?: number;
  maxCcw?: number;
}

export interface RotationLimitFeedbackArc {
  path: string;
  markerX: number;
  markerY: number;
  limitAngle: number;
}

// These helpers only describe SVG feedback geometry.
// 它们不进入 result data，只负责把“限制边界 / reachable area”稳定地画出来。
export function getMovementLimitFeedbackRect(input: MovementLimitFeedbackInput): MovementLimitFeedbackRect {
  const objectWidth = input.objectWidth ?? input.step;
  const objectHeight = input.objectHeight ?? input.step;
  const leftSteps = input.maxLeft ?? 0;
  const rightSteps = input.maxRight ?? 0;
  const upSteps = input.maxUp ?? 0;
  const downSteps = input.maxDown ?? 0;

  const minCenterX = input.origin.x - leftSteps * input.step;
  const maxCenterX = input.origin.x + rightSteps * input.step;
  const minCenterY = input.origin.y - upSteps * input.step;
  const maxCenterY = input.origin.y + downSteps * input.step;

  // The task's movement rule constrains the object center, but participants perceive
  // the whole object body. 所以这里直接画整个可到达区域的大矩形，更符合任务直觉。
  return {
    x: minCenterX - objectWidth / 2,
    y: minCenterY - objectHeight / 2,
    width: Math.max(maxCenterX - minCenterX, input.step) + objectWidth,
    height: Math.max(maxCenterY - minCenterY, input.step) + objectHeight,
  };
}

export function getRotationLimitFeedbackArc(
  action: "rotate_cw" | "rotate_ccw",
  input: RotationLimitFeedbackInput,
): RotationLimitFeedbackArc {
  const direction = action === "rotate_cw" ? 1 : -1;
  const limitSteps = action === "rotate_cw" ? (input.maxCw ?? 0) : (input.maxCcw ?? 0);
  const limitAngle = normalizeRotation(input.initialRotation + direction * input.step * limitSteps);
  const halfArc = Math.max(Math.min(input.step * 0.45, 40), 14);
  const startAngle = limitAngle - halfArc;
  const endAngle = limitAngle + halfArc;
  const start = polarToCartesian(input.center, input.radius, startAngle);
  const end = polarToCartesian(input.center, input.radius, endAngle);
  const marker = polarToCartesian(input.center, input.radius, limitAngle);

  return {
    path: `M ${start.x} ${start.y} A ${input.radius} ${input.radius} 0 0 ${action === "rotate_cw" ? 1 : 0} ${end.x} ${end.y}`,
    markerX: marker.x,
    markerY: marker.y,
    limitAngle,
  };
}

function polarToCartesian(center: { x: number; y: number }, radius: number, angleDeg: number) {
  // SVG rotation and our world coordinates both treat positive angle as clockwise here,
  // 所以直接用 cos/sin 即可，不需要再额外翻转 Y 轴。
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: center.x + radius * Math.cos(angleRad),
    y: center.y + radius * Math.sin(angleRad),
  };
}
