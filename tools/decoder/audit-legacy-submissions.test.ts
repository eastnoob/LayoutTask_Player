import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { stringify } from "csv-stringify/sync";
import { LayoutTaskEncoder } from "../../src/core/encoder";
import type { LayoutTaskResult } from "../../src/types/result";
import type { ExperimentSchedule } from "../../src/types/schedule";
import { createExperimentCsvFiles, toAssignmentMetadata } from "../../src/core/experiment-data";
import { auditLegacySubmissions } from "./audit-legacy-submissions";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const presentations = Array.from({ length: 25 }, (_, i) => ({
  presentationId: `sequence-6-presentation-${i + 1}`, taskId: `room-${i < 23 ? i + 1 : i - 22}`,
  trialIndex: i + 1, trialTotal: 25, repeatGroupId: null, repeatIndex: 0, repeatOfTaskId: null,
}));
const assignment = {
  assignment_id: "assignment-47", participant_number: 47, sequence_id: "6", schedule_version: "run12-v1",
  assignment_mode: "replacement" as const, requested_sequence_id: "6", replacement_attempt: 1, rotation_index: null,
};
const identity = { experiment_id: "experiment", participant_id: "P47", session_id: "experiment-session", ...assignment };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "layout-audit-"));
  roots.push(root);
  const receiverData = join(root, "receiver");
  const archives = [join(root, "export")];
  await mkdir(join(receiverData, "spool"), { recursive: true });
  await mkdir(archives[0]);
  const schedule = join(root, "schedule.json");
  await writeFile(schedule, JSON.stringify({ schema: "layouttask.schedule.v1", presentationCount: 25,
    sequences: [{ sequenceId: 6, presentations }] }));
  return { root, receiverData, archives, schedule };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function trial(index: number, version = 2, session = "experiment-session") {
  const result: LayoutTaskResult = {
    schema: "layouttask.result.v1", exp: "experiment", qid: `Q${index}`, task_id: index ? presentations[index - 1].taskId : "tutorial",
    session: `trial-${index}`, start_time: 1000, end_time: 2000, duration_ms: 1000,
    events: [], final_state: {}, locked: true,
    ...(index ? { presentation: presentations[index - 1] } : {}),
  };
  const encoded = await new LayoutTaskEncoder().encode(result);
  return {
    schema: `layouttask.backup.v${version}`, qid: result.qid, task_id: result.task_id,
    session: result.session, hash8: encoded.hash8, encoding: encoded.encoding, encoded: encoded.output,
    ...(version === 2 ? { ...identity, session_id: session, trial_session_id: result.session,
      trial_type: index ? "formal" : "tutorial", trial_index: index || null,
      presentation_id: index ? presentations[index - 1].presentationId : null } : {}),
  };
}
type Backup = Awaited<ReturnType<typeof trial>>;

function sha256(bytes: string | Buffer) { return createHash("sha256").update(bytes).digest("hex"); }

async function spool(f: Fixture, backup: Backup, id = `sub-${backup.session}`, state = "pending") {
  const dir = join(f.receiverData, "spool", id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "f001__backup.json"), JSON.stringify(backup));
  const { schema: _schema, encoded: _encoded, session: _session, ...metadata } = backup;
  await writeFile(join(dir, "manifest.json"), JSON.stringify({
    submission_id: id, experiment_id: "experiment", participant_id: "P47",
    session_id: backup.schema.endsWith("v2") ? backup.session_id : backup.session,
    ...(backup.schema.endsWith("v2") ? { ...metadata, submission_kind: "trial" } : {}),
    files: [{ file_index: 1, file_id: `${id}-f001`, filename: "backup.json", archive_filename: "f001__backup.json",
      size_bytes: Buffer.byteLength(JSON.stringify(backup)), sha256: sha256(JSON.stringify(backup)), archive_status: state }],
  }));
}

async function receiverIndex(f: Fixture, state = "archived") {
  const path = join(f.receiverData, "spool/sub-trial-1/manifest.json");
  const { submission_id, ...manifest } = JSON.parse(await readFile(path, "utf8"));
  return { id: submission_id, ...manifest, archive_status: state,
    files: manifest.files.map((file: Record<string, unknown>) => ({ ...file, archive_status: state })) };
}

