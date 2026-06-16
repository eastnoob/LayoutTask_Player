import { describe, expect, it } from "vitest";
import { createAutosaveKey, createAutosaveService, type LayoutTaskDraft } from "./autosave-service";

function createMemoryStorage(): Storage {
  const items = new Map<string, string>();

  return {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key) {
      return items.get(key) ?? null;
    },
    key(index) {
      return Array.from(items.keys())[index] ?? null;
    },
    removeItem(key) {
      items.delete(key);
    },
    setItem(key, value) {
      items.set(key, value);
    },
  };
}

describe("createAutosaveKey", () => {
  it("creates a stable draft key from experiment task qid and session", () => {
    expect(
      createAutosaveKey({
        experimentId: "EXP123",
        taskId: "room01",
        qid: "Q1",
        session: "S456",
      }),
    ).toBe("layouttask:draft:EXP123:room01:Q1:S456");
  });
});

describe("createAutosaveService", () => {
  const draft: LayoutTaskDraft = {
    schema: "layouttask.draft.v1",
    saved_at: 1710000000000,
    restore_count: 0,
    state: {
      chair: { x: 10, y: 20, r: 90 },
    },
    events: [
      {
        i: 0,
        t: 12,
        object: "chair",
        action: "move_right",
        valid: true,
        after: { x: 10, y: 20, r: 90 },
      },
    ],
    flow: {
      mode: "preview_then_reconstruct",
      reconstruction_started_at: 1710000001000,
    },
  };

  it("saves loads and clears a draft using the provided storage", () => {
    const storage = createMemoryStorage();
    const service = createAutosaveService(storage);
    const key = "layouttask:draft:EXP123:room01:Q1:S456";

    service.save(key, draft);

    expect(service.load(key)).toEqual(draft);

    service.clear(key);

    expect(service.load(key)).toBeNull();
  });

  it("returns null for corrupt JSON", () => {
    const storage = createMemoryStorage();
    const service = createAutosaveService(storage);

    storage.setItem("draft", "{not json");

    expect(service.load("draft")).toBeNull();
  });

  it("returns null for a draft with the wrong schema", () => {
    const storage = createMemoryStorage();
    const service = createAutosaveService(storage);

    storage.setItem(
      "draft",
      JSON.stringify({
        ...draft,
        schema: "layouttask.draft.v0",
      }),
    );

    expect(service.load("draft")).toBeNull();
  });
});
