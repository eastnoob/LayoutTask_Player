import type { ExperimentCsvFile } from "./experiment-data";

export interface LocalBackupStore {
  saveFile(file: ExperimentCsvFile): Promise<void>;
  saveFiles(files: ExperimentCsvFile[]): Promise<void>;
  listFiles(): Promise<ExperimentCsvFile[]>;
  clear(): Promise<void>;
  saveSessionMetadata?(metadata: unknown): Promise<void>;
  getSessionMetadata?(): Promise<unknown | undefined>;
  saveReceiverSubmission(submission: ReceiverSubmissionBackup): Promise<void>;
  getReceiverSubmission(filename: string): Promise<ReceiverSubmissionBackup | undefined>;
}

export interface ReceiverSubmissionBackup {
  filename: string;
  body: string;
  acknowledged: boolean;
}

interface StoredFile {
  key: string;
  namespace: string;
  file?: ExperimentCsvFile;
  kind?: "file" | "metadata" | "receiver";
  metadata?: unknown;
  submission?: ReceiverSubmissionBackup;
}

export function createMemoryLocalBackupStore(namespace: string): LocalBackupStore {
  const files = new Map<string, ExperimentCsvFile>();
  let metadata: unknown;
  const submissions = new Map<string, ReceiverSubmissionBackup>();
  return {
    async saveFile(file) {
      files.set(`${namespace}:${file.filename}`, { ...file });
    },
    async saveFiles(nextFiles) {
      nextFiles.forEach((file) => files.set(`${namespace}:${file.filename}`, { ...file }));
    },
    async listFiles() {
      return [...files.values()].sort((left, right) => left.filename.localeCompare(right.filename));
    },
    async clear() {
      files.clear();
      metadata = undefined;
      submissions.clear();
    },
    async saveSessionMetadata(next) {
      metadata = next;
    },
    async getSessionMetadata() {
      return metadata;
    },
    async saveReceiverSubmission(submission) {
      submissions.set(submission.filename, { ...submission });
    },
    async getReceiverSubmission(filename) {
      const submission = submissions.get(filename);
      return submission && { ...submission };
    },
  };
}

export function createIndexedDbLocalBackupStore(
  namespace: string,
  indexedDb: IDBFactory | undefined = globalThis.indexedDB,
): LocalBackupStore {
  if (!indexedDb) {
    throw new Error("IndexedDB is unavailable; local session backup cannot be created.");
  }

  const databasePromise = openDatabase(indexedDb);
  // Opening starts before the first consumer; keep its rejection handled for delayed callers.
  void databasePromise.catch(() => undefined);
  const keyFor = (filename: string) => `${namespace}:${filename}`;

  return {
    async saveFile(file) {
      await saveFiles(databasePromise, namespace, keyFor, [file]);
    },
    async saveFiles(files) {
      await saveFiles(databasePromise, namespace, keyFor, files);
    },
    async listFiles() {
      const database = await databasePromise;
      return new Promise<ExperimentCsvFile[]>((resolve, reject) => {
        const transaction = database.transaction("files", "readonly");
        const request = transaction.objectStore("files").getAll();
        request.onsuccess = () => {
          const records = (request.result as StoredFile[])
            .filter((record) => record.namespace === namespace)
            .filter((record) => record.kind !== "metadata")
            .filter((record): record is StoredFile & { file: ExperimentCsvFile } => Boolean(record.file))
            .map((record) => record.file)
            .sort((left, right) => left.filename.localeCompare(right.filename));
          resolve(records);
        };
        request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed."));
      });
    },
    async clear() {
      const database = await databasePromise;
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("files", "readwrite");
        const store = transaction.objectStore("files");
        const request = store.getAll();
        request.onsuccess = () => {
          (request.result as StoredFile[])
            .filter((record) => record.namespace === namespace)
            .forEach((record) => store.delete(record.key));
        };
        request.onerror = () => reject(request.error ?? new Error("IndexedDB clear failed."));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB clear failed."));
      });
    },
    async saveSessionMetadata(metadata) {
      const database = await databasePromise;
      await saveMetadata(database, namespace, keyFor("__session_metadata__"), metadata);
    },
    async getSessionMetadata() {
      const database = await databasePromise;
      return new Promise<unknown | undefined>((resolve, reject) => {
        const transaction = database.transaction("files", "readonly");
        const request = transaction.objectStore("files").get(keyFor("__session_metadata__"));
        request.onsuccess = () => resolve((request.result as StoredFile | undefined)?.metadata);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB metadata read failed."));
      });
    },
    async saveReceiverSubmission(submission) {
      const database = await databasePromise;
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("files", "readwrite");
        transaction.objectStore("files").put({
          key: keyFor(`__receiver_submission__:${submission.filename}`), namespace, kind: "receiver", submission,
        } satisfies StoredFile);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB receiver write failed."));
        transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB receiver write aborted."));
      });
    },
    async getReceiverSubmission(filename) {
      const database = await databasePromise;
      return new Promise<ReceiverSubmissionBackup | undefined>((resolve, reject) => {
        const transaction = database.transaction("files", "readonly");
        const request = transaction.objectStore("files").get(keyFor(`__receiver_submission__:${filename}`));
        request.onsuccess = () => resolve((request.result as StoredFile | undefined)?.submission);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB receiver read failed."));
        transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB receiver read aborted."));
      });
    },
  };
}

function openDatabase(indexedDb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open("layouttask-local-backup", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("files", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
  });
}

async function saveFiles(
  databasePromise: Promise<IDBDatabase>,
  namespace: string,
  keyFor: (filename: string) => string,
  files: ExperimentCsvFile[],
): Promise<void> {
  const database = await databasePromise;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    files.forEach((file) => {
      const record: StoredFile = { key: keyFor(file.filename), namespace, kind: "file", file: { ...file } };
      store.put(record);
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted."));
  });
}

async function saveMetadata(
  database: IDBDatabase,
  namespace: string,
  key: string,
  metadata: unknown,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("files", "readwrite");
    transaction.objectStore("files").put({ key, namespace, kind: "metadata", metadata } satisfies StoredFile);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB metadata write failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB metadata write aborted."));
  });
}