async function protectedFinal(f: Fixture, rows: ReturnType<typeof finalRow>[]) {
  await final(f, rows);
  const path = join(f.archives[0], "raw_results.csv");
  const bytes = await readFile(path);
  await writeFile(join(f.archives[0], "manifest.json"), JSON.stringify({ submission_id: "sub-final", ...identity,
    submission_kind: "final", files: [{ file_index: 1, file_id: "sub-final-f001", filename: "raw_results.csv",
      archive_filename: "raw_results.csv", size_bytes: bytes.length, sha256: sha256(bytes), archive_status: "pending" }] }));
  return path;
}

function finalRow(backup: Backup, session = "experiment-session") {
  // Final exports contain full result JSON, whereas the backup uses compressed transport.
  const index = Number(backup.session.split("-")[1]);
  const result = {
    schema: "layouttask.result.v1", exp: "experiment", qid: backup.qid, task_id: backup.task_id,
    session: backup.session, start_time: 1000, end_time: 2000, duration_ms: 1000,
    events: [], final_state: {}, locked: true,
    ...(index ? { presentation: presentations[index - 1] } : {}),
  };
  return { ...identity, session_id: session, trial_type: index ? "formal" : "tutorial", trial_index: index,
    task_id: backup.task_id, qid: backup.qid, hash8: backup.hash8, result_json: JSON.stringify(result),
    presentation_id: index ? presentations[index - 1].presentationId : "" };
}

async function final(f: Fixture, rows: ReturnType<typeof finalRow>[], name = "raw_results.csv") {
  await writeFile(join(f.archives[0], name), stringify(rows, { header: true }));
}

