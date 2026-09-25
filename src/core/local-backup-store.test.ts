import { describe, expect, it } from "vitest";
import { createMemoryLocalBackupStore } from "./local-backup-store";

describe("LocalBackupStore", () => {
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
});
