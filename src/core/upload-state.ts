export type UploadStatus = "success" | "failed" | "timeout";
import type { PauseSummary } from "../types/result";

export interface UploadAttempt {
  backupId: string;
  filename: string;
  uploadStatus: UploadStatus;
  attempts: number;
  error?: string;
  uploadedAt?: string;
}

export interface UploadManifest {
  files: UploadAttempt[];
  finalUpload?: UploadAttempt;
  pause?: PauseSummary;
}

export class UploadState {
  private readonly files = new Map<string, UploadAttempt>();
  private finalUpload: UploadAttempt | undefined;

  constructor(private readonly options: { maxAttempts?: number; pauseSummary?: PauseSummary } = {}) {}

  recordAttempt(filename: string, uploadStatus: UploadStatus, error?: string): UploadAttempt {
    const previous = this.files.get(filename);
    const attempts = Math.min((previous?.attempts ?? 0) + 1, this.options.maxAttempts ?? Number.MAX_SAFE_INTEGER);
    const record: UploadAttempt = {
      backupId: previous?.backupId ?? createBackupId(filename),
      filename,
      uploadStatus,
      attempts,
      error,
      uploadedAt: uploadStatus === "success" ? new Date().toISOString() : previous?.uploadedAt,
    };
    this.files.set(filename, record);
    return record;
  }

  pendingRetries(): UploadAttempt[] {
    return [...this.files.values()].filter(
      (file) => file.uploadStatus !== "success" && file.attempts < (this.options.maxAttempts ?? Number.MAX_SAFE_INTEGER),
    );
  }

  markFinalUpload(filename: string, uploadStatus: UploadStatus = "success", error?: string): UploadAttempt {
    this.finalUpload = {
      backupId: this.finalUpload?.backupId ?? createBackupId(filename),
      filename,
      uploadStatus,
      attempts: (this.finalUpload?.attempts ?? 0) + 1,
      error,
      uploadedAt: uploadStatus === "success" ? new Date().toISOString() : undefined,
    };
    return this.finalUpload;
  }

  getManifest(): UploadManifest {
    return {
      files: [...this.files.values()].map((file) => ({ ...file })),
      finalUpload: this.finalUpload ? { ...this.finalUpload } : undefined,
      pause: this.options.pauseSummary,
    };
  }
}

function createBackupId(filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
  return `backup-${safe}`;
}
