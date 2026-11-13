from __future__ import annotations

from dataclasses import dataclass
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import time
from typing import Any
import uuid

from .archive import ArchiveResult, ArchiveTargetResult
from .models import ASSIGNMENT_FIELDS, IDENTITY_FIELDS, TRIAL_FIELDS, Submission, ValidationError


FINAL_WAIT_SECONDS = 300


@dataclass(frozen=True)
class StoredSubmission:
    id: str
    file_count: int
    archive_status: str
    duplicate: bool = False


@dataclass(frozen=True)
class AssignmentRecord:
    assignment_id: str
    experiment_id: str
    idempotency_token: str
    participant_number: int
    sequence_id: str
    schedule_version: str
    assignment_mode: str
    requested_sequence_id: str | None
    replacement_attempt: int
    rotation_index: int | None
    assigned_at: str


@dataclass(frozen=True)
class SessionArchiveResult:
    ok: bool
    archive_status: str
    archive_uri: str | None = None
    error: str | None = None
    already_archived: bool = False
    data_complete: bool | None = None
    finalization_status: str | None = None


@dataclass(frozen=True)
class SessionFinalizationResult:
    ok: bool
    data_complete: bool
    finalization_status: str
    archive_status: str
    error: str | None = None
    final_submission_id: str | None = None
    manifest_json: str = "{}"


@dataclass(frozen=True)
class MetadataArchiveResult:
    local_path: Path
    uploaded_uri: str | None
    local_kept: bool


