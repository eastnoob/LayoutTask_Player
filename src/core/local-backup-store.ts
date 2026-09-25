import type { ExperimentCsvFile } from "./experiment-data";

export interface LocalBackupStore {
  saveFile(file: ExperimentCsvFile): Promise<void>;
  saveFiles(files: ExperimentCsvFile[]): Promise<void>;
  listFiles(): Promise<ExperimentCsvFile[]>;
  clear(): Promise<void>;
}

interface StoredFile {
  key: string;
  namespace: string;
  file: ExperimentCsvFile;
}

export function createMemoryLocalBackupStore(namespace: string): LocalBackupStore {
  const files = new Map<string, ExperimentCsvFile>();
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
      const record: StoredFile = { key: keyFor(file.filename), namespace, file: { ...file } };
      store.put(record);
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted."));
  });
}
