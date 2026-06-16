import type { LayoutTaskEvent, ObjectPose } from "../types/events";
import type { ResultFlowInfo } from "../types/result";

export interface AutosaveKeyParts {
  experimentId: string;
  taskId: string;
  qid: string;
  session: string;
}

export interface LayoutTaskDraft {
  schema: "layouttask.draft.v1";
  saved_at: number;
  restore_count: number;
  state: Record<string, ObjectPose>;
  events: LayoutTaskEvent[];
  flow?: ResultFlowInfo;
}

export interface AutosaveService {
  save(key: string, draft: LayoutTaskDraft): void;
  load(key: string): LayoutTaskDraft | null;
  clear(key: string): void;
}

export function createAutosaveKey(parts: AutosaveKeyParts): string {
  return ["layouttask", "draft", parts.experimentId, parts.taskId, parts.qid, parts.session].join(":");
}

export function createAutosaveService(storage: Storage): AutosaveService {
  return {
    save(key, draft) {
      storage.setItem(key, JSON.stringify(draft));
    },
    load(key) {
      const raw = storage.getItem(key);
      if (!raw) {
        return null;
      }

      try {
        const parsed = JSON.parse(raw) as LayoutTaskDraft;
        if (parsed.schema !== "layouttask.draft.v1") {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },
    clear(key) {
      storage.removeItem(key);
    },
  };
}
