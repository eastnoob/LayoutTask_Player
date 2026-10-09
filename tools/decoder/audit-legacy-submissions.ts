#!/usr/bin/env tsx
import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import LZString from "lz-string";
import { z } from "zod";
import { LayoutTaskEncoder } from "../../src/core/encoder";
import { resultSchema } from "../../src/schemas/result.schema";
import { validateDecodedResult } from "./decoder-utils";
import type { LayoutTaskResult } from "../../src/types/result";

const text = z.string().min(1);
const presentationSchema = z.object({ presentationId: text, taskId: text, trialIndex: z.number().int().positive() });
const scheduleSchema = z.object({
  schema: z.literal("layouttask.schedule.v1"), presentationCount: z.literal(25),
  sequences: z.array(z.object({ sequenceId: z.union([text, z.number().int().positive()]),
    presentations: z.array(presentationSchema).length(25) })).min(1),
});
const identitySchema = z.object({
  experiment_id: text, participant_id: text, session_id: text, assignment_id: text,
  participant_number: z.number().int().positive(), sequence_id: text, schedule_version: text,
  assignment_mode: z.enum(["automatic", "replacement"]), requested_sequence_id: z.string().nullable(),
  replacement_attempt: z.number().int().nonnegative(), rotation_index: z.number().int().nonnegative().nullable(),
});
type Identity = z.infer<typeof identitySchema>;
type Schedule = z.infer<typeof scheduleSchema>;
type Presentation = z.infer<typeof presentationSchema>;
type JsonObject = Record<string, unknown>;
type Status = "tutorial_only" | "partial" | "formal_25_final_missing" | "complete";
type ArchiveState = "pending" | "failed" | "partial" | "archived" | "unknown";
interface Evidence { path: string; row?: number }
type ArchiveEvidence = Evidence & {
  kind: "receiver_index" | "manifest" | "unrecorded";
  state: ArchiveState; recorded_state?: ArchiveState; submission_id?: string; file_id?: string; fallback_reason?: string;
};
interface FileIntegrity {
  path: string; status: "verified" | "rejected" | "unverified"; actual_sha256: string;
  declared_sha256: string | null; manifest: Evidence | null;
}
interface Observation {
  source: Evidence; identity: Identity | null; participant_id: string | null;
  experiment_id: string | null; sequence_id: string | null; trial_type: string | null;
  result: LayoutTaskResult | null; presentation: Presentation | null; hash8: string | null;
  valid: boolean; final: boolean; archive_evidence: ArchiveEvidence[];
}
interface TrialReport {
  source: Evidence; valid: boolean; linkage: "unique" | "ambiguous" | "unmatched";
  rule: "v2_identity" | "unique_final_row" | null; candidates: Evidence[];
  participant_id: string | null; participant_number: number | null; sequence_id: string | null;
  session_id: string | null; trial_session_id: string | null; task_id: string | null;
  presentation_id: string | null; trial_index: number | null; hash8: string | null;
  session_status: Status | "session_unknown"; archive_state: ArchiveState; archive_evidence: ArchiveEvidence[];
}
interface SessionReport extends Identity {
  status: Status; formal_presentations: number; final_presentations: number;
  final_present: boolean; archive_state: ArchiveState; evidence: Evidence[]; archive_evidence: ArchiveEvidence[];
}
export interface AuditOptions { receiverData: string; archives: string[]; schedule: string }

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object");
  return value as JsonObject;
}
function string(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function digest(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function sessionKey(identity: Identity): string {
  return JSON.stringify([identity.experiment_id, identity.participant_id, identity.session_id]);
}
function archiveState(states: ArchiveState[]): ArchiveState {
  if (!states.length) return "unknown";
  if (states.every((state) => state === states[0])) return states[0];
  if (states.includes("partial") || states.includes("archived")) return "partial";
  return states.includes("unknown") ? "unknown" : states.includes("failed") ? "failed" : "pending";
}
function recordedState(manifest?: JsonObject, file?: JsonObject): ArchiveState {
  const value = file?.archive_status ?? manifest?.archive_status;
  return value === "pending" || value === "failed" || value === "partial" || value === "archived" ? value : "unknown";
}
function decodeResult(value: unknown): { result: LayoutTaskResult; presentation: Presentation | null } {
  const raw = object(value);
  const result = resultSchema.parse(raw);
  const presentation = raw.presentation == null ? null : presentationSchema.parse(raw.presentation);
  const validation = validateDecodedResult({ result, hashOk: true, headerOk: true,
    header: { version: "LAYOUTTASK1", qid: result.qid, taskId: result.task_id,
      sessionId: result.session, hash8: "", encoding: "plain-json" } });
  if (!validation.valid) throw new Error(validation.errors.join(", "));
  return { result, presentation };
}
function decodeBackup(backup: JsonObject): ReturnType<typeof decodeResult> {
  const encoded = string(backup.encoded);
  if (!encoded) throw new Error("Backup lacks encoded transport; cannot verify hash8");
  const parts = encoded.split("|");
  if ((parts.length !== 6 && parts.length !== 7) || parts[0] !== "LAYOUTTASK1") throw new Error("Invalid encoded transport");
  const encoding = parts.length === 7 ? parts[5] : "lz-uri";
  const payload = parts.length === 7 ? parts[6] : parts[5];
  const json = encoding === "plain-json" ? payload : encoding === "lz-uri" ? LZString.decompressFromEncodedURIComponent(payload)
    : encoding === "lz-base64" ? LZString.decompressFromBase64(payload) : null;
  if (!json || digest(json).slice(0, 8).toUpperCase() !== parts[4].toUpperCase() ||
      backup.hash8 !== parts[4] || backup.encoding !== encoding) throw new Error("Backup hash/encoding mismatch");
  const decoded = decodeResult(JSON.parse(json));
  if (parts[1] !== decoded.result.qid || parts[2] !== decoded.result.task_id || parts[3] !== decoded.result.session ||
      backup.qid !== parts[1] || backup.task_id !== parts[2] || backup.session !== parts[3]) throw new Error("Backup result identity mismatch");
  return decoded;
}
function sequenceFor(schedule: Schedule, presentation: Presentation | null): string | null {
  if (!presentation) return null;
  const matches = schedule.sequences.filter((sequence) => sequence.presentations.some((expected) =>
    expected.presentationId === presentation.presentationId && expected.trialIndex === presentation.trialIndex && expected.taskId === presentation.taskId));
  return matches.length === 1 ? String(matches[0].sequenceId) : null;
}
function validPosition(schedule: Schedule, observation: Observation): boolean {
  return observation.valid && observation.trial_type === "formal" && observation.presentation !== null &&
    observation.result?.task_id === observation.presentation.taskId && observation.identity !== null &&
    sequenceFor(schedule, observation.presentation) === observation.identity.sequence_id;
}
function sameTrial(a: Observation, b: Observation): boolean {
  return a.valid && b.valid && a.participant_id !== null && a.participant_id === b.participant_id &&
    a.experiment_id === b.experiment_id && a.result?.session === b.result?.session &&
    a.hash8 === b.hash8 && a.result?.task_id === b.result?.task_id &&
    JSON.stringify(a.presentation) === JSON.stringify(b.presentation);
}

async function verifyFinalHash(result: LayoutTaskResult, claimedHash: string): Promise<boolean> {
  const encoder = new LayoutTaskEncoder();
  for (const detail of ["final-only", "full"] as const) {
    for (const final_state of ["relative", "absolute"] as const) {
      const encoded = await encoder.encode(result, { detail, final_state });
      if (encoded.hash8.toUpperCase() === claimedHash.toUpperCase()) return true;
    }
  }
  return false;
}

export async function auditLegacySubmissions(options: AuditOptions) {
  const sources: Array<{ path: string; sha256: string }> = [];
  const issues: Array<Evidence & { message: string }> = [];
  const contents = new Map<string, string>();
  const bytesByPath = new Map<string, Buffer>();
  async function read(path: string): Promise<string> {
    if (!contents.has(path)) {
      const bytes = await readFile(path);
      bytesByPath.set(path, bytes);
      contents.set(path, bytes.toString("utf8"));
      sources.push({ path, sha256: digest(bytes) });
    }
    return contents.get(path)!;
  }
  function issue(source: Evidence, error: unknown) {
    issues.push({ ...source, message: error instanceof Error ? error.message : String(error) });
  }
  const schedule = scheduleSchema.parse(JSON.parse(await read(resolve(options.schedule))));
  if (new Set(schedule.sequences.map((sequence) => String(sequence.sequenceId))).size !== schedule.sequences.length ||
      schedule.sequences.some((sequence) => new Set(sequence.presentations.map((p) => p.presentationId)).size !== 25 ||
        new Set(sequence.presentations.map((p) => p.trialIndex)).size !== 25 || sequence.presentations.some((p) => p.trialIndex > 25))) {
    throw new Error("Schedule must have unique sequence IDs and 25 distinct presentation IDs/indices per sequence");
  }
  async function files(dir: string): Promise<string[]> {
    const found: string[] = [];
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) found.push(...await files(path));
      else if (entry.isFile() && /\.(json|csv)$/i.test(entry.name)) found.push(path);
    }
    return found;
  }
  await stat(resolve(options.receiverData));
  const spool = join(resolve(options.receiverData), "spool");
  let spoolFiles: string[] = [];
  try { spoolFiles = await files(spool); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const paths = new Set(spoolFiles);
  for (const dir of options.archives) for (const path of await files(resolve(dir))) paths.add(path);
  const json = new Map<string, JsonObject>();
  const contexts = new Map<string, { manifest: JsonObject; file: JsonObject; source: Evidence }>();
  const manifestPaths = new Set([...paths].filter((path) => basename(path) === "manifest.json"));
  const duplicateFiles = new Set<string>();
  for (const path of paths) {
    if (!path.endsWith(".json")) continue;
    try { json.set(path, object(JSON.parse(await read(path)))); }
    catch (error) { issue({ path }, error); }
  }
  for (const [path, manifest] of json) {
    if (basename(path) !== "manifest.json") continue;
    if (!Array.isArray(manifest.files)) {
      issue({ path }, "Manifest files must be an array");
      continue;
    }
    for (const value of manifest.files) {
      try {
        const file = object(value);
        const filename = string(file.archive_filename) ?? string(file.filename);
        if (!filename || basename(filename) !== filename) throw new Error("Manifest filename must be local to its directory");
        const filePath = join(dirname(path), filename);
        if (contexts.has(filePath)) {
          duplicateFiles.add(filePath);
          issue({ path }, "Conflicting or duplicated manifest file declaration");
        } else contexts.set(filePath, { manifest, file, source: { path } });
      } catch (error) { issue({ path }, error); }
    }
  }
  const fileIntegrity: FileIntegrity[] = [];
  function integrity(path: string): boolean {
    const context = contexts.get(path);
    const bytes = bytesByPath.get(path)!;
    const actual_sha256 = digest(bytes);
    if (!context) {
      const manifestPath = join(dirname(path), "manifest.json");
      if (manifestPaths.has(manifestPath)) {
        fileIntegrity.push({ path, status: "rejected", actual_sha256, declared_sha256: null, manifest: { path: manifestPath } });
        issue({ path }, "File lacks a usable declaration in existing manifest");
        return false;
      }
      fileIntegrity.push({ path, status: "unverified", actual_sha256, declared_sha256: null, manifest: null });
      return true;
    }
    const declared_sha256 = string(context.file.sha256);
    const validDigest = declared_sha256 !== null && /^[a-f0-9]{64}$/i.test(declared_sha256);
    const ok = !duplicateFiles.has(path) && validDigest && declared_sha256.toLowerCase() === actual_sha256;
    fileIntegrity.push({ path, status: ok ? "verified" : "rejected", actual_sha256, declared_sha256,
      manifest: context.source });
    if (!ok) issue({ path }, duplicateFiles.has(path) ? "Conflicting or duplicated manifest file declaration"
      : validDigest ? "Manifest sha256 mismatch" : "Manifest sha256 missing or invalid");
    return ok;
  }
  const indexPath = join(resolve(options.receiverData), "submissions.jsonl");
  const indexRows: Array<{ item: JsonObject; source: Evidence }> = [];
  const usedIndexRows = new Set<JsonObject>();
  const blockedIds = new Set<string>();
  const fileIdentity = ["file_index", "file_id", "filename", "archive_filename", "sha256", "size_bytes"];
  let indexPresent = false;
  try {
    const index = await read(indexPath);
    indexPresent = true;
    for (const [offset, line] of index.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      const source = { path: indexPath, row: offset + 1 };
      let item: JsonObject | undefined;
      try {
        item = object(JSON.parse(line));
        if (!["id", "experiment_id", "participant_id", "session_id"].every((field) => string(item![field])) ||
            !Array.isArray(item.files) || !item.files.length) throw new Error("Malformed receiver index submission identity/files");
        if (recordedState(item) === "unknown") throw new Error("Invalid receiver index archive status");
        const fileIds = new Set<string>();
        for (const value of item.files) {
          const file = object(value);
          if (!["file_id", "filename", "archive_filename"].every((field) => string(file[field])) ||
              !Number.isInteger(file.file_index) || Number(file.file_index) < 1 ||
              !Number.isInteger(file.size_bytes) || Number(file.size_bytes) < 0 ||
              typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(file.sha256)) throw new Error("Malformed receiver index file identity/checksum");
          if (recordedState(undefined, file) === "unknown" || file.archive_status !== item.archive_status) throw new Error("Conflicting receiver index submission/file archive status");
          if (fileIds.has(String(file.file_id))) throw new Error("Conflicting receiver index file identities");
          fileIds.add(String(file.file_id));
        }
        indexRows.push({ item, source });
      }
      catch (error) { issue({ path: indexPath, row: offset + 1 }, error); }
      if (item && !indexRows.some((row) => row.item === item) && string(item.id)) blockedIds.add(String(item.id));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  function exactIndexEvidence(path: string): ArchiveEvidence[] {
    const context = contexts.get(path);
    if (!context) return [{ path, kind: "unrecorded", state: "unknown" }];
    const fallback = (reason: string): ArchiveEvidence[] => {
      const state = recordedState(context.manifest, context.file);
      const contradictory = reason === "receiver_index_invalid" || reason === "receiver_index_conflicting";
      return [{ ...context.source, kind: "manifest", state: contradictory ? "unknown" : state,
        ...(contradictory ? { recorded_state: state } : {}),
        submission_id: string(context.manifest.submission_id) ?? undefined,
        file_id: string(context.file.file_id) ?? undefined, fallback_reason: reason }];
    };
    const submissionId = string(context.manifest.submission_id);
    const candidates = indexRows.filter(({ item }) => item.id === submissionId);
    if (submissionId && blockedIds.has(submissionId)) return fallback("receiver_index_invalid");
    if (!candidates.length) {
      if (indexPresent) issue(context.source, "Receiver index evidence is unmatched for manifest submission");
      return fallback(indexPresent ? "receiver_index_unmatched" : "receiver_index_absent");
    }
    const identity = ["experiment_id", "participant_id", "session_id", "submission_kind", "assignment_id", "participant_number",
      "sequence_id", "schedule_version", "assignment_mode", "requested_sequence_id", "replacement_attempt", "rotation_index",
      "trial_session_id", "trial_type", "trial_index", "task_id", "qid", "presentation_id", "hash8", "encoding", "content_sha256"];
    if (candidates.length > 1) {
      for (const { source, item } of candidates) {
        usedIndexRows.add(item);
        issue(source, "Conflicting or duplicated receiver index submission evidence");
      }
      return fallback("receiver_index_conflicting");
    }
    const matches: ArchiveEvidence[] = [];
    for (const { item, source } of candidates) {
      usedIndexRows.add(item);
      const indexFile = Array.isArray(item.files) ? item.files.find((value) => {
        try {
          const file = object(value);
          return fileIdentity.every((field) => context.file[field] !== undefined && file[field] === context.file[field]);
        } catch { return false; }
      }) : undefined;
      const identityMatches = ["experiment_id", "participant_id", "session_id"].every((field) => string(context.manifest[field])) &&
        identity.every((field) => context.manifest[field] === undefined || item[field] === context.manifest[field]);
      const state = recordedState(item, indexFile ? object(indexFile) : undefined);
      if (!identityMatches || !indexFile || state === "unknown" ||
          (object(indexFile).archive_status !== undefined && object(indexFile).archive_status !== item.archive_status)) {
        issue(source, "Receiver index submission/file identity or status mismatch");
        continue;
      }
      matches.push({ ...source, kind: "receiver_index", state, submission_id: submissionId!,
        file_id: string(object(indexFile).file_id) ?? undefined });
    }
    return matches.length ? matches : fallback("receiver_index_unmatched");
  }
  const archiveEvidence = new Map<string, ArchiveEvidence[]>();
  for (const path of contexts.keys()) archiveEvidence.set(path, exactIndexEvidence(path));
  for (const { item, source } of indexRows) if (!usedIndexRows.has(item)) issue(source, "Receiver index evidence is unmatched to supplied manifest files");
  function stateEvidence(path: string): ArchiveEvidence[] {
    return archiveEvidence.get(path) ?? [{ path, kind: "unrecorded", state: "unknown" }];
  }
  const finals: Observation[] = [];
  for (const path of paths) {
    if (!/(^|[_])raw_results(?:_|\.csv)/.test(basename(path)) || !path.endsWith(".csv")) continue;
    try {
      await read(path);
      if (!integrity(path)) continue;
      const rows = parse(await read(path), { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[];
      for (const [index, row] of rows.entries()) {
        const source = { path, row: index + 2 };
        let identity: Identity | null = null;
        try {
          identity = identitySchema.parse({ ...row, participant_number: Number(row.participant_number),
            replacement_attempt: Number(row.replacement_attempt), requested_sequence_id: row.requested_sequence_id || null,
            rotation_index: row.rotation_index ? Number(row.rotation_index) : null });
          const rawResult = object(JSON.parse(row.result_json));
          const decoded = decodeResult(rawResult);
          if (!row.hash8 || row.task_id !== decoded.result.task_id || row.qid !== decoded.result.qid ||
              row.experiment_id !== decoded.result.exp || !["formal", "tutorial"].includes(row.trial_type) ||
              (row.trial_type === "formal" && (!decoded.presentation || Number(row.trial_index) !== decoded.presentation.trialIndex ||
                row.presentation_id !== decoded.presentation.presentationId)) ||
              (row.trial_type === "tutorial" && (decoded.presentation || row.presentation_id))) throw new Error("Final row result/presentation identity mismatch");
          // Schema parsing strips fields and reorders keys; hash the original validated object.
          if (!(await verifyFinalHash(rawResult as unknown as LayoutTaskResult, row.hash8))) throw new Error("Final row result hash mismatch");
          const context = contexts.get(path);
          if (context) for (const [field, expected] of Object.entries(identity)) {
            const actual = context.manifest[field];
            if (actual !== undefined && actual !== expected) throw new Error(`Final row/manifest ${field} mismatch`);
          }
          finals.push({ source, identity, participant_id: identity.participant_id, experiment_id: identity.experiment_id,
            sequence_id: identity.sequence_id, trial_type: row.trial_type, ...decoded, hash8: row.hash8,
            valid: true, final: true, archive_evidence: stateEvidence(path) });
        } catch (error) {
          issue(source, error);
          if (identity) finals.push({ source, identity, participant_id: identity.participant_id, experiment_id: identity.experiment_id,
            sequence_id: identity.sequence_id, trial_type: row.trial_type, result: null, presentation: null,
            hash8: string(row.hash8), valid: false, final: true, archive_evidence: stateEvidence(path) });
        }
      }
    } catch (error) { issue({ path }, error); }
  }
  const backups: Observation[] = [];
  const trials: TrialReport[] = [];
  for (const [path, backup] of json) {
    if (backup.schema !== "layouttask.backup.v1" && backup.schema !== "layouttask.backup.v2") continue;
    const context = contexts.get(path);
    const manifest = context?.manifest;
    const observation: Observation = { source: { path }, identity: null,
      participant_id: string(manifest?.participant_id) ?? string(backup.participant_id),
      experiment_id: string(manifest?.experiment_id) ?? string(backup.experiment_id),
      sequence_id: null, trial_type: null, result: null, presentation: null,
      hash8: string(backup.hash8), valid: false, final: false, archive_evidence: stateEvidence(path) };
    let rule: TrialReport["rule"] = null;
    let candidates: Observation[] = [];
    try {
      if (!integrity(path)) {
        observation.archive_evidence = observation.archive_evidence.map((evidence) => ({ ...evidence,
          recorded_state: evidence.recorded_state ?? evidence.state, state: "unknown", fallback_reason: "file_integrity_rejected" }));
        throw new Error("Backup withheld after manifest sha256 rejection");
      }
      Object.assign(observation, decodeBackup(backup));
      observation.valid = true;
      observation.sequence_id = sequenceFor(schedule, observation.presentation);
      if (backup.schema === "layouttask.backup.v2") {
        const identity = identitySchema.parse(backup);
        if (backup.trial_session_id !== observation.result!.session || identity.experiment_id !== observation.result!.exp ||
            (backup.trial_type !== "formal" && backup.trial_type !== "tutorial") ||
            (backup.trial_type === "formal" && (!observation.presentation || backup.trial_index !== observation.presentation.trialIndex ||
              backup.presentation_id !== observation.presentation.presentationId)) ||
            (backup.trial_type === "tutorial" && (observation.presentation || backup.presentation_id != null))) throw new Error("V2 trial result/presentation identity mismatch");
        if (manifest) {
          if (manifest.submission_kind !== "trial") throw new Error("V2 manifest kind mismatch");
          for (const field of [...Object.keys(identity), "trial_session_id", "trial_type", "trial_index", "task_id", "qid", "presentation_id", "hash8", "encoding"]) {
            if ((manifest[field] ?? null) !== (backup[field] ?? null)) throw new Error(`V2 manifest/envelope ${field} mismatch`);
          }
        }
        observation.identity = identity;
        observation.participant_id = identity.participant_id;
        observation.experiment_id = identity.experiment_id;
        observation.sequence_id = identity.sequence_id;
        observation.trial_type = String(backup.trial_type);
        rule = "v2_identity";
      } else {
        observation.trial_type = observation.presentation ? "formal" : null;
        candidates = finals.filter((final) => final.identity && sameTrial(observation, final) &&
          (final.trial_type !== "formal" || validPosition(schedule, final)));
        // Multiple rows stay ambiguous, even if their claimed identities happen to agree.
        if (candidates.length === 1) {
          observation.identity = candidates[0].identity;
          observation.sequence_id = candidates[0].sequence_id;
          observation.trial_type = candidates[0].trial_type;
          rule = "unique_final_row";
        }
      }
    } catch (error) {
      issue({ path }, error);
      observation.valid = false;
      observation.identity = null;
    }
    backups.push(observation);
    trials.push({ source: observation.source, valid: observation.valid,
      linkage: rule ? "unique" : candidates.length > 1 ? "ambiguous" : "unmatched", rule,
      candidates: candidates.map((candidate) => candidate.source), participant_id: observation.participant_id,
      participant_number: observation.identity?.participant_number ?? null, sequence_id: observation.sequence_id,
      session_id: observation.identity?.session_id ?? null, trial_session_id: observation.result?.session ?? null,
      task_id: observation.result?.task_id ?? null, presentation_id: observation.presentation?.presentationId ?? null,
      trial_index: observation.presentation?.trialIndex ?? null, hash8: observation.hash8,
      session_status: "session_unknown", archive_state: archiveState(observation.archive_evidence.map((evidence) => evidence.state)),
      archive_evidence: observation.archive_evidence });
  }
  const groups = new Map<string, Observation[]>();
  for (const observation of [...finals, ...backups]) {
    if (!observation.identity) continue;
    const key = sessionKey(observation.identity);
    groups.set(key, [...(groups.get(key) ?? []), observation]);
  }
  const sessions: SessionReport[] = [];
  for (const observations of groups.values()) {
    const identity = observations[0].identity!;
    const identityConflict = observations.some((o) => JSON.stringify(o.identity) !== JSON.stringify(identity));
    if (identityConflict) issue(observations[0].source, "Session assignment identity conflict; counts withheld");
    const positions = new Map<number, Observation[]>();
    for (const observation of observations) {
      if (validPosition(schedule, observation)) {
        const index = observation.presentation!.trialIndex;
        positions.set(index, [...(positions.get(index) ?? []), observation]);
      } else if (observation.valid && observation.trial_type === "formal") issue(observation.source, "Formal presentation does not match assigned schedule");
    }
    const conflicting = new Set<number>();
    for (const [index, items] of positions) {
      if (new Set(items.map((o) => JSON.stringify([o.result!.session, o.hash8]))).size > 1) {
        conflicting.add(index);
        issue(items[0].source, `Trial content conflict at presentation ${index}; sources retained`);
      }
    }
    const formalCount = identityConflict ? 0 : [...positions.keys()].filter((index) => !conflicting.has(index)).length;
    const finalCounts = new Map<string, Set<number>>();
    for (const observation of observations.filter((o) => o.final)) {
      const counts = finalCounts.get(observation.source.path) ?? new Set<number>();
      if (!identityConflict && validPosition(schedule, observation) && !conflicting.has(observation.presentation!.trialIndex)) counts.add(observation.presentation!.trialIndex);
      finalCounts.set(observation.source.path, counts);
    }
    const finalCount = Math.max(0, ...[...finalCounts.values()].map((counts) => counts.size));
    const finalPresent = observations.some((o) => o.final);
    const status: Status = finalCount === 25 ? "complete" : formalCount === 25 && !finalPresent ? "formal_25_final_missing"
      : observations.every((o) => o.valid && o.trial_type === "tutorial") ? "tutorial_only" : "partial";
    const session = { ...identity, status, formal_presentations: formalCount, final_presentations: finalCount,
      final_present: finalPresent, archive_state: archiveState(observations.flatMap((o) => o.archive_evidence.map((evidence) => evidence.state))),
      archive_evidence: [...new Map(observations.flatMap((o) => o.archive_evidence).map((evidence) => [JSON.stringify(evidence), evidence])).values()],
      evidence: observations.map((o) => o.source) };
    sessions.push(session);
    for (const [index, backup] of backups.entries()) if (backup.identity && sessionKey(backup.identity) === sessionKey(identity)) trials[index].session_status = status;
  }
  return { schema: "layouttask.legacy-audit.v1", sessions, trials, sources, issues, file_integrity: fileIntegrity,
    match_fields: ["experiment_id", "participant_id", "result.session", "hash8", "task_id", "trial_index", "presentation_id"] };
}

async function main(): Promise<void> {
  try {
    const options: AuditOptions = { receiverData: "", archives: [], schedule: "" };
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
      const value = args[i + 1];
      if (!["--receiver-data", "--archive", "--schedule"].includes(args[i]) || !value || value.startsWith("--")) throw new Error("Usage: --receiver-data DIR --archive DIR [--archive DIR ...] --schedule FILE");
      if (args[i] === "--archive") options.archives.push(value);
      else if (args[i] === "--schedule") options.schedule = value;
      else options.receiverData = value;
    }
    if (!options.receiverData || !options.schedule || !options.archives.length) throw new Error("Usage: --receiver-data DIR --archive DIR [--archive DIR ...] --schedule FILE");
    process.stdout.write(`${JSON.stringify(await auditLegacySubmissions(options), null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
