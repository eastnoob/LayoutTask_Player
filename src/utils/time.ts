export function now(): number {
  return Date.now();
}

export function elapsedMs(startTime: number, endTime: number): number {
  return Math.max(0, endTime - startTime);
}