describe("read-only legacy submission audit", () => {
  it.each(["unchanged", "confidence", "duration_ms", "final_state"] as const)(
    "verifies production default final-only/relative CSV content: %s", async (change) => {
      const f = await fixture();
      f.schedule = resolve("public/layout-task-run12-core23-preview/schedule.json");
      const schedule = JSON.parse(await readFile(f.schedule, "utf8")) as ExperimentSchedule;
      const selected = schedule.sequences.find((sequence) => sequence.sequenceId === 6)!;
      const items = await Promise.all(selected.presentations.map(async (presentation) => {
        // Deliberately differ from schema key order: hashing must preserve the producer's order.
        const result: LayoutTaskResult = { session: `trial-${presentation.trialIndex}`, schema: "layouttask.result.v1",
          exp: "experiment", task_id: presentation.taskId, qid: `Q${presentation.trialIndex}`, presentation,
          start_time: 1000, end_time: 2000, duration_ms: 1000, locked: true,
          confidence: { chair: { position: 1, rotation: 2 } },
          events: [{ i: 0, t: 100, object: "chair", action: "move_right", valid: true }],
          final_state: { chair: { x: 10, y: 20, r: 0,
            counts: { left: 0, right: 1, up: 0, down: 0, cw: 0, ccw: 0 },
            offsets: { xSteps: 1, ySteps: 2, rotationSteps: 0 } } } };
        const encoded = await new LayoutTaskEncoder().encode(result);
        return { trialType: "formal" as const, taskId: presentation.taskId, qid: result.qid, presentation,
          result, hash8: encoded.hash8, encoded: encoded.output, encoding: encoded.encoding };
      }));
      const first = items[0];
      const legacy = await trial(1, 1);
      Object.assign(legacy, { task_id: first.taskId, qid: first.qid, hash8: first.hash8,
        encoding: first.encoding, encoded: first.encoded });
      await spool(f, legacy);
      // Alter full CSV content after hashing, without changing identity or the claimed hash.
      if (change === "confidence") first.result.confidence!.chair.position = 5;
      if (change === "duration_ms") {
        first.result.duration_ms = 900;
        first.result.end_time = 1900; // Keep timing valid so hash verification catches this change.
      }
      if (change === "final_state") {
        const state = first.result.final_state.chair;
        if ("offsets" in state) state.offsets!.xSteps = 2;
      }
      const raw = createExperimentCsvFiles({ participantId: "P47", sessionId: "experiment-session",
        experimentId: "experiment", referenceMode: "preview_10s", startTime: 1000, endTime: 3000,
        tutorialCompleted: true, tutorialDurationMs: 1000, trialOrder: items.map((item) => item.taskId),
        trialResults: items, assignment: toAssignmentMetadata(assignment) })
        .find((file) => file.filename.includes("raw_results"))!;
      await writeFile(join(f.archives[0], raw.filename), raw.data);
      const report = await auditLegacySubmissions(f);
      if (change === "unchanged") {
        expect(report.sessions[0]).toMatchObject({ status: "complete", final_presentations: 25 });
        expect(report.trials[0]).toMatchObject({ linkage: "unique", participant_number: 47 });
        expect(report.issues).toEqual([]);
      } else {
        expect(report.sessions[0]).toMatchObject({ status: "partial", final_presentations: 24 });
        expect(report.trials[0]).toMatchObject({ linkage: "unmatched", participant_number: null,
          session_status: "session_unknown" });
        expect(report.issues.some((issue) => issue.row === 2 && issue.message.includes("hash"))).toBe(true);
      }
    },
  );
  it.each(["automatic", "replacement"] as const)("audits production CSV exports and the published schedule for %s assignment", async (mode) => {
    const f = await fixture();
    f.schedule = resolve("public/layout-task-run12-core23-preview/schedule.json");
    const schedule = JSON.parse(await readFile(f.schedule, "utf8")) as ExperimentSchedule;
    const selected = schedule.sequences.find((sequence) => sequence.sequenceId === 6)!;
    const metadata = toAssignmentMetadata({ ...assignment, assignment_mode: mode,
      requested_sequence_id: mode === "automatic" ? null : "6", replacement_attempt: mode === "automatic" ? 0 : 1,
      rotation_index: mode === "automatic" ? 46 : null })!;
    const items = await Promise.all(selected.presentations.map(async (presentation) => {
      const result: LayoutTaskResult = { schema: "layouttask.result.v1", exp: "experiment", qid: `Q${presentation.trialIndex}`,
        task_id: presentation.taskId, session: `trial-${presentation.trialIndex}`, presentation,
        start_time: 1000, end_time: 2000, duration_ms: 1000, events: [], final_state: {}, locked: true };
      const encoded = await new LayoutTaskEncoder().encode(result);
      return { trialType: "formal" as const, taskId: presentation.taskId, qid: result.qid, presentation,
        result, encoded: encoded.output, hash8: encoded.hash8 };
    }));
    for (const file of createExperimentCsvFiles({ participantId: "P47", sessionId: "experiment-session",
      experimentId: "experiment", referenceMode: "preview_10s", startTime: 1000, endTime: 3000,
      tutorialCompleted: true, tutorialDurationMs: 1000, trialOrder: items.map((item) => item.taskId),
      trialResults: items, assignment: metadata })) {
      await writeFile(join(f.archives[0], file.filename), file.data);
    }
    const first = items[0];
    const legacy = await trial(1, 1);
    Object.assign(legacy, { task_id: first.taskId, qid: first.qid, hash8: first.hash8, encoded: first.encoded });
    await spool(f, legacy);
    const v2 = await trial(2);
    Object.assign(v2, metadata, { task_id: items[1].taskId, qid: items[1].qid,
      hash8: items[1].hash8, encoded: items[1].encoded });
    await spool(f, v2);
    const report = await auditLegacySubmissions(f);
    expect(report.sessions).toHaveLength(1);
    expect(report.sessions[0]).toMatchObject({ status: "complete", formal_presentations: 25,
      final_presentations: 25, assignment_mode: mode, participant_number: 47, sequence_id: "6",
      requested_sequence_id: mode === "automatic" ? null : "6", replacement_attempt: mode === "automatic" ? 0 : 1,
      rotation_index: mode === "automatic" ? 46 : null });
    expect(report.trials[0]).toMatchObject({ linkage: "unique", participant_number: 47, session_id: "experiment-session" });
    expect(report.trials.find((row) => row.rule === "v2_identity")).toMatchObject({ valid: true, participant_number: 47,
      sequence_id: "6", session_status: "complete" });
    expect(report.issues).toEqual([]);
  });
  it("reports an archived tutorial as tutorial_only, not complete", async () => {
    const f = await fixture();
    await spool(f, await trial(0), undefined, "archived");
    const report = await auditLegacySubmissions(f);
    expect(report.sessions).toHaveLength(1);
    expect(report.sessions[0]).toMatchObject({ status: "tutorial_only", formal_presentations: 0, archive_state: "archived" });
  });

  it("keeps v2 partial sessions separate and preserves the replacement number", async () => {
    const f = await fixture();
    await spool(f, await trial(1));
    await spool(f, await trial(2, 2, "another-session"));
    const report = await auditLegacySubmissions(f);
    expect(report.sessions).toHaveLength(2);
    expect(report.sessions[0]).toMatchObject({ status: "partial", participant_number: 47, sequence_id: "6",
      formal_presentations: 1, archive_state: "pending" });
  });

  it("requires 25 distinct valid positions for formal_25_final_missing", async () => {
    const f = await fixture();
    for (let i = 1; i <= 25; i++) await spool(f, await trial(i));
    await spool(f, await trial(1), "duplicate");
    const report = await auditLegacySubmissions(f);
    expect(report.sessions[0]).toMatchObject({ status: "formal_25_final_missing", formal_presentations: 25, final_present: false });
  });

  it("recognizes a complete final with repeated tasks, independent of pending spool", async () => {
    const f = await fixture();
    const backups = await Promise.all(Array.from({ length: 25 }, (_, i) => trial(i + 1)));
    await spool(f, backups[0]);
    await final(f, backups.map((backup) => finalRow(backup)), "f003__layout_raw_results_P47_S1.csv");
    const path = join(f.archives[0], "f003__layout_raw_results_P47_S1.csv");
    await writeFile(join(f.archives[0], "manifest.json"), JSON.stringify({ ...identity, submission_kind: "final",
      files: [{ archive_filename: "f003__layout_raw_results_P47_S1.csv", sha256: sha256(await readFile(path)), archive_status: "pending" }] }));
    const report = await auditLegacySubmissions(f);
    expect(report.sessions[0]).toMatchObject({ status: "complete", formal_presentations: 25,
      final_presentations: 25, final_present: true, archive_state: "pending" });
  });

  it("does not fill a missing repeated presentation with duplicate task uploads", async () => {
    const f = await fixture();
    const backups = await Promise.all(Array.from({ length: 24 }, (_, i) => trial(i + 1)));
    await final(f, [...backups.map((backup) => finalRow(backup)), finalRow(backups[1])]);
    const report = await auditLegacySubmissions(f);
    expect(report.sessions[0]).toMatchObject({ status: "partial", final_presentations: 24 });
  });

  it("links v1 only through a unique matching final row, with source evidence", async () => {
    const f = await fixture();
    const backup = await trial(24, 1);
    await spool(f, backup);
    await final(f, [finalRow(backup)]);
    const report = await auditLegacySubmissions(f);
    expect(report.trials[0]).toMatchObject({ linkage: "unique", participant_number: 47, sequence_id: "6",
      session_id: "experiment-session", session_status: "partial", rule: "unique_final_row" });
    expect(report.trials[0].candidates).toHaveLength(1);
    expect(report.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256))).toBe(true);
  });

  it("leaves a v1 trial ambiguous when matching final rows identify two sessions", async () => {
    const f = await fixture();
    const backup = await trial(1, 1);
    await spool(f, backup);
    await final(f, [finalRow(backup), finalRow(backup, "other-session")]);
    const report = await auditLegacySubmissions(f);
    expect(report.trials[0]).toMatchObject({ linkage: "ambiguous", session_status: "session_unknown",
      participant_number: null, session_id: null });
    expect(report.trials[0].candidates).toHaveLength(2);
  });

  it("keeps 25 v1 backups sequence-known, number-unknown and session-unknown", async () => {
    const f = await fixture();
    for (let i = 1; i <= 25; i++) await spool(f, await trial(i, 1));
    const report = await auditLegacySubmissions(f);
    expect(report.sessions).toEqual([]);
    expect(report.trials).toHaveLength(25);
    expect(report.trials.every((row) => row.linkage === "unmatched" && row.sequence_id === "6" &&
      row.participant_number === null && row.session_id === null && row.session_status === "session_unknown")).toBe(true);
  });

  it.each(["participant_id", "hash8", "task_id", "trial_index", "presentation_id", "trial_session"])(
    "does not link a legacy backup when %s differs", async (field) => {
      const f = await fixture();
      const backup = await trial(1, 1);
      await spool(f, backup);
      const row = finalRow(backup);
      if (field === "trial_session") {
        const result = JSON.parse(row.result_json);
        result.session = "different-trial";
        row.result_json = JSON.stringify(result);
      } else Object.assign(row, { [field]: field === "trial_index" ? 2 : "different" });
      await final(f, [row]);
      expect((await auditLegacySubmissions(f)).trials[0]).toMatchObject({ linkage: "unmatched", participant_number: null });
    },
  );

  it("reports malformed files and rejects a corrupted transport without guessing identity", async () => {
    const f = await fixture();
    const backup = await trial(1);
    backup.hash8 = "BADHASH8";
    await spool(f, backup);
    await writeFile(join(f.archives[0], "broken.json"), "{");
    const report = await auditLegacySubmissions(f);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.sessions).toEqual([]);
    expect(report.trials[0]).toMatchObject({ valid: false, session_status: "session_unknown" });
  });

  it("rejects v2 envelope/manifest identity mismatches", async () => {
    const f = await fixture();
    await spool(f, await trial(1));
    const path = join(f.receiverData, "spool/sub-trial-1/manifest.json");
    const manifest = JSON.parse(await readFile(path, "utf8"));
    manifest.participant_number = 6;
    await writeFile(path, JSON.stringify(manifest));
    const report = await auditLegacySubmissions(f);
    expect(report.trials[0]).toMatchObject({ valid: false, participant_number: null });
    expect(report.sessions).toEqual([]);
  });

  it("rejects final hash mismatches and never completes a session by pooling partial finals", async () => {
    const f = await fixture();
    const backups = await Promise.all(Array.from({ length: 25 }, (_, i) => trial(i + 1)));
    await spool(f, backups[0]);
    const rows = backups.map((backup) => finalRow(backup));
    rows[0].hash8 = "DEADBEEF";
    await final(f, rows.slice(0, 12));
    await final(f, rows.slice(12), "layout_raw_results_second.csv");
    const report = await auditLegacySubmissions(f);
    expect(report.sessions[0].status).toBe("partial");
    expect(report.issues.some((issue) => issue.message.includes("hash mismatch"))).toBe(true);
  });

  it("withholds a changed final result when its hash8 matches a v2 backup", async () => {
    const f = await fixture();
    const backup = await trial(1);
    await spool(f, backup);
    const row = finalRow(backup);
    const result = JSON.parse(row.result_json);
    result.confidence = { chair: { position: 5, rotation: 2 } };
    row.result_json = JSON.stringify(result);
    await final(f, [row]);

    const report = await auditLegacySubmissions(f);

    expect(report.trials[0]).toMatchObject({ valid: true, linkage: "unique", rule: "v2_identity",
      participant_number: 47, session_id: "experiment-session", session_status: "partial" });
    expect(report.sessions[0]).toMatchObject({ formal_presentations: 1, final_presentations: 0, status: "partial" });
    expect(report.issues.some((issue) => issue.row === 2 && issue.message.includes("hash mismatch"))).toBe(true);
  });

  it("runs the real CLI with repeated exports and leaves all inputs byte-identical", async () => {
    const f = await fixture();
    await spool(f, await trial(0));
    const other = join(f.root, "export-two");
    await mkdir(other);
    const before = await snapshot(f.root);
    const output = execFileSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"),
      resolve("tools/decoder/audit-legacy-submissions.ts"), "--receiver-data", f.receiverData,
      "--archive", f.archives[0], "--archive", other, "--schedule", f.schedule], { encoding: "utf8" });
    expect(JSON.parse(output).sessions[0].status).toBe("tutorial_only");
    expect(await snapshot(f.root)).toEqual(before);
  });

  it.each(["pending", "failed", "partial", "archived"])("uses exact current receiver %s state over stale pending with line provenance", async (state) => {
    const f = await fixture();
    await spool(f, await trial(1));
    const indexPath = join(f.receiverData, "submissions.jsonl");
    await writeFile(indexPath, "\n" + JSON.stringify(await receiverIndex(f, state)) + "\n");
    const before = await snapshot(f.root);
    const report = await auditLegacySubmissions(f);
    expect(report.issues).toEqual([]);
    expect(report.sessions[0].archive_state).toBe(state);
    expect(report.trials[0]).toMatchObject({ archive_state: state,
      archive_evidence: [{ path: indexPath, row: 2, kind: "receiver_index", state, submission_id: "sub-trial-1", file_id: "sub-trial-1-f001" }] });
    expect(report.sessions[0]).toMatchObject({ archive_evidence: report.trials[0].archive_evidence });
    expect(report.sources).toContainEqual({ path: indexPath, sha256: sha256(await readFile(indexPath)) });
    expect(await snapshot(f.root)).toEqual(before);
  });

  it("makes manifest-only fallback provenance explicit", async () => {
    const f = await fixture();
    await spool(f, await trial(1), undefined, "archived");
    const report = await auditLegacySubmissions(f);
    expect(report.trials[0]).toMatchObject({ archive_state: "archived", archive_evidence: [{
      kind: "manifest", path: join(f.receiverData, "spool/sub-trial-1/manifest.json"),
      state: "archived", fallback_reason: "receiver_index_absent",
    }] });
  });

  it.each(["id", "experiment_id", "participant_id", "session_id", "assignment_id", "participant_number", "sequence_id",
    "file_id", "file_index", "filename", "archive_filename", "sha256", "size_bytes"])(
    "does not apply archived index evidence with mismatching %s", async (field) => {
      const f = await fixture();
      await spool(f, await trial(1));
      const index = await receiverIndex(f);
      const target = ["file_id", "file_index", "filename", "archive_filename", "sha256", "size_bytes"].includes(field) ? index.files[0] : index;
      target[field] = typeof target[field] === "number" ? 999 : field === "sha256" ? "0".repeat(64) : "unrelated";
      const indexPath = join(f.receiverData, "submissions.jsonl");
      await writeFile(indexPath, JSON.stringify(index) + "\n");
      const report = await auditLegacySubmissions(f);
      expect(report.trials[0]).toMatchObject({ archive_state: "pending", participant_number: 47,
        archive_evidence: [{ kind: "manifest", fallback_reason: "receiver_index_unmatched" }] });
      expect(report.issues.some((issue) => issue.path === indexPath && issue.row === 1 && /unmatched|mismatch/i.test(issue.message))).toBe(true);
    },
  );

  it.each([
    { line: "{", state: "pending", evidence: { state: "pending", fallback_reason: "receiver_index_unmatched" } },
    { line: "[]", state: "pending", evidence: { state: "pending", fallback_reason: "receiver_index_unmatched" } },
    { line: JSON.stringify({ id: "sub-trial-1", files: [] }), state: "unknown",
      evidence: { state: "unknown", recorded_state: "pending", fallback_reason: "receiver_index_invalid" } },
  ])("surfaces malformed index evidence: $line", async ({ line, state, evidence }) => {
    const f = await fixture();
    await spool(f, await trial(1));
    const path = join(f.receiverData, "submissions.jsonl");
    await writeFile(path, line + "\n");
    const report = await auditLegacySubmissions(f);
    expect(report.trials[0]).toMatchObject({ archive_state: state, archive_evidence: [{ kind: "manifest", ...evidence }] });
    expect(report.issues.some((issue) => issue.path === path && issue.row === 1)).toBe(true);
  });

  it.each(["duplicate_state", "duplicate_identity", "file_state", "invalid_state"])("withholds contradictory current archive evidence: %s", async (change) => {
    const f = await fixture();
    await spool(f, await trial(1));
    const first = await receiverIndex(f);
    const second = await receiverIndex(f, "pending");
    if (change === "duplicate_identity") { Object.assign(second, first); second.participant_id = "someone-else"; }
    if (change === "file_state") first.files[0].archive_status = "pending";
    if (change === "invalid_state") first.archive_status = "not-a-state";
    const path = join(f.receiverData, "submissions.jsonl");
    await writeFile(path, [first, ...(change.startsWith("duplicate") ? [second] : [])].map((row) => JSON.stringify(row)).join("\n"));
    const report = await auditLegacySubmissions(f);
    expect(report.trials[0].archive_state).not.toBe("archived");
    expect(report.issues.some((issue) => issue.path === path && /conflict|status|state/i.test(issue.message))).toBe(true);
    expect(report.trials[0]).toMatchObject({ archive_evidence: [{ kind: "manifest" }] });
  });

  it.each([false, true])("enforces full-file final digest when omitted events change: tampered=%s", async (tampered) => {
    const f = await fixture();
    const backups = await Promise.all(Array.from({ length: 25 }, (_, i) => trial(i + 1, 1)));
    await spool(f, backups[0]);
    const rows = backups.map((backup) => finalRow(backup));
    const path = await protectedFinal(f, rows);
    if (tampered) {
      const result = JSON.parse(rows[0].result_json);
      result.events = [{ i: 0, t: 200, object: "chair", action: "move_right", valid: true }];
      rows[0].result_json = JSON.stringify(result);
      await final(f, rows);
    }
    const before = await snapshot(f.root);
    const report = await auditLegacySubmissions(f);
    expect(report).toMatchObject({ file_integrity: expect.arrayContaining([expect.objectContaining({ path, status: tampered ? "rejected" : "verified",
      manifest: { path: join(f.archives[0], "manifest.json") }, declared_sha256: expect.any(String) })]) });
    if (tampered) {
      expect(report.sessions.every((session) => session.final_presentations === 0)).toBe(true);
      expect(report.trials[0]).toMatchObject({ linkage: "unmatched", participant_number: null });
      expect(report.issues.some((issue) => issue.path === path && /sha256.*mismatch/i.test(issue.message))).toBe(true);
    } else {
      expect(report.sessions[0]).toMatchObject({ status: "complete", final_presentations: 25 });
      expect(report.trials[0].linkage).toBe("unique");
      expect(report.issues).toEqual([]);
    }
    expect(report.sources).toContainEqual({ path, sha256: sha256(await readFile(path)) });
    expect(await snapshot(f.root)).toEqual(before);
  });

  it.each(["changed", "missing", "invalid", "mismatch"])("rejects protected backup with %s checksum", async (change) => {
    const f = await fixture();
    await spool(f, await trial(1));
    const path = join(f.receiverData, "spool/sub-trial-1/f001__backup.json");
    const manifestPath = join(f.receiverData, "spool/sub-trial-1/manifest.json");
    if (change === "changed") await writeFile(path, (await readFile(path, "utf8")) + "\n");
    else {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (change === "missing") delete manifest.files[0].sha256;
      else manifest.files[0].sha256 = change === "invalid" ? "invalid" : "0".repeat(64);
      await writeFile(manifestPath, JSON.stringify(manifest));
    }
    const before = await snapshot(f.root);
    const report = await auditLegacySubmissions(f);
    expect(report.sessions).toEqual([]);
    expect(report.trials[0]).toMatchObject({ valid: false, linkage: "unmatched", participant_number: null });
    expect(report.issues.some((issue) => issue.path === path && /sha256/i.test(issue.message))).toBe(true);
    expect(report).toMatchObject({ file_integrity: [{ path, status: "rejected", manifest: { path: manifestPath } }] });
    expect(report.sources).toContainEqual({ path, sha256: sha256(await readFile(path)) });
    expect(await snapshot(f.root)).toEqual(before);
  });

  it.each(["missing", "invalid"])("withholds all final rows for a %s declared checksum", async (change) => {
    const f = await fixture();
    const backup = await trial(1, 1);
    await spool(f, backup);
    const path = await protectedFinal(f, [finalRow(backup)]);
    const manifestPath = join(f.archives[0], "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (change === "missing") delete manifest.files[0].sha256;
    else manifest.files[0].sha256 = "invalid";
    await writeFile(manifestPath, JSON.stringify(manifest));
    const report = await auditLegacySubmissions(f);
    expect(report.sessions).toEqual([]);
    expect(report.trials[0]).toMatchObject({ linkage: "unmatched", participant_number: null });
    expect(report.issues.some((issue) => issue.path === path && /sha256/i.test(issue.message))).toBe(true);
  });

  it("supports standalone legacy finals with explicit unverified full-file integrity", async () => {
    const f = await fixture();
    const backup = await trial(1, 1);
    await spool(f, backup);
    await final(f, [finalRow(backup)]);
    const path = join(f.archives[0], "raw_results.csv");
    const report = await auditLegacySubmissions(f);
    expect(report.trials[0].linkage).toBe("unique");
    expect(report).toMatchObject({ file_integrity: expect.arrayContaining([expect.objectContaining({ path, status: "unverified", manifest: null, declared_sha256: null })]) });
    expect(report.sessions[0]).toMatchObject({ archive_evidence: expect.arrayContaining([{ kind: "unrecorded", path, state: "unknown" }]) });
    expect(report.issues).toEqual([]);
  });

  it.each(["duplicate", "invalid"])("keeps an archived manifest fallback unknown when current evidence is %s", async (change) => {
    const f = await fixture();
    await spool(f, await trial(1), undefined, "archived");
    const index = await receiverIndex(f);
    if (change === "invalid") index.archive_status = "not-a-state";
    await writeFile(join(f.receiverData, "submissions.jsonl"), [index,
      ...(change === "duplicate" ? [await receiverIndex(f, "pending")] : [])].map((item) => JSON.stringify(item)).join("\n"));
    const report = await auditLegacySubmissions(f);
    expect(report.trials[0]).toMatchObject({ archive_state: "unknown", archive_evidence: [{
      kind: "manifest", state: "unknown", recorded_state: "archived",
    }] });
    expect(report.sessions[0].archive_state).toBe("unknown");
  });

  it("does not give changed backup bytes the receiver index's archived state", async () => {
    const f = await fixture();
    await spool(f, await trial(1));
    const index = await receiverIndex(f);
    await writeFile(join(f.receiverData, "submissions.jsonl"), JSON.stringify(index));
    const path = join(f.receiverData, "spool/sub-trial-1/f001__backup.json");
    await writeFile(path, (await readFile(path, "utf8")) + "\n");
    const report = await auditLegacySubmissions(f);
    expect(report.trials[0]).toMatchObject({ valid: false, archive_state: "unknown", archive_evidence: [{
      kind: "receiver_index", state: "unknown", recorded_state: "archived", fallback_reason: "file_integrity_rejected",
    }] });
  });

  it.each(["malformed", "invalid_files", "unlisted", "duplicate_file"])("does not accept protected files as standalone after %s manifest evidence", async (change) => {
    const f = await fixture();
    const backup = await trial(1, 1);
    await spool(f, backup);
    const path = await protectedFinal(f, [finalRow(backup)]);
    const manifestPath = join(f.archives[0], "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (change === "invalid_files") manifest.files = null;
    if (change === "unlisted") manifest.files = [];
    if (change === "duplicate_file") manifest.files.unshift({ ...manifest.files[0], sha256: "0".repeat(64) });
    await writeFile(manifestPath, change === "malformed" ? "{" : JSON.stringify(manifest));
    const before = await snapshot(f.root);
    const report = await auditLegacySubmissions(f);
    expect(report.sessions).toEqual([]);
    expect(report.trials[0].linkage).toBe("unmatched");
    expect(report).toMatchObject({ file_integrity: expect.arrayContaining([expect.objectContaining({ path, status: "rejected", manifest: { path: manifestPath } })]) });
    expect(report.issues.some((issue) => issue.path === path || issue.path === manifestPath)).toBe(true);
    expect(await snapshot(f.root)).toEqual(before);
  });
});

async function snapshot(dir: string): Promise<Record<string, string>> {
  const entries = await readdir(dir, { withFileTypes: true });
  const result: Record<string, string> = {};
  for (const entry of entries) {
    const path = join(dir, entry.name);
    Object.assign(result, entry.isDirectory() ? await snapshot(path) : { [path]: (await readFile(path)).toString("base64") });
  }
  return result;
}
