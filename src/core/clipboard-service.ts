export interface CopyResult {
  ok: boolean;
  method: "clipboard-api" | "manual";
  error?: string;
}

export class ClipboardService {
  async copy(text: string): Promise<CopyResult> {
    if (!navigator.clipboard) {
      return this.copyWithTextarea(text);
    }

    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: "clipboard-api" };
    } catch (error) {
      const fallback = this.copyWithTextarea(text);
      if (fallback.ok) {
        return fallback;
      }

      return {
        ok: false,
        method: "manual",
        error: error instanceof Error ? error.message : "Unknown clipboard error",
      };
    }
  }

  private copyWithTextarea(text: string): CopyResult {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();

    try {
      const ok = document.execCommand("copy");
      return {
        ok,
        method: ok ? "clipboard-api" : "manual",
      };
    } catch (error) {
      return {
        ok: false,
        method: "manual",
        error: error instanceof Error ? error.message : "Unknown clipboard fallback error",
      };
    } finally {
      textarea.remove();
    }
  }
}