class ReceiverStorage:
    def __init__(
        self,
        data_dir: Path,
        archive_backend: Any = None,
        delete_local_after_success: bool = True,
        metadata_archive_backend: Any = None,
        metadata_delete_local_after_upload: bool = True,
        archive_on_submit: bool = True,
        expected_formal_trial_count: int | None = None,
        require_tutorial: bool | None = None,
        schedule_version: str | None = None,
    ):
        self.data_dir = Path(data_dir)
        self.archive_backend = archive_backend
        self.delete_local_after_success = delete_local_after_success
        self.metadata_archive_backend = metadata_archive_backend
        self.metadata_delete_local_after_upload = metadata_delete_local_after_upload
        self.archive_on_submit = archive_on_submit
        self.expected_formal_trial_count = expected_formal_trial_count if expected_formal_trial_count is not None else _env_positive_int("ASSIGNMENT_EXPECTED_FORMAL_TRIAL_COUNT")
        self.require_tutorial = (
            require_tutorial
            if require_tutorial is not None
            else os.environ.get("ASSIGNMENT_REQUIRE_TUTORIAL", "false").lower() == "true"
        )
        self.schedule_version = schedule_version or os.environ.get("ASSIGNMENT_SCHEDULE_VERSION")
        self.spool_dir = self.data_dir / "spool"
        self.jsonl_path = self.data_dir / "submissions.jsonl"
        self.sqlite_path = self.data_dir / "submissions.sqlite"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._init_schema()
        with _process_lock(self.data_dir / ".publication-lock.sqlite"):
            self._reconcile_jsonl()

    def allocate_assignment(
        self,
        experiment_id: str,
        idempotency_token: str,
        schedule_version: str,
        sequence_ids: list[str],
        requested_sequence_id: str | None = None,
    ) -> AssignmentRecord:
        if not experiment_id or not idempotency_token or not schedule_version or not sequence_ids:
            raise ValueError("assignment requires experiment, token, schedule, and sequences")
        with closing(sqlite3.connect(self.sqlite_path, timeout=30)) as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT assignment_id, experiment_id, idempotency_token, participant_number, sequence_id, schedule_version, assignment_mode, requested_sequence_id, replacement_attempt, rotation_index, assigned_at FROM assignments WHERE experiment_id = ? AND idempotency_token = ?",
                (experiment_id, idempotency_token),
            ).fetchone()
            if existing:
                db.commit()
                return AssignmentRecord(*existing)
            if requested_sequence_id is not None and requested_sequence_id not in sequence_ids:
                raise ValueError("requested sequence is not configured")
            participant_number = db.execute(
                "SELECT COALESCE(MAX(participant_number), 0) + 1 FROM assignments WHERE experiment_id = ?",
                (experiment_id,),
            ).fetchone()[0]
            replacement = requested_sequence_id is not None
            if replacement:
                replacement_attempt = db.execute(
                    "SELECT COUNT(*) + 1 FROM assignments WHERE experiment_id = ? AND schedule_version = ? AND assignment_mode = 'replacement' AND sequence_id = ?",
                    (experiment_id, schedule_version, requested_sequence_id),
                ).fetchone()[0]
                rotation_index = None
                sequence_id = requested_sequence_id
            else:
                rotation_index = db.execute(
                    "SELECT COALESCE(MAX(rotation_index), -1) + 1 FROM assignments WHERE experiment_id = ? AND schedule_version = ? AND assignment_mode = 'automatic'",
                    (experiment_id, schedule_version),
                ).fetchone()[0]
                replacement_attempt = 0
                sequence_id = sequence_ids[rotation_index % len(sequence_ids)]
            record = AssignmentRecord(
                uuid.uuid4().hex,
                experiment_id,
                idempotency_token,
                participant_number,
                sequence_id,
                schedule_version,
                "replacement" if replacement else "automatic",
                requested_sequence_id,
                replacement_attempt,
                rotation_index,
                _utc_now(),
            )
            db.execute(
                "INSERT INTO assignments(assignment_id, experiment_id, idempotency_token, participant_number, sequence_id, schedule_version, assignment_mode, requested_sequence_id, replacement_attempt, rotation_index, assigned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                tuple(record.__dict__.values()),
            )
            db.commit()
            return record

    def save_submission(
        self,
        submission: Submission,
        remote_addr: str | None,
        user_agent: str | None,
        body_sha256: str,
    ) -> StoredSubmission:
        content_sha256 = None
        if submission.submission_kind:
            self._validate_v2(submission)
            if submission.submission_kind == "trial":
                content_sha256 = hashlib.sha256(submission.encoded.encode("utf-8")).hexdigest()
            else:
                content = [(file.filename, file.data) for file in submission.files]
                content_sha256 = hashlib.sha256(json.dumps(sorted(content), ensure_ascii=False).encode("utf-8")).hexdigest()
            with _process_lock(self.data_dir / ".publication-lock.sqlite"):
                existing = self._existing_v2(submission, content_sha256)
                if existing:
                    self._reconcile_jsonl(existing.id)
                    return existing
        submission_id = uuid.uuid4().hex
        received_at = _utc_now()
        archive_key = _archive_key(submission, submission_id)
        spool_path = self.spool_dir / submission_id
        spool_path.mkdir(parents=True, exist_ok=False)

        files = []
        for index, submitted_file in enumerate(submission.files, start=1):
            file_id = f"{submission_id}-f{index:03d}"
            archive_filename = f"f{index:03d}__{submitted_file.filename}"
            file_path = spool_path / archive_filename
            _write_durable(file_path, submitted_file.data.encode("utf-8"))
            sha256 = hashlib.sha256(submitted_file.data.encode("utf-8")).hexdigest()
            files.append(
                {
                    "file_index": index,
                    "file_id": file_id,
                    "filename": submitted_file.filename,
                    "archive_filename": archive_filename,
                    "kind": submitted_file.kind,
                    "content_type": submitted_file.content_type,
                    "size_bytes": len(submitted_file.data.encode("utf-8")),
                    "sha256": sha256,
                    "local_path": str(file_path),
                    "archive_uri": None,
                    "archive_status": "pending",
                },
            )

        manifest = {
            "submission_id": submission_id,
            "experiment_id": submission.experiment_id,
            "participant_id": submission.participant_id,
            "session_id": submission.session_id,
            "archive_key": archive_key,
            "received_at": received_at,
            "files": files,
        }
        if submission.submission_kind:
            manifest.update(self._v2_metadata(submission, content_sha256))
        _write_durable(spool_path / "manifest.json", json.dumps(manifest, indent=2).encode("utf-8"))
        _sync_directory(spool_path)
        _sync_directory(self.spool_dir)
        _sync_directory(self.data_dir)

        target_results = [ArchiveTargetResult(target=name, ok=False) for name in self._archive_target_names()]
        with _process_lock(self.data_dir / ".publication-lock.sqlite"):
            if submission.submission_kind:
                existing = self._existing_v2(submission, content_sha256)
                if existing:
                    shutil.rmtree(spool_path)
                    self._reconcile_jsonl(existing.id)
                    return existing
            try:
                self._insert_submission(
                    submission_id, submission, received_at, remote_addr, user_agent,
                    len(files), body_sha256, "pending", files, target_results, content_sha256,
                )
            except sqlite3.IntegrityError as error:
                shutil.rmtree(spool_path)
                if submission.submission_kind:
                    existing = self._existing_v2(submission, content_sha256)
                    if existing:
                        self._reconcile_jsonl(existing.id)
                        return existing
                raise ValidationError("submission_conflict", "submission identity already exists") from error
            except Exception:
                shutil.rmtree(spool_path)
                raise
            index_item = {
                "id": submission_id,
                "experiment_id": submission.experiment_id,
                "participant_id": submission.participant_id,
                "session_id": submission.session_id,
                "received_at": received_at,
                "file_count": len(files),
                "archive_status": "pending",
                "archive_uri": None,
                "archive_error": None,
                "archive_targets": _target_results_payload(target_results),
                "files": files,
            }
            if submission.submission_kind:
                index_item.update(self._v2_metadata(submission, content_sha256))
            self._append_jsonl(index_item)
        if self.archive_backend is not None and self.archive_on_submit and not submission.submission_kind:
            with _process_lock(self._session_lock_path(submission.experiment_id, submission.participant_id, submission.session_id)):
                for target_name in self._archive_target_names():
                    if self._submission_target_archived(submission_id, target_name):
                        continue
                    if not spool_path.exists():
                        break
                    try:
                        result = self._archive_target(target_name, spool_path, archive_key)
                    except Exception as error:
                        result = ArchiveResult(ok=False, error=str(error) or error.__class__.__name__)
                    self._record_target_result(
                        [submission_id], ArchiveTargetResult(target=target_name,
                            ok=result.ok and bool(result.archive_uri), archive_uri=result.archive_uri, error=result.error),
                    )
                if self._submission_status(submission_id) == "archived" and self.delete_local_after_success and spool_path.exists():
                    shutil.rmtree(spool_path)
        return StoredSubmission(id=submission_id, file_count=len(files), archive_status=self._submission_status(submission_id))

    def _v2_metadata(self, submission: Submission, content_sha256: str) -> dict[str, Any]:
        return {field: getattr(submission, field) for field in ("submission_kind", *ASSIGNMENT_FIELDS, *TRIAL_FIELDS) if field != "encoded"} | {"content_sha256": content_sha256}

    def _existing_v2(self, submission: Submission, content_sha256: str) -> StoredSubmission | None:
        fields = ASSIGNMENT_FIELDS
        if submission.submission_kind == "trial":
            fields += tuple(field for field in TRIAL_FIELDS if field != "encoded")
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            existing = db.execute(
                f"SELECT id, file_count, archive_status, content_sha256, {', '.join(fields)} FROM submissions WHERE experiment_id = ? AND participant_id = ? AND session_id = ? AND submission_kind = ? AND trial_session_id IS ?",
                (submission.experiment_id, submission.participant_id, submission.session_id,
                 submission.submission_kind, submission.trial_session_id),
            ).fetchone()
        if existing is None:
            return None
        if existing[3] != content_sha256 or existing[4:] != tuple(getattr(submission, field) for field in fields):
            raise ValidationError("submission_conflict", "submission identity already has different content or metadata")
        return StoredSubmission(*existing[:3], duplicate=True)

    def _validate_v2(self, submission: Submission) -> None:
        if submission.assignment_mode == "developer":
            if (
                not submission.experiment_id.endswith("_debug")
                or submission.participant_id != "9999"
                or submission.participant_number != 9999
                or submission.assignment_id != "developer-9999"
            ):
                raise ValidationError("invalid_assignment", "developer submissions must use the isolated developer identity")
        else:
            with closing(sqlite3.connect(self.sqlite_path)) as db:
                row = db.execute(
                    "SELECT experiment_id, participant_id, participant_number, sequence_id, schedule_version, assignment_mode, requested_sequence_id, replacement_attempt, rotation_index FROM assignments WHERE assignment_id = ?",
                    (submission.assignment_id,),
                ).fetchone()
            if row is None:
                raise ValidationError("invalid_assignment", "assignment_id does not exist")
            actual = dict(zip(("experiment_id", "participant_id", *ASSIGNMENT_FIELDS[1:]), row))
            for field in ("experiment_id", *ASSIGNMENT_FIELDS[1:]):
                if getattr(submission, field) != actual[field]:
                    raise ValidationError("invalid_assignment", f"{field} differs from assignment")
            if actual["participant_id"] is not None and actual["participant_id"] != submission.participant_id:
                raise ValidationError("assignment_conflict", "assignment is bound to another participant")
        identity = {field: getattr(submission, field) for field in IDENTITY_FIELDS}
        if submission.submission_kind == "trial":
            if len(submission.files) != 1 or not submission.files[0].filename.endswith(".json"):
                raise ValidationError("invalid_trial_file", "v2 trial requires one JSON backup")
            try:
                backup = json.loads(submission.files[0].data)
            except json.JSONDecodeError as error:
                raise ValidationError("invalid_trial_file", "backup is not JSON") from error
            if not isinstance(backup, dict) or backup.get("schema") != "layouttask.backup.v2":
                raise ValidationError("invalid_trial_file", "backup schema must be layouttask.backup.v2")
            for field, expected in (identity | {field: getattr(submission, field) for field in TRIAL_FIELDS}).items():
                if backup.get(field) != expected:
                    raise ValidationError("identity_mismatch", f"backup {field} differs from submission")
            if backup.get("session") != submission.trial_session_id:
                raise ValidationError("identity_mismatch", "backup result session differs from trial_session_id")
        elif submission.submission_kind == "metadata":
            if len(submission.files) != 1 or not submission.files[0].filename.endswith(".json"):
                raise ValidationError("invalid_metadata_file", "metadata requires one JSON file")
            try:
                metadata = json.loads(submission.files[0].data)
            except json.JSONDecodeError as error:
                raise ValidationError("invalid_metadata_file", "metadata is not JSON") from error
            if not isinstance(metadata, dict) or metadata.get("schema") != "layouttask.session-metadata.v1":
                raise ValidationError("invalid_metadata_file", "unsupported session metadata schema")
            for field, expected in identity.items():
                if field not in metadata or metadata[field] != expected:
                    raise ValidationError("identity_mismatch", f"metadata {field} differs from submission")
            prolific_id = metadata.get("prolific_id")
            if not isinstance(prolific_id, str) or not prolific_id.strip():
                raise ValidationError("invalid_metadata_file", "prolific_id must be a non-empty string")
            profile = metadata.get("participant_profile")
            if (not isinstance(profile, dict)
                    or type(profile.get("participant_age")) is not int
                    or profile.get("participant_sex_assigned_at_birth") not in ("male", "female")
                    or type(profile.get("requires_corrective_eyewear")) is not bool):
                raise ValidationError("invalid_metadata_file", "participant_profile requires age, sex assigned at birth and eyewear fields")
            consent = metadata.get("consent")
            if (not isinstance(consent, dict)
                    or consent.get("consent_version") not in ("informed-consent-2026-10-03-v1", "informed-consent-2026-10-13-v2")
                    or consent.get("locale") not in ("en-US", "zh-CN")
                    or not isinstance(consent.get("consented_at"), str) or not consent["consented_at"].strip()
                    or consent.get("signature_method") != "checkbox_confirmation"
                    or any(consent.get(field) is not True for field in (
                        "voluntary_participation_confirmed", "questions_answered_confirmed",
                        "prestudy_document_confirmed", "withdrawal_right_understood_confirmed"))
                    or type(consent.get("developer_mode")) is not bool):
                raise ValidationError("invalid_metadata_file", "consent must contain the required ConsentRecord fields")
        else:
            for kind in ("_session_", "_raw_results_"):
                matches = [file for file in submission.files if kind in file.filename and file.filename.endswith(".csv")]
                if len(matches) != 1:
                    raise ValidationError("invalid_final_files", f"final requires one {kind} CSV")
                try:
                    reader = csv.DictReader(io.StringIO(matches[0].data))
                    if not reader.fieldnames or not set(identity) <= set(reader.fieldnames):
                        raise ValidationError("identity_mismatch", f"{kind} CSV lacks identity columns")
                    rows = list(reader)
                except csv.Error as error:
                    raise ValidationError("invalid_final_files", f"{kind} CSV is malformed") from error
                if kind == "_session_" and len(rows) != 1:
                    raise ValidationError("invalid_final_files", "session CSV requires one data row")
                for row in rows:
                    for field, expected in identity.items():
                        if row.get(field) != ("" if expected is None else str(expected)):
                            raise ValidationError("identity_mismatch", f"{kind} CSV {field} differs from submission")

    def finalize_session(self, experiment_id: str, participant_id: str, session_id: str) -> SessionFinalizationResult:
        """Validate the durable local session without performing cloud I/O."""
        with _process_lock(self.data_dir / ".publication-lock.sqlite"):
            return self._finalize_session_locked(experiment_id, participant_id, session_id)

    def _session_snapshot(self, experiment_id: str, participant_id: str, session_id: str):
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            db.row_factory = sqlite3.Row
            key = (experiment_id, participant_id, session_id)
            state = db.execute(
                "SELECT * FROM session_finalizations WHERE experiment_id=? AND participant_id=? AND session_id=?", key,
            ).fetchone()
            submissions = db.execute(
                "SELECT * FROM submissions WHERE experiment_id=? AND participant_id=? AND session_id=? ORDER BY received_at, id", key,
            ).fetchall()
        return state, submissions

    def _finalize_session_locked(self, experiment_id: str, participant_id: str, session_id: str) -> SessionFinalizationResult:
        state, submissions = self._session_snapshot(experiment_id, participant_id, session_id)
        if state is None:
            return SessionFinalizationResult(False, False, "needs_recovery", "pending", error="session has no finalization state")
        if (state["finalization_status"] == "complete" and state["data_complete"] == 1
                and self._validated_submission_ids(submissions, state) == {row["id"] for row in submissions}):
            return SessionFinalizationResult(True, True, "complete", state["archive_status"],
                                             final_submission_id=state["final_submission_id"], manifest_json=state["manifest_json"])
        error = self._session_completeness_error(submissions, state)
        complete = error is None
        final_submission_id = next((row["id"] for row in submissions if row["submission_kind"] == "final"), None)
        manifest_json = (json.dumps(self._session_manifest(submissions, state), ensure_ascii=False, sort_keys=True,
                                    separators=(",", ":")) if complete else state["manifest_json"])
        status = "complete" if complete else "needs_recovery" if error and "missing" in error else "incomplete"
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            db.execute(
                """UPDATE session_finalizations
                   SET finalization_status=?, data_complete=?, final_submission_id=?, manifest_json=?,
                       fallback_archive_ready=?, error=?, updated_at=?
                   WHERE experiment_id=? AND participant_id=? AND session_id=?""",
                (status, int(complete), final_submission_id, manifest_json,
                 0 if complete else state["fallback_archive_ready"], error, _utc_now(),
                 experiment_id, participant_id, session_id),
            )
            db.commit()
        return SessionFinalizationResult(complete, complete, status, state["archive_status"], error=error,
                                         final_submission_id=final_submission_id, manifest_json=manifest_json)

    def _session_completeness_error(self, submissions: list[sqlite3.Row], state: sqlite3.Row) -> str | None:
        error = self._base_completeness_error(submissions, state)
        if error:
            return error
        finals = [row for row in submissions if row["submission_kind"] == "final"]
        if len(finals) != 1:
            return "session requires exactly one final submission"
        if not self._submission_bytes_available(finals[0]["id"]):
            return f"missing local bytes for submission {finals[0]['id']}"
        raw_rows = self._final_raw_result_rows(finals[0]["id"])
        if raw_rows is None:
            return "final raw-results CSV is missing or unreadable"
        raw_indices = []
        for raw_row in raw_rows:
            if raw_row.get("trial_type") in (None, "", "formal"):
                try:
                    raw_indices.append(int(raw_row.get("trial_index", "")))
                except (TypeError, ValueError):
                    return "final raw-results CSV has invalid formal trial indices"
        expected = int(state["expected_formal_trial_count"])
        if set(raw_indices) != set(range(1, expected + 1)) or len(raw_indices) != expected:
            return "final raw-results CSV does not match accepted formal trials"
        return None

    def _base_completeness_error(self, submissions: list[sqlite3.Row], state: sqlite3.Row) -> str | None:
        if state["expected_formal_trial_count"] is None:
            return "missing expected formal trial count configuration"
        if not submissions:
            return "session has no accepted submissions"
        metadata = [row for row in submissions if row["submission_kind"] == "metadata"]
        trials = [row for row in submissions if row["submission_kind"] == "trial"]
        if len(metadata) != 1:
            return "session requires exactly one metadata submission"
        if state["tutorial_required"] and not any(row["trial_type"] == "tutorial" for row in trials):
            return "session is missing the required tutorial trial"
        formal = [row for row in trials if row["trial_type"] == "formal"]
        expected = int(state["expected_formal_trial_count"])
        if len(formal) != expected:
            return f"session has {len(formal)} formal trials; expected {expected}"
        indices = [row["trial_index"] for row in formal]
        if any(index is None for index in indices) or set(indices) != set(range(1, expected + 1)) or len(set(indices)) != expected:
            return "formal trial indices are not exactly 1..N"
        if any(not row["trial_session_id"] for row in formal) or len({row["trial_session_id"] for row in formal}) != expected:
            return "formal trial session identities are missing or repeated"
        if any(not row["presentation_id"] for row in formal) or len({row["presentation_id"] for row in formal}) != expected:
            return "formal presentation identities are missing or repeated"
        for row in (*metadata, *trials):
            if not self._submission_bytes_available(row["id"]):
                return f"missing local bytes for submission {row['id']}"
        return None

    def _submission_bytes_available(self, submission_id: str) -> bool:
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            rows = db.execute(
                "SELECT local_path, archive_status, archive_uri FROM submission_files WHERE submission_id = ?",
                (submission_id,),
            ).fetchall()
        return bool(rows) and all((path and Path(path).exists()) or (status == "archived" and uri) for path, status, uri in rows)

    def _final_raw_result_rows(self, submission_id: str) -> list[dict[str, str]] | None:
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            rows = db.execute(
                "SELECT filename, local_path FROM submission_files WHERE submission_id = ? ORDER BY file_index",
                (submission_id,),
            ).fetchall()
        raw = next(((filename, path) for filename, path in rows if "_raw_results_" in filename), None)
        if raw is None or not raw[1] or not Path(raw[1]).exists():
            return None
        try:
            with Path(raw[1]).open("r", encoding="utf-8", newline="") as handle:
                return list(csv.DictReader(handle))
        except (OSError, csv.Error):
            return None

    def _session_manifest(self, submissions: list[sqlite3.Row], state: sqlite3.Row) -> dict[str, Any]:
        return {
            "experiment_id": submissions[0]["experiment_id"],
            "participant_id": submissions[0]["participant_id"],
            "session_id": submissions[0]["session_id"],
            "schedule_version": state["schedule_version"],
            "expected_formal_trial_count": state["expected_formal_trial_count"],
            "trial_indices": sorted(row["trial_index"] for row in submissions if row["submission_kind"] == "trial" and row["trial_type"] == "formal"),
            "presentation_ids": sorted(row["presentation_id"] for row in submissions if row["submission_kind"] == "trial" and row["trial_type"] == "formal"),
            "submission_ids": [row["id"] for row in submissions],
            "content_sha256": [row["content_sha256"] for row in submissions],
            "validated_at": _utc_now(),
            "completion_source": "client_final",
        }

    def _validated_submission_ids(self, submissions: list[sqlite3.Row], state: sqlite3.Row) -> set[str]:
        manifest = json.loads(state["manifest_json"])
        if not manifest:
            if state["fallback_archive_ready"]:
                raise ValueError("fallback eligibility has no validated manifest")
            return set()
        if not isinstance(manifest, dict):
            raise ValueError("invalid validated manifest")
        for field in ("experiment_id", "participant_id", "session_id", "schedule_version", "expected_formal_trial_count"):
            if manifest.get(field) != state[field]:
                raise ValueError(f"validated manifest conflicts with {field}")
        ids, hashes = manifest.get("submission_ids"), manifest.get("content_sha256")
        if (not isinstance(ids, list) or not isinstance(hashes, list) or not ids
                or any(not isinstance(item, str) for item in ids) or len(set(ids)) != len(ids) or len(ids) != len(hashes)):
            raise ValueError("invalid validated submission whitelist")
        rows = {row["id"]: row for row in submissions}
        for submission_id, digest in zip(ids, hashes):
            if submission_id not in rows or not digest or rows[submission_id]["content_sha256"] != digest:
                raise ValueError("validated submission content binding changed")
        has_final = any(rows[submission_id]["submission_kind"] == "final" for submission_id in ids)
        if not has_final and not (state["fallback_archive_ready"] and manifest.get("completion_source") == "missing_client_final"):
            raise ValueError("raw whitelist has no fallback eligibility")
        return set(ids)

    def _archive_submission_ids_locked(self, experiment_id: str, participant_id: str, session_id: str):
        state, submissions = self._session_snapshot(experiment_id, participant_id, session_id)
        if state is None or state["legacy_archive_eligible"]:
            return submissions, {row["id"] for row in submissions}
        if any(row["submission_kind"] == "final" for row in submissions):
            try:
                self._finalize_session_locked(experiment_id, participant_id, session_id)
            except Exception as error:
                if not self._validated_submission_ids(submissions, state):
                    raise
                self._record_session_archive_error_locked((experiment_id, participant_id, session_id), error)
            state, submissions = self._session_snapshot(experiment_id, participant_id, session_id)
        elif state["manifest_json"] == "{}" and not state["fallback_archive_ready"]:
            if (not state["final_wait_started_at"] or not self.schedule_version
                    or state["schedule_version"] != self.schedule_version
                    or state["expected_formal_trial_count"] != self.expected_formal_trial_count
                    or state["tutorial_required"] != int(self.require_tutorial)):
                return submissions, set()
            started = datetime.fromisoformat(state["final_wait_started_at"])
            if started.tzinfo is None:
                raise ValueError("final wait origin must include a timezone")
            if (datetime.fromisoformat(_utc_now()) - started).total_seconds() < FINAL_WAIT_SECONDS:
                return submissions, set()
            error = self._base_completeness_error(submissions, state)
            if error:
                raise ValueError(error)
            last = next(row for row in submissions if row["trial_type"] == "formal"
                        and row["trial_index"] == state["expected_formal_trial_count"])
            manifest = self._session_manifest(submissions, state)
            manifest.update(completion_source="missing_client_final", last_formal_submission_id=last["id"],
                            final_wait_started_at=state["final_wait_started_at"])
            with closing(sqlite3.connect(self.sqlite_path)) as db:
                db.execute(
                    """UPDATE session_finalizations SET fallback_archive_ready=1, manifest_json=?,
                       finalization_status='needs_recovery', error='client final missing after wait', updated_at=?
                       WHERE experiment_id=? AND participant_id=? AND session_id=?""",
                    (json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")), _utc_now(),
                     experiment_id, participant_id, session_id),
                )
                db.commit()
            state, submissions = self._session_snapshot(experiment_id, participant_id, session_id)
        return submissions, self._validated_submission_ids(submissions, state)

    def queue_archive(self, experiment_id: str, participant_id: str, session_id: str) -> SessionArchiveResult:
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            state = db.execute(
                "SELECT finalization_status, data_complete, archive_status, legacy_archive_eligible FROM session_finalizations WHERE experiment_id = ? AND participant_id = ? AND session_id = ?",
                (experiment_id, participant_id, session_id),
            ).fetchone()
        if state and not state[3]:
            finalization = self.finalize_session(experiment_id, participant_id, session_id)
            if not finalization.data_complete:
                return SessionArchiveResult(
                    False, finalization.finalization_status, error=finalization.error,
                    data_complete=False, finalization_status=finalization.finalization_status,
                )
            return SessionArchiveResult(
                True, finalization.archive_status, archive_uri=self._session_archive_uri(experiment_id, participant_id, session_id),
                already_archived=finalization.archive_status == "archived", data_complete=True,
                finalization_status="complete",
            )

        # Legacy v1 rows keep the old queue contract and remain recoverable after migration.
        with closing(sqlite3.connect(self.sqlite_path, timeout=30)) as db:
            rows = db.execute(
                "SELECT archive_status FROM submissions WHERE experiment_id = ? AND participant_id = ? AND session_id = ?",
                (experiment_id, participant_id, session_id),
            ).fetchall()
        if not rows:
            return SessionArchiveResult(False, "missing", error="session has no accepted submissions")
        if all(status == "archived" for (status,) in rows):
            return SessionArchiveResult(True, "archived", archive_uri=self._session_archive_uri(experiment_id, participant_id, session_id), already_archived=True)
        if self.archive_backend is None:
            return SessionArchiveResult(False, "pending", error="archive backend is disabled")
        return SessionArchiveResult(True, "queued")

    def archive_session(self, experiment_id: str, participant_id: str, session_id: str) -> SessionArchiveResult:
        """Archive each outstanding submission for each target in one session."""
        with _process_lock(self._session_lock_path(experiment_id, participant_id, session_id)):
            return self._archive_session_locked(experiment_id, participant_id, session_id)

    def _archive_session_locked(self, experiment_id: str, participant_id: str, session_id: str) -> SessionArchiveResult:
        with _process_lock(self.data_dir / ".publication-lock.sqlite"):
            with closing(sqlite3.connect(self.sqlite_path)) as db:
                rows = db.execute(
                    "SELECT id FROM submissions WHERE experiment_id = ? AND participant_id = ? AND session_id = ? ORDER BY received_at",
                    (experiment_id, participant_id, session_id),
                ).fetchall()

            if not rows:
                return SessionArchiveResult(False, "missing", error="session has no accepted submissions")
            if all(self._submission_status(submission_id) == "archived" for (submission_id,) in rows):
                archive_uri = self._session_archive_uri(experiment_id, participant_id, session_id)
                return SessionArchiveResult(True, "archived", archive_uri=archive_uri, already_archived=True)
            if self.archive_backend is None:
                return SessionArchiveResult(False, "pending", error="archive backend is disabled")

        archive_key = f"{experiment_id}/{participant_id}/{session_id}"
        for target_name in self._archive_target_names():
            for (submission_id,) in rows:
                if self._submission_target_archived(submission_id, target_name):
                    continue
                spool_dir = self.spool_dir / submission_id
                if not spool_dir.exists():
                    return SessionArchiveResult(False, "failed", error=f"missing spool for submission {submission_id}")
                try:
                    result = self._archive_target(target_name, spool_dir, f"{archive_key}/{submission_id}")
                except Exception as error:
                    result = ArchiveResult(ok=False, error=str(error) or error.__class__.__name__)
                self._record_target_result(
                    [submission_id],
                    ArchiveTargetResult(
                        target=target_name,
                        ok=result.ok and bool(result.archive_uri),
                        archive_uri=result.archive_uri,
                        error=result.error,
                    ),
                )

        submission_ids = {row[0] for row in rows}
        if all(self._submission_status(submission_id) == "archived" for submission_id in submission_ids):
            for submission_id in submission_ids:
                spool_path = self.spool_dir / submission_id
                if self.delete_local_after_success and spool_path.exists():
                    shutil.rmtree(spool_path)

        # Publication can accept more session rows during archive I/O; report the current snapshot.
        with _process_lock(self.data_dir / ".publication-lock.sqlite"):
            with closing(sqlite3.connect(self.sqlite_path)) as db:
                current_rows = db.execute(
                    "SELECT id, archive_status FROM submissions WHERE experiment_id = ? AND participant_id = ? AND session_id = ? ORDER BY received_at",
                    (experiment_id, participant_id, session_id),
                ).fetchall()
            statuses = [status for _submission_id, status in current_rows]
            archive_uri = self._session_archive_uri(experiment_id, participant_id, session_id)
            if all(status == "archived" for status in statuses):
                return SessionArchiveResult(True, "archived", archive_uri=archive_uri)
            if any(status in {"partial", "archived"} for status in statuses):
                status = "partial"
            elif all(status == "pending" for status in statuses):
                status = "pending"
            else:
                status = "failed"
            error = "one or more archive targets failed"
            if any(submission_id not in submission_ids for submission_id, _status in current_rows):
                error = "session has pending submissions; retry archive to include them"
            return SessionArchiveResult(False, status, archive_uri=archive_uri, error=error)

    def _submission_status(self, submission_id: str) -> str:
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            row = db.execute("SELECT archive_status FROM submissions WHERE id = ?", (submission_id,)).fetchone()
        return row[0] if row else "missing"

    def _session_archive_uri(self, experiment_id: str, participant_id: str, session_id: str) -> str | None:
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            row = db.execute(
                "SELECT archive_uri FROM submission_files WHERE archive_status = 'archived' AND submission_id IN (SELECT id FROM submissions WHERE experiment_id = ? AND participant_id = ? AND session_id = ?) LIMIT 1",
                (experiment_id, participant_id, session_id),
            ).fetchone()
        if not row or not row[0]:
            return None
        return row[0].rsplit("/", 2)[0]

    def retry_pending(self) -> int:
        # Only leftover spool can identify unfinished finalization; archived history stays untouched.
        for spool_path in self.spool_dir.glob("*"):
            with closing(sqlite3.connect(self.sqlite_path)) as db:
                session = db.execute(
                    "SELECT experiment_id, participant_id, session_id FROM submissions WHERE id = ? AND archive_status = 'archived'",
                    (spool_path.name,),
                ).fetchone()
            if session is None:
                continue
            try:
                with _process_lock(self._session_lock_path(*session)):
                    with _process_lock(self.data_dir / ".publication-lock.sqlite"):
                        if not spool_path.is_dir() or self._submission_status(spool_path.name) != "archived":
                            continue
                        target_results = self._archive_target_rows(spool_path.name)
                        if _aggregate_archive_status(target_results) != "archived":
                            continue
                        self._update_jsonl_submission(spool_path.name, "archived", _first_archive_uri(target_results),
                                                      _archive_error(target_results), target_results)
                        if self.delete_local_after_success:
                            shutil.rmtree(spool_path)
            except Exception as error:
                self._record_session_archive_error(session, error)
        if self.archive_backend is None:
            return 0
        with _process_lock(self.data_dir / ".publication-lock.sqlite"):
            with closing(sqlite3.connect(self.sqlite_path)) as db:
                sessions = db.execute(
                    """
                    SELECT DISTINCT s.experiment_id, s.participant_id, s.session_id
                    FROM submissions AS s
                    LEFT JOIN session_finalizations AS f
                      ON f.experiment_id = s.experiment_id
                     AND f.participant_id = s.participant_id
                     AND f.session_id = s.session_id
                    WHERE s.archive_status IN ('pending', 'failed', 'partial')
                      AND (s.submission_kind IS NULL OR f.legacy_archive_eligible = 1 OR f.data_complete = 1
                           OR f.final_wait_started_at IS NOT NULL OR f.manifest_json != '{}'
                           OR EXISTS (SELECT 1 FROM submissions AS final
                                      WHERE final.experiment_id=s.experiment_id AND final.participant_id=s.participant_id
                                        AND final.session_id=s.session_id AND final.submission_kind='final'))
                    """
                ).fetchall()
        retried = 0
        for experiment_id, participant_id, session_id in sessions:
            try:
                with _process_lock(self._session_lock_path(experiment_id, participant_id, session_id)):
                    retried += self._retry_session_locked(experiment_id, participant_id, session_id)
            except Exception as error:
                self._record_session_archive_error((experiment_id, participant_id, session_id), error)
        return retried

    def _record_session_archive_error(self, key, error: Exception) -> None:
        with _process_lock(self.data_dir / ".publication-lock.sqlite"):
            self._record_session_archive_error_locked(key, error)

    def _record_session_archive_error_locked(self, key, error: Exception) -> None:
        print(f"archive_session_error: {key!r}: {type(error).__name__}: {error}", file=sys.stderr)
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            db.execute(
                "UPDATE session_finalizations SET error=?, updated_at=? WHERE experiment_id=? AND participant_id=? AND session_id=?",
                (str(error), _utc_now(), *key),
            )
            db.commit()

    def _retry_session_locked(self, experiment_id: str, participant_id: str, session_id: str) -> int:
        with _process_lock(self.data_dir / ".publication-lock.sqlite"):
            submissions, allowed = self._archive_submission_ids_locked(experiment_id, participant_id, session_id)
            rows = [row for row in submissions if row["id"] in allowed and row["archive_status"] in {"pending", "failed", "partial"}]

        retried = 0
        failed_targets: set[str] = set()
        for row in rows:
            submission_id = row["id"]
            spool_path = self.spool_dir / submission_id
            target_names = self._ensure_archive_target_rows(submission_id)
            if not spool_path.exists():
                for target_name in target_names:
                    if not self._submission_target_archived(submission_id, target_name):
                        self._record_target_result([submission_id], ArchiveTargetResult(
                            target=target_name, ok=False, error=f"missing spool for submission {submission_id}"))
                continue
            archive_key = f"{experiment_id}/{participant_id}/{session_id}/{submission_id}"
            before = self._submission_status(submission_id)
            for target_name in target_names:
                if target_name in failed_targets or self._submission_target_archived(submission_id, target_name):
                    continue
                try:
                    result = self._archive_target(target_name, spool_path, archive_key)
                except Exception as error:
                    result = ArchiveResult(ok=False, error=str(error) or error.__class__.__name__)
                self._record_target_result(
                    [submission_id],
                    ArchiveTargetResult(
                        target=target_name,
                        ok=result.ok and bool(result.archive_uri),
                        archive_uri=result.archive_uri,
                        error=result.error,
                    ),
                )
                if not result.ok or not result.archive_uri:
                    failed_targets.add(target_name)

            self._sync_submission_state(submission_id)
            self._sync_finalization_archive_status(experiment_id, participant_id, session_id)
            after = self._submission_status(submission_id)
            if after == "archived":
                if self.delete_local_after_success and spool_path.exists():
                    shutil.rmtree(spool_path)
                if before != "archived":
                    retried += 1
        return retried

    def _sync_finalization_archive_status(self, experiment_id: str, participant_id: str, session_id: str) -> None:
        with _process_lock(self.data_dir / ".publication-lock.sqlite"):
            with closing(sqlite3.connect(self.sqlite_path)) as db:
                self._update_finalization_archive_status(db, experiment_id, participant_id, session_id)
                db.commit()

    def _update_finalization_archive_status(self, db, experiment_id: str, participant_id: str, session_id: str) -> None:
        rows = db.execute(
                "SELECT archive_status FROM submissions WHERE experiment_id = ? AND participant_id = ? AND session_id = ?",
                (experiment_id, participant_id, session_id),
        ).fetchall()
        state = db.execute(
                "SELECT data_complete, archive_status FROM session_finalizations WHERE experiment_id = ? AND participant_id = ? AND session_id = ?",
                (experiment_id, participant_id, session_id),
        ).fetchone()
        if not state or not rows:
            return
        statuses = [row[0] for row in rows]
        if all(status == "archived" for status in statuses):
            archive_status = "archived"
        elif any(status in {"archived", "partial"} for status in statuses):
            archive_status = "partial"
        elif any(status == "failed" for status in statuses):
            archive_status = "failed"
        else:
            archive_status = "pending"
        db.execute(
                "UPDATE session_finalizations SET archive_status = ?, updated_at = ? WHERE experiment_id = ? AND participant_id = ? AND session_id = ?",
                (archive_status, _utc_now(), experiment_id, participant_id, session_id),
        )

    def _session_lock_path(self, experiment_id: str, participant_id: str, session_id: str) -> Path:
        identity = json.dumps([experiment_id, participant_id, session_id], ensure_ascii=False, separators=(",", ":"))
        digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()
        return self.data_dir / f".session-{digest}.lock.sqlite"

    def archive_metadata(self, label: str | None = None, keep_local: int = 3) -> MetadataArchiveResult:
        pending = self._pending_metadata_archives()
        if pending:
            return self._retry_metadata_archive(*pending[0], keep_local=keep_local)

        name = _metadata_archive_name(label)
        target = self.data_dir / "metadata_archives" / name
        target.mkdir(parents=True, exist_ok=False)
        if self.sqlite_path.exists():
            shutil.copy2(self.sqlite_path, target / "submissions.sqlite")
        else:
            (target / "submissions.sqlite").write_bytes(b"")
        if self.jsonl_path.exists():
            shutil.copy2(self.jsonl_path, target / "submissions.jsonl")
        else:
            (target / "submissions.jsonl").write_text("", encoding="utf-8")

        uploaded_uri = None
        local_kept = True
        if self.metadata_archive_backend is not None:
            try:
                result: ArchiveResult = self.metadata_archive_backend.archive(target, name)
            except Exception as error:
                result = ArchiveResult(ok=False, error=str(error) or error.__class__.__name__)
            target_results = self._target_results(result)
            if _aggregate_archive_status(target_results) != "archived":
                self._write_metadata_archive_state(name, target_results)
                self._prune_metadata_archives(keep_local, protected={name})
                return MetadataArchiveResult(local_path=target, uploaded_uri=None, local_kept=True)
            uploaded_uri = _first_archive_uri(target_results)
            if self.metadata_delete_local_after_upload:
                shutil.rmtree(target)
                local_kept = False

        self._reset_metadata()
        self._prune_metadata_archives(keep_local)
        return MetadataArchiveResult(local_path=target, uploaded_uri=uploaded_uri, local_kept=local_kept)

    def _pending_metadata_archives(self) -> list[tuple[str, Path, list[ArchiveTargetResult]]]:
        root = self.data_dir / "metadata_archives"
        if not root.exists():
            return []
        pending = []
        for state_path in sorted(root.glob(".pending-*.json")):
            name = state_path.name[len(".pending-") : -len(".json")]
            target = root / name
            if not name or not target.is_dir():
                continue
            try:
                payload = json.loads(state_path.read_text(encoding="utf-8"))
                results = [ArchiveTargetResult(**item) for item in payload["targets"]]
            except (OSError, ValueError, KeyError, TypeError):
                continue
            pending.append((name, target, results))
        return pending

    def _retry_metadata_archive(
        self,
        name: str,
        target: Path,
        target_results: list[ArchiveTargetResult],
        keep_local: int,
    ) -> MetadataArchiveResult:
        if self.metadata_archive_backend is None:
            return MetadataArchiveResult(local_path=target, uploaded_uri=None, local_kept=True)
        updated = []
        for previous in target_results:
            if previous.ok:
                updated.append(previous)
                continue
            try:
                result = self._archive_target(
                    previous.target,
                    target,
                    name,
                    backend=self.metadata_archive_backend,
                )
            except Exception as error:
                result = ArchiveResult(ok=False, error=str(error) or error.__class__.__name__)
            updated.append(
                ArchiveTargetResult(
                    target=previous.target,
                    ok=result.ok and bool(result.archive_uri),
                    archive_uri=result.archive_uri,
                    error=result.error,
                ),
            )
        state_path = target.parent / f".pending-{name}.json"
        if _aggregate_archive_status(updated) != "archived":
            self._write_metadata_archive_state(name, updated)
            self._prune_metadata_archives(keep_local, protected={name})
            return MetadataArchiveResult(local_path=target, uploaded_uri=None, local_kept=True)

        state_path.unlink(missing_ok=True)
        uploaded_uri = _first_archive_uri(updated)
        metadata_unchanged = self._metadata_matches_snapshot(target)
        local_kept = True
        if self.metadata_delete_local_after_upload:
            shutil.rmtree(target)
            local_kept = False
        if metadata_unchanged:
            self._reset_metadata()
        self._prune_metadata_archives(keep_local)
        return MetadataArchiveResult(local_path=target, uploaded_uri=uploaded_uri, local_kept=local_kept)

    def _metadata_matches_snapshot(self, snapshot_dir: Path) -> bool:
        for filename, active_path in (
            ("submissions.sqlite", self.sqlite_path),
            ("submissions.jsonl", self.jsonl_path),
        ):
            snapshot_path = snapshot_dir / filename
            try:
                if active_path.read_bytes() != snapshot_path.read_bytes():
                    return False
            except OSError:
                return False
        return True

    def _write_metadata_archive_state(self, name: str, results: list[ArchiveTargetResult]) -> None:
        root = self.data_dir / "metadata_archives"
        state_path = root / f".pending-{name}.json"
        temp_path = state_path.with_suffix(".tmp")
        payload = {"snapshot": name, "targets": _target_results_payload(results)}
        temp_path.write_text(json.dumps(payload, sort_keys=True), encoding="utf-8")
        temp_path.replace(state_path)

    def clear_data(self) -> None:
        if self.spool_dir.exists():
            shutil.rmtree(self.spool_dir)
        local_archive = self.data_dir / "archive"
        if local_archive.exists():
            shutil.rmtree(local_archive)
        self._reset_metadata()

    def _init_schema(self) -> None:
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS submissions(
                  id TEXT PRIMARY KEY,
                  experiment_id TEXT NOT NULL,
                  participant_id TEXT NOT NULL,
                  session_id TEXT NOT NULL,
                  received_at TEXT NOT NULL,
                  remote_addr TEXT,
                  user_agent TEXT,
                  file_count INTEGER NOT NULL,
                  status TEXT NOT NULL,
                  body_sha256 TEXT NOT NULL,
                  archive_status TEXT NOT NULL
                )
                """,
            )
            submission_columns = {row[1] for row in db.execute("PRAGMA table_info(submissions)")}
            for column, sql_type in {"submission_kind": "TEXT", "assignment_id": "TEXT",
                                     "participant_number": "INTEGER", "sequence_id": "TEXT",
                                     "schedule_version": "TEXT", "assignment_mode": "TEXT",
                                     "requested_sequence_id": "TEXT", "replacement_attempt": "INTEGER",
                                     "rotation_index": "INTEGER", "trial_session_id": "TEXT",
                                     "trial_type": "TEXT", "trial_index": "INTEGER", "task_id": "TEXT",
                                     "qid": "TEXT", "presentation_id": "TEXT", "hash8": "TEXT",
                                     "encoding": "TEXT", "content_sha256": "TEXT"}.items():
                if column not in submission_columns:
                    db.execute(f"ALTER TABLE submissions ADD COLUMN {column} {sql_type}")
            db.execute("CREATE UNIQUE INDEX IF NOT EXISTS v2_trial_identity ON submissions(experiment_id, participant_id, session_id, trial_session_id) WHERE submission_kind = 'trial'")
            db.execute("CREATE UNIQUE INDEX IF NOT EXISTS v2_final_identity ON submissions(experiment_id, participant_id, session_id) WHERE submission_kind = 'final'")
            db.execute("CREATE UNIQUE INDEX IF NOT EXISTS v2_metadata_identity ON submissions(experiment_id, participant_id, session_id) WHERE submission_kind = 'metadata'")
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS submission_files(
                  id TEXT PRIMARY KEY,
                  submission_id TEXT NOT NULL,
                  file_index INTEGER NOT NULL,
                  file_id TEXT NOT NULL UNIQUE,
                  filename TEXT NOT NULL,
                  archive_filename TEXT NOT NULL,
                  kind TEXT NOT NULL,
                  content_type TEXT,
                  size_bytes INTEGER NOT NULL,
                  sha256 TEXT NOT NULL,
                  local_path TEXT,
                  archive_uri TEXT,
                  archive_status TEXT NOT NULL,
                  FOREIGN KEY(submission_id) REFERENCES submissions(id)
                )
                """,
            )
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS receiver_logs(
                  id TEXT PRIMARY KEY,
                  submission_id TEXT,
                  level TEXT NOT NULL,
                  message TEXT NOT NULL,
                  detail_json TEXT,
                  created_at TEXT NOT NULL,
                  FOREIGN KEY(submission_id) REFERENCES submissions(id)
                )
                """,
            )
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS archive_targets(
                  submission_id TEXT NOT NULL,
                  target_name TEXT NOT NULL,
                  archive_uri TEXT,
                  archive_status TEXT NOT NULL,
                  error TEXT,
                  updated_at TEXT NOT NULL,
                  PRIMARY KEY(submission_id, target_name),
                  FOREIGN KEY(submission_id) REFERENCES submissions(id)
                )
                """,
            )
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS assignments(
                  assignment_id TEXT PRIMARY KEY,
                  experiment_id TEXT NOT NULL,
                  idempotency_token TEXT NOT NULL,
                  participant_number INTEGER NOT NULL,
                  sequence_id TEXT NOT NULL,
                  schedule_version TEXT NOT NULL,
                  assigned_at TEXT NOT NULL,
                  UNIQUE(experiment_id, idempotency_token),
                  UNIQUE(experiment_id, participant_number)
                )
                """,
            )
            assignment_columns = {row[1] for row in db.execute("PRAGMA table_info(assignments)")}
            for column, statement in {
                "participant_id": "ALTER TABLE assignments ADD COLUMN participant_id TEXT",
                "assignment_mode": "ALTER TABLE assignments ADD COLUMN assignment_mode TEXT",
                "requested_sequence_id": "ALTER TABLE assignments ADD COLUMN requested_sequence_id TEXT",
                "replacement_attempt": "ALTER TABLE assignments ADD COLUMN replacement_attempt INTEGER",
                "rotation_index": "ALTER TABLE assignments ADD COLUMN rotation_index INTEGER",
            }.items():
                if column not in assignment_columns:
                    db.execute(statement)
            db.execute("UPDATE assignments SET assignment_mode = 'automatic' WHERE assignment_mode IS NULL")
            db.execute("UPDATE assignments SET replacement_attempt = 0 WHERE replacement_attempt IS NULL")
            for (experiment_id,) in db.execute("SELECT DISTINCT experiment_id FROM assignments WHERE rotation_index IS NULL AND assignment_mode = 'automatic'"):
                rows = db.execute(
                    "SELECT assignment_id FROM assignments WHERE experiment_id = ? AND assignment_mode = 'automatic' ORDER BY participant_number",
                    (experiment_id,),
                ).fetchall()
                for index, (assignment_id,) in enumerate(rows):
                    db.execute("UPDATE assignments SET rotation_index = ? WHERE assignment_id = ? AND rotation_index IS NULL", (index, assignment_id))
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS session_finalizations(
                  experiment_id TEXT NOT NULL,
                  participant_id TEXT NOT NULL,
                  session_id TEXT NOT NULL,
                  schedule_version TEXT,
                  finalization_status TEXT NOT NULL,
                  data_complete INTEGER NOT NULL,
                  archive_status TEXT NOT NULL,
                  expected_formal_trial_count INTEGER,
                  tutorial_required INTEGER NOT NULL,
                  legacy_archive_eligible INTEGER NOT NULL DEFAULT 0,
                  final_submission_id TEXT,
                  manifest_json TEXT NOT NULL,
                  error TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  PRIMARY KEY(experiment_id, participant_id, session_id)
                )
                """,
            )
            db.execute(
                "CREATE INDEX IF NOT EXISTS session_finalizations_archive_idx ON session_finalizations(data_complete, archive_status, legacy_archive_eligible)"
            )
            finalization_columns = {row[1] for row in db.execute("PRAGMA table_info(session_finalizations)")}
            for column, declaration in {
                "final_wait_started_at": "TEXT",
                "fallback_archive_ready": "INTEGER NOT NULL DEFAULT 0",
            }.items():
                if column not in finalization_columns:
                    db.execute(f"ALTER TABLE session_finalizations ADD COLUMN {column} {declaration}")
            # Existing rows predate the finalization gate and remain recoverable through the explicit legacy path.
            db.execute(
                """
                INSERT OR IGNORE INTO session_finalizations(
                  experiment_id, participant_id, session_id, schedule_version,
                  finalization_status, data_complete, archive_status,
                  expected_formal_trial_count, tutorial_required,
                  legacy_archive_eligible, final_submission_id, manifest_json,
                  error, created_at, updated_at
                )
                SELECT experiment_id, participant_id, session_id, MAX(schedule_version),
                       'collecting', 0, 'pending', NULL, 0, 1, NULL, '{}', NULL,
                       MIN(received_at), MAX(received_at)
                FROM submissions
                GROUP BY experiment_id, participant_id, session_id
                """,
            )
            if self.expected_formal_trial_count is not None and self.schedule_version:
                db.execute(
                    """
                    UPDATE session_finalizations
                    SET expected_formal_trial_count = ?, tutorial_required = ?, updated_at = ?
                    WHERE legacy_archive_eligible = 0
                      AND finalization_status != 'complete'
                      AND expected_formal_trial_count IS NULL
                      AND schedule_version = ?
                    """,
                    (
                        self.expected_formal_trial_count,
                        1 if self.require_tutorial else 0,
                        _utc_now(),
                        self.schedule_version,
                    ),
                )
            db.commit()
        self.jsonl_path.touch(exist_ok=True)

    def _insert_submission(
        self,
        submission_id: str,
        submission: Submission,
        received_at: str,
        remote_addr: str | None,
        user_agent: str | None,
        file_count: int,
        body_sha256: str,
        archive_status: str,
        files: list[dict[str, Any]],
        target_results: list[ArchiveTargetResult],
        content_sha256: str | None,
    ) -> None:
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            if submission.submission_kind:
                db.execute("BEGIN IMMEDIATE")
                session_assignments = db.execute(
                    f"SELECT DISTINCT {', '.join(ASSIGNMENT_FIELDS)} FROM submissions WHERE experiment_id = ? AND participant_id = ? AND session_id = ? AND submission_kind IS NOT NULL",
                    (submission.experiment_id, submission.participant_id, submission.session_id),
                ).fetchall()
                assignment = tuple(getattr(submission, field) for field in ASSIGNMENT_FIELDS)
                if any(existing != assignment for existing in session_assignments):
                    raise ValidationError("submission_conflict", "session already has a different assignment")
                if submission.assignment_mode != "developer":
                    cursor = db.execute(
                        "UPDATE assignments SET participant_id = ? WHERE assignment_id = ? AND (participant_id IS NULL OR participant_id = ?)",
                        (submission.participant_id, submission.assignment_id, submission.participant_id),
                    )
                    if cursor.rowcount != 1:
                        raise ValidationError("assignment_conflict", "assignment is bound to another participant")
            db.execute(
                """
                INSERT INTO submissions(
                  id, experiment_id, participant_id, session_id, received_at,
                  remote_addr, user_agent, file_count, status, body_sha256, archive_status,
                  submission_kind, assignment_id, participant_number, sequence_id, schedule_version,
                  assignment_mode, requested_sequence_id, replacement_attempt, rotation_index,
                  trial_session_id, trial_type, trial_index, task_id, qid, presentation_id,
                  hash8, encoding, content_sha256
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    submission_id,
                    submission.experiment_id,
                    submission.participant_id,
                    submission.session_id,
                    received_at,
                    remote_addr,
                    user_agent,
                    file_count,
                    "accepted",
                    body_sha256,
                    archive_status,
                    submission.submission_kind,
                    submission.assignment_id,
                    submission.participant_number,
                    submission.sequence_id,
                    submission.schedule_version,
                    submission.assignment_mode,
                    submission.requested_sequence_id,
                    submission.replacement_attempt,
                    submission.rotation_index,
                    submission.trial_session_id,
                    submission.trial_type,
                    submission.trial_index,
                    submission.task_id,
                    submission.qid,
                    submission.presentation_id,
                    submission.hash8,
                    submission.encoding,
                    content_sha256,
                ),
            )
            for file_info in files:
                db.execute(
                    """
                    INSERT INTO submission_files(
                      id, submission_id, file_index, file_id, filename, archive_filename,
                      kind, content_type, size_bytes, sha256, local_path, archive_uri, archive_status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        uuid.uuid4().hex,
                        submission_id,
                        file_info["file_index"],
                        file_info["file_id"],
                        file_info["filename"],
                        file_info["archive_filename"],
                        file_info["kind"],
                        file_info["content_type"],
                        file_info["size_bytes"],
                        file_info["sha256"],
                        file_info["local_path"],
                        file_info["archive_uri"],
                        file_info["archive_status"],
                    ),
                )
            for target_result in target_results:
                db.execute(
                    """
                    INSERT INTO archive_targets(
                      submission_id, target_name, archive_uri, archive_status, error, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        submission_id,
                        target_result.target,
                        target_result.archive_uri,
                        "archived" if target_result.ok else "pending" if target_result.error is None else "failed",
                        target_result.error,
                        _utc_now(),
                    ),
                )
            if submission.submission_kind:
                db.execute(
                    """
                    INSERT INTO session_finalizations(
                      experiment_id, participant_id, session_id, schedule_version,
                      finalization_status, data_complete, archive_status,
                      expected_formal_trial_count, tutorial_required,
                      legacy_archive_eligible, final_submission_id, manifest_json,
                      error, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, 'collecting', 0, 'pending', ?, ?, 0, NULL, '{}', NULL, ?, ?)
                    ON CONFLICT(experiment_id, participant_id, session_id) DO UPDATE SET
                      updated_at = excluded.updated_at, data_complete = 0, finalization_status = 'collecting'
                    """,
                    (
                        submission.experiment_id,
                        submission.participant_id,
                        submission.session_id,
                        submission.schedule_version,
                        self.expected_formal_trial_count if submission.schedule_version == self.schedule_version else None,
                        1 if self.require_tutorial else 0,
                        _utc_now(),
                        _utc_now(),
                    ),
                )
                if (submission.submission_kind == "trial" and submission.trial_type == "formal"
                        and self.schedule_version and submission.schedule_version == self.schedule_version
                        and self.expected_formal_trial_count is not None
                        and submission.trial_index == self.expected_formal_trial_count):
                    db.execute(
                        """UPDATE session_finalizations
                           SET final_wait_started_at = COALESCE(final_wait_started_at, ?)
                           WHERE experiment_id = ? AND participant_id = ? AND session_id = ?
                             AND schedule_version = ? AND expected_formal_trial_count = ? AND tutorial_required = ?""",
                        (_utc_now(), submission.experiment_id, submission.participant_id, submission.session_id,
                         self.schedule_version, self.expected_formal_trial_count, int(self.require_tutorial)),
                    )
                self._update_finalization_archive_status(db, submission.experiment_id, submission.participant_id, submission.session_id)
            db.commit()

    def _archive_target_names(self) -> tuple[str, ...]:
        if self.archive_backend is None:
            return ()
        names = getattr(self.archive_backend, "target_names", None)
        if names:
            return tuple(names)
        return ("primary",)

    def _target_results(self, result: ArchiveResult) -> list[ArchiveTargetResult]:
        if result.target_results:
            return list(result.target_results)
        return [
            ArchiveTargetResult(
                target="primary",
                ok=result.ok and bool(result.archive_uri),
                archive_uri=result.archive_uri,
                error=result.error,
            ),
        ]

    def _archive_target(
        self,
        target_name: str,
        spool_dir: Path,
        archive_key: str,
        backend: Any = None,
    ) -> ArchiveResult:
        backend = self.archive_backend if backend is None else backend
        archive_target = getattr(backend, "archive_target", None)
        if archive_target is not None:
            return archive_target(target_name, spool_dir, archive_key)
        return backend.archive(spool_dir, archive_key)

    def _ensure_archive_target_rows(self, submission_id: str) -> tuple[str, ...]:
        target_names = self._archive_target_names()
        if not target_names:
            return ()
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            for target_name in target_names:
                db.execute(
                    """
                    INSERT OR IGNORE INTO archive_targets(
                      submission_id, target_name, archive_uri, archive_status, error, updated_at
                    )
                    VALUES (?, ?, NULL, 'pending', NULL, ?)
                    """,
                    (submission_id, target_name, _utc_now()),
                )
            db.commit()
        return target_names

    def _submission_target_archived(self, submission_id: str, target_name: str) -> bool:
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            row = db.execute(
                "SELECT archive_status FROM archive_targets WHERE submission_id = ? AND target_name = ?",
                (submission_id, target_name),
            ).fetchone()
        return bool(row and row[0] == "archived")

    def _record_target_result(
        self,
        submission_ids: list[str],
        target_result: ArchiveTargetResult,
    ) -> None:
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            for submission_id in submission_ids:
                archive_uri = target_result.archive_uri
                db.execute(
                    """
                    INSERT INTO archive_targets(
                      submission_id, target_name, archive_uri, archive_status, error, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(submission_id, target_name) DO UPDATE SET
                      archive_uri = excluded.archive_uri,
                      archive_status = excluded.archive_status,
                      error = excluded.error,
                      updated_at = excluded.updated_at
                    """,
                    (
                        submission_id,
                        target_result.target,
                        archive_uri,
                        "archived" if target_result.ok else "failed",
                        target_result.error,
                        _utc_now(),
                    ),
                )
            db.commit()
        for submission_id in submission_ids:
            self._sync_submission_state(submission_id)

    def _archive_target_rows(self, submission_id: str) -> list[ArchiveTargetResult]:
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            rows = db.execute(
                """
                SELECT target_name, archive_uri, archive_status, error
                FROM archive_targets
                WHERE submission_id = ?
                ORDER BY target_name
                """,
                (submission_id,),
            ).fetchall()
        return [
            ArchiveTargetResult(
                target=target_name,
                ok=status == "archived",
                archive_uri=archive_uri,
                error=error,
            )
            for target_name, archive_uri, status, error in rows
        ]

    def _sync_submission_state(self, submission_id: str) -> None:
        target_results = self._archive_target_rows(submission_id)
        if not target_results:
            return
        archive_status = _aggregate_archive_status(target_results)
        archive_uri = _first_archive_uri(target_results)
        archive_error = _archive_error(target_results)
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            db.execute(
                "UPDATE submissions SET archive_status = ? WHERE id = ?",
                (archive_status, submission_id),
            )
            file_rows = db.execute(
                "SELECT id, archive_filename FROM submission_files WHERE submission_id = ? ORDER BY file_index",
                (submission_id,),
            ).fetchall()
            for file_row_id, archive_filename in file_rows:
                db.execute(
                    """
                    UPDATE submission_files
                    SET archive_status = ?, archive_uri = ?, local_path = ?
                    WHERE id = ?
                    """,
                    (
                        archive_status,
                        f"{archive_uri.rstrip('/')}/{archive_filename}" if archive_uri else None,
                        None
                        if archive_status == "archived" and self.delete_local_after_success
                        else str(self.spool_dir / submission_id / archive_filename),
                        file_row_id,
                    ),
                )
            db.commit()
        self._update_jsonl_submission(submission_id, archive_status, archive_uri, archive_error, target_results)

    def _update_jsonl_submission(
        self,
        submission_id: str,
        archive_status: str,
        archive_uri: str | None,
        archive_error: str | None,
        target_results: list[ArchiveTargetResult],
    ) -> None:
        with _process_lock(self.data_dir / ".jsonl-lock.sqlite"):
            self._update_jsonl_submission_locked(submission_id, archive_status, archive_uri, archive_error, target_results)

    def _update_jsonl_submission_locked(
        self,
        submission_id: str,
        archive_status: str,
        archive_uri: str | None,
        archive_error: str | None,
        target_results: list[ArchiveTargetResult],
    ) -> None:
        if not self.jsonl_path.exists():
            return
        updated: list[str] = []
        for line in self.jsonl_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            item = json.loads(line)
            if item.get("id") == submission_id:
                item["archive_status"] = archive_status
                item["archive_uri"] = archive_uri
                item["archive_error"] = archive_error
                item["archive_targets"] = _target_results_payload(target_results)
                for file_info in item.get("files", []):
                    file_info["archive_status"] = archive_status
                    file_info["archive_uri"] = (
                        f"{archive_uri.rstrip('/')}/{file_info['archive_filename']}" if archive_uri else None
                    )
                    file_info["local_path"] = (
                        None
                        if archive_status == "archived" and self.delete_local_after_success
                        else str(self.spool_dir / submission_id / file_info["archive_filename"])
                    )
                line = json.dumps(item, sort_keys=True)
            updated.append(line)
        self._replace_jsonl(updated)

    def _append_jsonl(self, item: dict[str, Any]) -> None:
        with _process_lock(self.data_dir / ".jsonl-lock.sqlite"):
            with self.jsonl_path.open("a+b") as handle:
                if handle.seek(0, io.SEEK_END):
                    handle.seek(-1, io.SEEK_END)
                    if handle.read(1) != b"\n":
                        handle.write(b"\n")
                handle.write((json.dumps(item, sort_keys=True) + "\n").encode("utf-8"))
                handle.flush()
                os.fsync(handle.fileno())

    def _reconcile_jsonl(self, submission_id: str | None = None) -> None:
        """Restore committed SQLite rows missing from JSONL; caller holds publication lock."""
        with _process_lock(self.data_dir / ".jsonl-lock.sqlite"):
            lines = []
            indexed_ids = set()
            content = self.jsonl_path.read_text(encoding="utf-8")
            changed = bool(content and not content.endswith("\n"))
            for line in content.splitlines():
                if not line.strip():
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    changed = True  # A process may have stopped midway through append.
                    continue
                if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                    changed = True
                    continue
                if item.get("id") in indexed_ids:
                    changed = True
                    continue
                indexed_ids.add(item.get("id"))
                lines.append(line)
            with closing(sqlite3.connect(self.sqlite_path)) as db:
                db.row_factory = sqlite3.Row
                if submission_id is None or changed:
                    rows = db.execute("SELECT * FROM submissions ORDER BY received_at, id").fetchall()
                else:
                    rows = db.execute("SELECT * FROM submissions WHERE id = ?", (submission_id,)).fetchall()
                for row in rows:
                    if row["id"] in indexed_ids:
                        continue
                    files = [dict(file_row) for file_row in db.execute(
                        "SELECT file_index, file_id, filename, archive_filename, kind, content_type, size_bytes, sha256, local_path, archive_uri, archive_status FROM submission_files WHERE submission_id = ? ORDER BY file_index",
                        (row["id"],),
                    )]
                    target_results = [ArchiveTargetResult(target=target["target_name"], ok=target["archive_status"] == "archived",
                                                          archive_uri=target["archive_uri"], error=target["error"])
                                      for target in db.execute(
                                          "SELECT target_name, archive_uri, archive_status, error FROM archive_targets WHERE submission_id = ? ORDER BY target_name",
                                          (row["id"],),
                                      )]
                    item = {
                        "id": row["id"], "experiment_id": row["experiment_id"],
                        "participant_id": row["participant_id"], "session_id": row["session_id"],
                        "received_at": row["received_at"], "file_count": row["file_count"],
                        "archive_status": row["archive_status"],
                        "archive_uri": _first_archive_uri(target_results),
                        "archive_error": _archive_error(target_results),
                        "archive_targets": _target_results_payload(target_results), "files": files,
                    }
                    if row["submission_kind"]:
                        item.update({field: row[field] for field in ("submission_kind", *ASSIGNMENT_FIELDS, *TRIAL_FIELDS)
                                     if field != "encoded"})
                        item["content_sha256"] = row["content_sha256"]
                    lines.append(json.dumps(item, sort_keys=True))
                    changed = True
            if changed:
                self._replace_jsonl(lines)

    def _replace_jsonl(self, lines: list[str]) -> None:
        temporary = self.data_dir / f".submissions-{uuid.uuid4().hex}.tmp"
        try:
            _write_durable(temporary, ("\n".join(lines) + ("\n" if lines else "")).encode("utf-8"))
            # shortcut: 5 attempts cover transient Windows scanning locks, increase if longer locks are observed.
            for attempt in range(5):
                try:
                    temporary.replace(self.jsonl_path)
                    _sync_directory(self.data_dir)
                    break
                except PermissionError:
                    if os.name != "nt" or attempt == 4:
                        raise
                    time.sleep(0.05 * (2**attempt))
        finally:
            temporary.unlink(missing_ok=True)

    def _mark_jsonl_archived(self, submission_ids: set[str], archive_uri: str) -> None:
        with _process_lock(self.data_dir / ".jsonl-lock.sqlite"):
            self._mark_jsonl_archived_locked(submission_ids, archive_uri)

    def _mark_jsonl_archived_locked(self, submission_ids: set[str], archive_uri: str) -> None:
        if not self.jsonl_path.exists():
            return
        updated: list[str] = []
        for line in self.jsonl_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            item = json.loads(line)
            if item.get("id") in submission_ids:
                item["archive_status"] = "archived"
                item["archive_uri"] = archive_uri
                item["archive_error"] = None
                for file_info in item.get("files", []):
                    file_info["archive_status"] = "archived"
                    file_info["archive_uri"] = f"{archive_uri}/{item['id']}/{file_info['archive_filename']}"
                    file_info["local_path"] = None
            updated.append(json.dumps(item, sort_keys=True))
        self._replace_jsonl(updated)

    def _reset_metadata(self) -> None:
        if self.sqlite_path.exists():
            self.sqlite_path.unlink()
        with _process_lock(self.data_dir / ".jsonl-lock.sqlite"):
            self._replace_jsonl([])
        self._init_schema()

    def _prune_metadata_archives(self, keep_local: int, protected: set[str] | None = None) -> None:
        root = self.data_dir / "metadata_archives"
        if not root.exists():
            return
        protected = protected or set()
        archives = sorted(
            [path for path in root.iterdir() if path.is_dir() and path.name not in protected],
            key=lambda path: path.name,
        )
        keep = max(0, keep_local)
        for path in archives[:-keep] if keep else archives:
            shutil.rmtree(path)


def _write_durable(path: Path, data: bytes) -> None:
    with path.open("wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())


def _sync_directory(path: Path) -> None:
    if os.name != "nt":
        descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


@contextmanager
def _process_lock(path: Path):
    with closing(sqlite3.connect(path, timeout=3600)) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            yield
        finally:
            db.rollback()


def _archive_key(submission: Submission, submission_id: str) -> str:
    return f"{submission.experiment_id}/{submission.participant_id}/{submission.session_id}/{submission_id}"


def _metadata_archive_name(label: str | None) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    if not label:
        return stamp
    safe = "".join(char if char.isalnum() or char in ("-", "_") else "-" for char in label).strip("-")
    return f"{stamp}-{safe}" if safe else stamp


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _env_positive_int(name: str) -> int | None:
    value = os.environ.get(name)
    if not value:
        return None
    parsed = int(value)
    if parsed <= 0:
        raise ValueError(f"{name} must be positive")
    return parsed


def _aggregate_archive_status(results: list[ArchiveTargetResult]) -> str:
    if not results:
        return "pending"
    statuses = ["archived" if result.ok else "pending" if result.error is None else "failed" for result in results]
    if all(status == "archived" for status in statuses):
        return "archived"
    if any(status == "archived" for status in statuses):
        return "partial"
    if any(status == "pending" for status in statuses):
        return "pending"
    return "failed"


def _first_archive_uri(results: list[ArchiveTargetResult]) -> str | None:
    for result in results:
        if result.ok and result.archive_uri:
            return result.archive_uri
    return None


def _archive_error(results: list[ArchiveTargetResult]) -> str | None:
    errors = [f"{result.target}: {result.error}" for result in results if not result.ok and result.error]
    if len(errors) == 1 and results and results[0].target == "primary":
        return results[0].error
    return "; ".join(errors) if errors else None


def _target_results_payload(results: list[ArchiveTargetResult]) -> list[dict[str, Any]]:
    return [
        {
            "target": result.target,
            "ok": result.ok,
            "archive_uri": result.archive_uri,
            "error": result.error,
        }
        for result in results
    ]
