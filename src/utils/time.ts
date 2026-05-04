export function now(): number {
  return Date.now();
}

export function elapsedMs(startTime: number, endTime: number): number {
  return Math.max(0, endTime - startTime);
}

export function createSessionId(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
}
