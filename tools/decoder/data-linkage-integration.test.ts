import { describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { DataSaveService } from "../../src/core/data-save-service";
import { LayoutTaskEncoder } from "../../src/core/encoder";
import { createConsentRecord } from "../../src/core/experiment-consent";
import {
  createExperimentCsvFiles,
  type ExperimentAssignmentMetadata,
  type ExperimentTrialResultItem,
} from "../../src/core/experiment-data";
import { createMemoryLocalBackupStore } from "../../src/core/local-backup-store";
import { saveExperimentFiles } from "../../src/experiment-runner";
import type { CompletionPayload } from "../../src/core/completion-controller";
import type { LayoutTaskResult } from "../../src/types/result";
import type { ExperimentSchedule, ReferencePresentation } from "../../src/types/schedule";
import { auditLegacySubmissions } from "./audit-legacy-submissions";

// The browser UI is unused; keep the real runner save/export functions in Node.
vi.mock("jspsych", () => ({ initJsPsych: vi.fn(), ParameterType: { OBJECT: "object", STRING: "string", BOOL: "bool" } }));
vi.mock("@jspsych/plugin-instructions", () => ({ default: function InstructionsPlugin() {} }));

const project = fileURLToPath(new URL("../../", import.meta.url));
const schedulePath = join(project, "public/layout-task-run12-core23-persistent/schedule.json");
const schedule = JSON.parse(readFileSync(schedulePath, "utf8")) as ExperimentSchedule;
const python = process.env.PYTHON ?? "python3";
const experimentId = "layout_task_v1";
type StoredSubmission = { id: string; file_count: number; archive_status: string; duplicate: boolean };
type SessionArchiveResult = {
  ok: boolean; archive_status: string; archive_uri: string | null; error: string | null;
  already_archived: boolean; data_complete: boolean | null; finalization_status: string | null;
};

// This subprocess uses the actual storage API; every response/error crosses stdout.
const receiverScript = [
  "import hashlib, json, sys, traceback",
  "from dataclasses import asdict",
  "from pathlib import Path",
  "sys.path.insert(0, sys.argv[1])",
  "from app.archive import LocalArchiveBackend",
  "from app.models import validate_submission",
  "from app.storage import ReceiverStorage",
  "storage = ReceiverStorage(Path(sys.argv[2]), archive_backend=LocalArchiveBackend(Path(sys.argv[3])), archive_on_submit=False, expected_formal_trial_count=25, require_tutorial=True, schedule_version='integration-published-run12')",
  "for line in sys.stdin:",
  "    try:",
  "        req = json.loads(line)",
  "        if req['op'] == 'assign':",
  "            record = storage.allocate_assignment(req['experiment_id'], req['token'], req['schedule_version'], req['sequence_ids'], req.get('requested_sequence_id'))",
  "            out = asdict(record)",
  "        elif req['op'] == 'submit':",
  "            payload = req['payload']",
  "            submission = validate_submission(payload, max_files=8, max_file_bytes=5_242_880)",
  "            stored = storage.save_submission(submission, None, 'integration', hashlib.sha256(line.encode()).hexdigest())",
  "            out = asdict(stored)",
  "        elif req['op'] == 'retry':",
  "            out = storage.retry_pending()",
  "        elif req['op'] == 'archive':",
  "            out = asdict(storage.queue_archive(req['payload']['experiment_id'], req['payload']['participant_id'], req['payload']['session_id']))",
  "        else:",
  "            raise ValueError('unknown operation: ' + req['op'])",
  "        print(json.dumps({'ok': True, 'result': out}), flush=True)",
  "    except Exception as error:",
  "        print(json.dumps({'ok': False, 'error': str(error), 'traceback': traceback.format_exc()}), flush=True)",
].join("\n");

describe("TS producers -> Python receiver -> read-only archive audit", () => {
  it("preserves allocated automatic/replacement identities and all completion states", async () => {
    const temp = mkdtempSync(join(tmpdir(), "layout-linkage-"));
    const receiverData = join(temp, "receiver");
    const archive = join(temp, "archive");
    const receiverPaths = [join(project, "receiver"), receiverData, archive];
    const args = ["-u", "-c", receiverScript, ...receiverPaths];
    const child = spawn(python, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    });
    const closed = once(child, "close");
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    async function receiver(request: Record<string, unknown>) {
      child.stdin.write(JSON.stringify(request) + "\n");
      const line = await lines.next();
      if (line.done) throw new Error("Python receiver exited: " + stderr);
      const response = JSON.parse(line.value);
      if (!response.ok) {
        console.error("Python receiver response: " + line.value);
        throw new Error("Python receiver " + request.op + ": " + response.error + "\n" + response.traceback);
      }
      return response.result;
    }

    try {
      const auditOptions = { receiverData, archives: [archive], schedule: schedulePath };
      for (const mode of ["automatic", "replacement"] as const) {
        const record = await receiver({
          op: "assign", experiment_id: experimentId, token: mode, schedule_version: "integration-published-run12",
          sequence_ids: ["6", "7"], ...(mode === "replacement" ? { requested_sequence_id: "7" } : {}),
        }) as ExperimentAssignmentMetadata;
        expect(record).toMatchObject(mode === "automatic"
          ? { assignment_mode: "automatic", participant_number: 1, sequence_id: "6", requested_sequence_id: null, rotation_index: 0 }
          : { assignment_mode: "replacement", participant_number: 2, sequence_id: "7", requested_sequence_id: "7", replacement_attempt: 1, rotation_index: null });
        expect(record.participant_number).not.toBe(Number(record.sequence_id));
        const sequence = schedule.sequences.find((item) => String(item.sequenceId) === record.sequence_id)!;
        expect(sequence.presentations.map((item) => item.trialIndex)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
        expect(new Set(sequence.presentations.map((item) => item.taskId)).size).toBe(23);
        const assignment: ExperimentAssignmentMetadata = {
          assignment_id: record.assignment_id, participant_number: record.participant_number,
          sequence_id: record.sequence_id, schedule_version: record.schedule_version, assignment_mode: record.assignment_mode,
          requested_sequence_id: record.requested_sequence_id, replacement_attempt: record.replacement_attempt,
          rotation_index: record.rotation_index,
        };
        const participantId = "P" + record.participant_number;
        const participantProfile = {
          participant_age: 31,
          participant_sex_assigned_at_birth: mode === "automatic" ? "male" as const : "female" as const,
          requires_corrective_eyewear: true,
        };
        const requests: Record<string, unknown>[] = [];
        const submissions: Array<{ request: Record<string, unknown>; reply: StoredSubmission; status: number }> = [];
        const archives: Array<{ request: Record<string, unknown>; reply: SessionArchiveResult; status: number }> = [];
        const fetchImpl: typeof fetch = async (url, init) => {
          const request = JSON.parse(String(init?.body));
          requests.push(request);
          const path = new URL(String(url)).pathname;
          if (path === "/submit") {
            const reply = await receiver({ op: "submit", payload: request }) as StoredSubmission;
            const status = reply.duplicate ? 200 : 201;
            submissions.push({ request, reply, status });
            // Match server.py's HTTP body; StoredSubmission itself has no `ok`.
            return new Response(JSON.stringify({ ok: true, submission_id: reply.id,
              file_count: reply.file_count, archive_status: reply.archive_status }), { status });
          }
          if (path === "/archive") {
            const reply = await receiver({ op: "archive", payload: request }) as SessionArchiveResult;
            const status = reply.ok ? (reply.already_archived ? 200 : 202)
              : reply.finalization_status === "incomplete" || reply.finalization_status === "needs_recovery" ? 409 : 503;
            archives.push({ request, reply, status });
            if (!reply.ok) console.error("Python archive response: " + JSON.stringify(reply));
            return new Response(JSON.stringify(reply.ok
              ? { ok: true, data_complete: reply.data_complete === true, finalization_status: reply.finalization_status, archive_status: reply.archive_status, archive_uri: reply.archive_uri }
              : { ok: false, data_complete: false, finalization_status: reply.finalization_status, archive_status: reply.archive_status, error: status === 409 ? "incomplete_data" : "archive_failed", message: reply.error }), { status });
          }
          throw new Error("Unexpected receiver endpoint: " + String(url));
        };

        async function saveTrial(sessionId: string, payload: CompletionPayload) {
          const submissionCount = submissions.length;
          const archiveCount = archives.length;
          const saved = await new DataSaveService({
            config: {
              mode: "receiver", experiment_id: experimentId, participant_id: participantId, session_id: sessionId,
              endpoint: "https://receiver.invalid/submit", filename_prefix: "layout-task", payload_format: "json-envelope",
              save_encoded: true, save_result: true, assignment, expected_presentation: payload.result.presentation,
            }, fetchImpl,
          }).save(payload);
          expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true, provider: "receiver" });
          expect(submissions).toHaveLength(submissionCount + 1);
          expect(archives).toHaveLength(archiveCount);
          const { request, reply, status } = submissions[submissionCount];
          expect(reply, JSON.stringify(reply)).toMatchObject({ id: expect.any(String), file_count: 1 });
          expect(status).toBe(reply.duplicate ? 200 : 201);
          expect(request).toMatchObject({
            schema: "layouttask.receiver.submission.v2", submission_kind: "trial", ...assignment,
            participant_id: participantId, session_id: sessionId, trial_session_id: payload.result.session,
          });
          const file = (request.files as Array<{ data: string }>)[0];
          expect(JSON.parse(file.data)).toMatchObject({
            schema: "layouttask.backup.v2", ...assignment, session_id: sessionId,
            trial_session_id: payload.result.session, session: payload.result.session,
          });
          expect(payload.result.session).not.toBe(sessionId);
          return reply;
        }

        async function saveMetadata(sessionId: string) {
          const before = submissions.length;
          const result = await new DataSaveService({
            config: {
              mode: "receiver", experiment_id: experimentId, participant_id: participantId, session_id: sessionId,
              endpoint: "https://receiver.invalid/submit", filename_prefix: "layout-task", payload_format: "json-envelope",
              save_encoded: true, save_result: true, assignment,
            },
            localBackup: createMemoryLocalBackupStore(`${mode}:${sessionId}:metadata`),
            fetchImpl,
          }).saveSessionMetadata({
            prolificId: "prolific-test",
            participantProfile,
            consent: createConsentRecord({ locale: "en-US", mode: "agreed", consentedAt: "2026-11-08T00:00:00.000Z" }),
          });
          expect(result, JSON.stringify(result)).toMatchObject({ ok: true, provider: "receiver" });
          expect(submissions).toHaveLength(before + 1);
          expect(submissions[before].request).toMatchObject({
            schema: "layouttask.receiver.submission.v2", submission_kind: "metadata", ...assignment,
            participant_id: participantId, session_id: sessionId,
          });
        }

        async function saveFinal(sessionId: string, tutorial: CompletionPayload, trials: CompletionPayload[], expectComplete = true, expectArchived = false) {
          const requestCount = requests.length;
          const submissionCount = submissions.length;
          const archiveCount = archives.length;
          const trialResults: ExperimentTrialResultItem[] = trials.map((payload) => ({
            trialType: "formal", taskId: payload.result.task_id, qid: payload.result.qid,
            encoded: payload.encoded.output, hash8: payload.encoded.hash8,
            result: payload.result, presentation: payload.result.presentation,
          }));
          const files = createExperimentCsvFiles({
            participantId, sessionId, experimentId, assignment, participantProfile, referenceMode: "persistent",
            startTime: 1000, endTime: 2000, tutorialCompleted: true, tutorialDurationMs: 1000,
            trialOrder: trialResults.map((trial) => trial.taskId), trialResults,
            tutorialResult: { trialType: "tutorial", taskId: tutorial.result.task_id, qid: tutorial.result.qid,
              encoded: tutorial.encoded.output, hash8: tutorial.encoded.hash8, result: tutorial.result },
          });
          const saved = await saveExperimentFiles({
            dataSave: { mode: "receiver", experimentId, endpoint: "https://receiver.invalid/submit", filenamePrefix: "layout" },
            files, participantId, sessionId, participantProfile, fetchImpl,
            assignment: {
              assignmentId: record.assignment_id, participantNumber: record.participant_number,
              sequenceId: record.sequence_id, scheduleVersion: record.schedule_version, assignmentMode: record.assignment_mode,
              requestedSequenceId: record.requested_sequence_id, replacementAttempt: record.replacement_attempt, rotationIndex: record.rotation_index,
            },
          });
          if (!expectComplete) {
            expect(saved, JSON.stringify(saved)).toMatchObject({ ok: false, saved: files.length, failedFilename: "receiver archive" });
            expect(submissions).toHaveLength(submissionCount + 1);
            expect(archives).toHaveLength(archiveCount + 2);
            expect(archives.slice(archiveCount).every(({ status }) => status === 409)).toBe(true);
            return { submission: submissions[submissionCount].reply, archive: archives[archiveCount + 1].reply };
          }
          expect(saved, JSON.stringify(saved)).toEqual({ ok: true, saved: files.length });
          expect(submissions).toHaveLength(submissionCount + 1);
          expect(archives).toHaveLength(archiveCount + 1);
          const submitted = submissions[submissionCount];
          const archived = archives[archiveCount];
          // The real client must submit first, then explicitly call /archive.
          expect(requests.slice(requestCount)).toEqual([submitted.request, archived.request]);
          const final = submitted.request;
          expect(final).toMatchObject({ schema: "layouttask.receiver.submission.v2", submission_kind: "final",
            ...assignment, participant_id: participantId, session_id: sessionId });
          expect(final).not.toHaveProperty("trial_session_id");
          expect(submitted.reply, JSON.stringify(submitted.reply)).toMatchObject({
            id: expect.any(String), file_count: files.length,
          });
          expect(submitted.status).toBe(submitted.reply.duplicate ? 200 : 201);
          expect(archived.request).toMatchObject({ schema: "layouttask.receiver.archive.v1",
            ...assignment, experiment_id: experimentId, participant_id: participantId, session_id: sessionId });
          expect(archived.reply, JSON.stringify(archived.reply)).toMatchObject({ ok: true, data_complete: true, finalization_status: "complete" });
          expect(archived.reply.archive_status).toBe(expectArchived ? "archived" : "pending");
          expect(archived.status).toBe(expectArchived ? 200 : 202);
          expect(await receiver({ op: "retry" })).toBe(expectArchived ? 0 : trials.length + 3);
          const archivedDir = join(archive, experimentId, participantId, sessionId, submitted.reply.id);
          const sessionCsv = readdirSync(archivedDir).find((name) => name.includes("_session_") && name.endsWith(".csv"))!;
          const [demographics] = parse(readFileSync(join(archivedDir, sessionCsv), "utf8"), { columns: true });
          expect(demographics).toMatchObject({
            participant_age: "31",
            participant_sex_assigned_at_birth: participantProfile.participant_sex_assigned_at_birth,
            requires_corrective_eyewear: "true",
          });
          const raw = files.find((file) => file.filename.includes("_raw_results_"))!;
          const rows = parse(raw.data, { columns: true }) as Record<string, string>[];
          expect(rows).toHaveLength(trials.length + 1);
          for (const row of rows) {
            for (const [key, value] of Object.entries(assignment)) {
              expect(row[key]).toBe(value === null ? "" : String(value));
            }
            expect(row.session_id).toBe(sessionId);
            expect(JSON.parse(row.result_json).session).not.toBe(sessionId);
          }
          return { submission: submitted.reply, archive: archived.reply };
        }

        const tutorialSession = mode + "-tutorial-only";
        const tutorial = await makePayload(mode + "-tutorial-trial");
        await saveMetadata(tutorialSession);
        await saveTrial(tutorialSession, tutorial);
        expect(requests.at(-1)).not.toHaveProperty("presentation_id");
        expect(requests.at(-1)).not.toHaveProperty("trial_index");
        await saveFinal(tutorialSession, tutorial, [], false);
        let audit = await auditLegacySubmissions(auditOptions);
        expect(audit.issues).toEqual([]);
        expect(audit.sessions.find((session) => session.session_id === tutorialSession)).toMatchObject({
          ...assignment, status: "tutorial_only", formal_presentations: 0, final_present: true, archive_state: "pending",
        });

        const sessionId = mode + "-formal-experiment";
        const trials = await Promise.all(sequence.presentations.map((presentation) =>
          makePayload(mode + "-formal-trial-" + presentation.trialIndex, presentation)));
        await saveMetadata(sessionId);
        await saveTrial(sessionId, tutorial);
        const first = await saveTrial(sessionId, trials[0]);
        const duplicate = await saveTrial(sessionId, trials[0]);
        expect(duplicate).toMatchObject({ id: first.id, duplicate: true });
        expect(await receiver({ op: "retry" })).toBe(0);
        expect(existsSync(join(receiverData, "spool", first.id!))).toBe(true);
        expect(existsSync(join(archive, experimentId, participantId, sessionId, first.id!))).toBe(false);
        audit = await auditLegacySubmissions(auditOptions);
        expect(audit.issues).toEqual([]);
        expect(audit.sessions.find((session) => session.session_id === sessionId)).toMatchObject({
          ...assignment, status: "partial", formal_presentations: 1, final_present: false, archive_state: "pending",
        });

        for (const payload of trials.slice(1)) await saveTrial(sessionId, payload);
        expect(await receiver({ op: "retry" })).toBe(0);
        expect(readdirSync(join(receiverData, "spool")).length).toBeGreaterThan(0);
        audit = await auditLegacySubmissions(auditOptions);
        expect(audit.issues).toEqual([]);
        expect(audit.sessions.find((session) => session.session_id === sessionId)).toMatchObject({
          ...assignment, status: "formal_25_final_missing", formal_presentations: 25, final_present: false, archive_state: "pending",
        });

        const final = await saveFinal(sessionId, tutorial, trials);
        expect(final.submission.duplicate).toBe(false);
        expect(final.archive.already_archived).toBe(false);
        const finalDuplicate = await saveFinal(sessionId, tutorial, trials, true, true);
        expect(finalDuplicate.submission).toMatchObject({ id: final.submission.id, duplicate: true });
        expect(finalDuplicate.archive).toMatchObject({ ok: true, already_archived: true });
        expect(await saveTrial(sessionId, trials[0])).toMatchObject({ id: first.id, duplicate: true });
        expect(submissions.filter(({ request }) => request.session_id === sessionId)
          .every(({ reply }) => !existsSync(join(receiverData, "spool", reply.id)))).toBe(true);

        const beforeAudit = snapshot(temp);
        audit = await auditLegacySubmissions(auditOptions);
        expect(audit.issues).toEqual([]);
        expect(audit.sessions.find((session) => session.session_id === sessionId)).toMatchObject({
          ...assignment, status: "complete", formal_presentations: 25, final_presentations: 25, final_present: true, archive_state: "archived",
        });
        expect(audit.trials.some((trial) => trial.session_id === sessionId && trial.trial_type === "tutorial")).toBe(true);
        const auditedTrials = audit.trials.filter((trial) => trial.session_id === sessionId && trial.trial_type === "formal");
        expect(auditedTrials).toHaveLength(25);
        for (const trial of auditedTrials) {
          expect(trial).toMatchObject({ participant_number: record.participant_number, sequence_id: record.sequence_id,
            linkage: "unique", rule: "v2_identity", valid: true, session_status: "complete", archive_state: "archived" });
          expect(trial).toMatchObject({ archive_evidence: [{ kind: "receiver_index", state: "archived",
            path: join(receiverData, "submissions.jsonl"), row: expect.any(Number), submission_id: expect.any(String), file_id: expect.any(String) }] });
        }
        expect(auditedTrials.map((trial) => trial.trial_index).sort((a, b) => a! - b!)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
        expect(await auditLegacySubmissions(auditOptions)).toEqual(audit);
        expect(snapshot(temp)).toEqual(beforeAudit);
      }
    } finally {
      child.stdin.end();
      await closed;
      rmSync(temp, { recursive: true, force: true });
    }
  }, 120_000);
});

async function makePayload(session: string, presentation?: ReferencePresentation): Promise<CompletionPayload> {
  const result: LayoutTaskResult = {
    schema: "layouttask.result.v1", exp: experimentId, qid: "Q-" + session, task_id: presentation?.taskId ?? "tutorial",
    ...(presentation ? { presentation } : {}), session, start_time: 1000, end_time: 2000, duration_ms: 1000,
    final_state_mode: "absolute", events: [], final_state: {}, locked: true,
  };
  return { result, encoded: await new LayoutTaskEncoder().encode(result, { detail: "full", final_state: "absolute" }),
    copyResult: { ok: true, method: "manual" } };
}

function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) Object.assign(files, snapshot(path));
    else files[path] = readFileSync(path).toString("base64");
  }
  return files;
}
