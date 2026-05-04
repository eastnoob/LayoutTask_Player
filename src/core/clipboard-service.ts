export interface CopyResult {
  ok: boolean;
  method: "clipboard-api" | "manual";
  error?: string;
}

export class ClipboardService {
  async copy(text: string): Promise<CopyResult> {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: "clipboard-api" };
    } catch (error) {
      return {
        ok: false,
        method: "manual",
        error: error instanceof Error ? error.message : "Unknown clipboard error",
      };
    }
  }
}
