import { describe, expect, it } from "vitest";
import { createIndexedDbLocalBackupStore, createMemoryLocalBackupStore } from "./local-backup-store";

describe("LocalBackupStore", () => {
  it("persists receiver request acknowledgements separately from files and pause metadata", async () => {
    const store = createMemoryLocalBackupStore("session-a");
    const other = createMemoryLocalBackupStore("session-b");
    const request = { filename: "metadata.json", body: '{"submission_kind":"metadata"}', acknowledged: false };
    await store.saveReceiverSubmission?.(request);
    await store.saveSessionMetadata?.({ pause: "paused" });
    expect(await store.getReceiverSubmission?.("metadata.json")).toEqual(request);
    expect(await other.getReceiverSubmission?.("metadata.json")).toBeUndefined();
    expect(await store.listFiles()).toEqual([]);
    await store.saveReceiverSubmission?.({ ...request, acknowledged: true });
    expect(await store.getReceiverSubmission?.("metadata.json")).toEqual({ ...request, acknowledged: true });
    expect(await store.getSessionMetadata?.()).toEqual({ pause: "paused" });
    await store.clear();
    expect(await store.getReceiverSubmission?.("metadata.json")).toBeUndefined();
  });

  it("handles an IndexedDB open rejection before the first asynchronous consumer", async () => {
    const request = {} as IDBOpenDBRequest;
    const factory = { open: () => request } as unknown as IDBFactory;
    const store = createIndexedDbLocalBackupStore("blocked", factory);
    request.onerror?.({} as Event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(store.listFiles()).rejects.toThrow("IndexedDB open failed");
  });

  it("replaces a retry of the same filename and keeps files in one session", async () => {
    const store = createMemoryLocalBackupStore("session-a");

    await store.saveFile({ filename: "trial.json", contentType: "application/json", data: "first" });
    await store.saveFile({ filename: "trial.json", contentType: "application/json", data: "second" });
    await store.saveFile({ filename: "results.csv", contentType: "text/csv", data: "a,b\n1,2\n" });

    await expect(store.listFiles()).resolves.toEqual([
      { filename: "results.csv", contentType: "text/csv", data: "a,b\n1,2\n" },
      { filename: "trial.json", contentType: "application/json", data: "second" },
    ]);
  });

  it("clears only its own namespace", async () => {
    const first = createMemoryLocalBackupStore("session-a");
    const second = createMemoryLocalBackupStore("session-b");
    await first.saveFile({ filename: "a.json", contentType: "application/json", data: "a" });
    await second.saveFile({ filename: "b.json", contentType: "application/json", data: "b" });

    await first.clear();

    await expect(first.listFiles()).resolves.toEqual([]);
    await expect(second.listFiles()).resolves.toEqual([
      { filename: "b.json", contentType: "application/json", data: "b" },
    ]);
  });
  it("stores resumable pause metadata without listing it as a result file", async () => {
    const store = createMemoryLocalBackupStore("session-metadata");
    const metadata = { session_id: "S1", pause: { status: "paused" } };

    await store.saveSessionMetadata?.(metadata);
    await store.saveFile({ filename: "session.csv", contentType: "text/csv", data: "ok\n" });

    expect(await store.getSessionMetadata?.()).toEqual(metadata);
    expect((await store.listFiles()).map((file) => file.filename)).toEqual(["session.csv"]);
    await store.clear();
    expect(await store.getSessionMetadata?.()).toBeUndefined();
  });
});
