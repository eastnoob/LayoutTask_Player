export interface ParticipantIdOptions {
  url?: URL;
  storage?: Pick<Storage, "getItem" | "setItem">;
  now?: Date;
  cryptoImpl?: Pick<Crypto, "getRandomValues">;
}

export interface SessionIdOptions {
  now?: Date;
  cryptoImpl?: Pick<Crypto, "getRandomValues">;
}

const participantParamPriority = ["participant", "participant_id", "subject", "subject_id", "PROLIFIC_PID"];
const storageKey = "layoutTaskParticipantId";

export function getParticipantId(options: ParticipantIdOptions = {}): string {
  const url = options.url ?? new URL(globalThis.location.href);

  for (const key of participantParamPriority) {
    const value = url.searchParams.get(key)?.trim();
    if (value) {
      return sanitizeIdPart(value);
    }
  }

  const stored = options.storage?.getItem(storageKey);
  if (stored) {
    return stored;
  }

  const generated = `P_${formatTimestampForId(options.now ?? new Date())}_${randomSuffix(options.cryptoImpl)}`;
  options.storage?.setItem(storageKey, generated);
  return generated;
}

export function createSessionId(options: SessionIdOptions = {}): string {
  return `S_${formatTimestampForId(options.now ?? new Date())}_${randomSuffix(options.cryptoImpl)}`;
}

export function formatTimestampForId(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}_${pad(
    date.getUTCHours(),
  )}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function randomSuffix(cryptoImpl: Pick<Crypto, "getRandomValues"> = globalThis.crypto): string {
  const values = new Uint32Array(1);
  cryptoImpl.getRandomValues(values);
  return values[0].toString(36).toUpperCase().padStart(6, "0").slice(0, 8);
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "UNKNOWN";
}
