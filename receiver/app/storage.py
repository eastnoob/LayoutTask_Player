from __future__ import annotations

from dataclasses import dataclass
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
from typing import Any
import uuid

from .archive import ArchiveResult, ArchiveTargetResult
from .models import Submission


@dataclass(frozen=True)
class StoredSubmission:
    id: str
    file_count: int
    archive_status: str


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
    ):
        self.data_dir = Path(data_dir)
        self.archive_backend = archive_backend
        self.delete_local_after_success = delete_local_after_success
        self.metadata_archive_backend = metadata_archive_backend
        self.metadata_delete_local_after_upload = metadata_delete_local_after_upload
        self.archive_on_submit = archive_on_submit
        self.spool_dir = self.data_dir / "spool"
        self.jsonl_path = self.data_dir / "submissions.jsonl"
        self.sqlite_path = self.data_dir / "submissions.sqlite"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._init_schema()

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
            file_path.write_text(submitted_file.data, encoding="utf-8")
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
        (spool_path / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        archive_status = "pending"
        archive_error = None
        archive_uri = None
        target_results: list[ArchiveTargetResult] = []
        if self.archive_backend is not None and self.archive_on_submit:
            try:
                result: ArchiveResult = self.archive_backend.archive(spool_path, archive_key)
            except Exception as error:
                result = ArchiveResult(ok=False, error=str(error) or error.__class__.__name__)
            target_results = self._target_results(result)
            archive_status = _aggregate_archive_status(target_results)
            archive_uri = _first_archive_uri(target_results)
            archive_error = _archive_error(target_results)
            for file_info in files:
                file_info["archive_status"] = archive_status
                if archive_uri:
                    file_info["archive_uri"] = f"{archive_uri}/{file_info['archive_filename']}"
                if archive_status == "archived" and self.delete_local_after_success:
                    file_info["local_path"] = None
            if archive_status == "archived" and self.delete_local_after_success:
                shutil.rmtree(spool_path)
        elif self.archive_backend is not None:
            target_results = [ArchiveTargetResult(target=name, ok=False) for name in self._archive_target_names()]

        self._insert_submission(
            submission_id,
            submission,
            received_at,
            remote_addr,
            user_agent,
            len(files),
            body_sha256,
            archive_status,
            files,
            target_results,
        )
        self._append_jsonl(
            {
                "id": submission_id,
                "experiment_id": submission.experiment_id,
                "participant_id": submission.participant_id,
                "session_id": submission.session_id,
                "received_at": received_at,
                "file_count": len(files),
                "archive_status": archive_status,
                "archive_uri": archive_uri,
                "archive_error": archive_error,
                "archive_targets": _target_results_payload(target_results),
                "files": files,
            },
        )
        return StoredSubmission(id=submission_id, file_count=len(files), archive_status=archive_status)

    def archive_session(self, experiment_id: str, participant_id: str, session_id: str) -> SessionArchiveResult:
        """Archive every pending submission for one session as one idempotent unit."""
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

        staging_root = self.data_dir / "session-staging"
        staging_dir = staging_root / uuid.uuid4().hex
        staging_dir.mkdir(parents=True, exist_ok=False)
        try:
            for (submission_id,) in rows:
                spool_dir = self.spool_dir / submission_id
                if not spool_dir.exists():
                    return SessionArchiveResult(False, "failed", error=f"missing spool for submission {submission_id}")
                shutil.copytree(spool_dir, staging_dir / submission_id)

            archive_key = f"{experiment_id}/{participant_id}/{session_id}"
            for target_name in self._archive_target_names():
                pending_ids = [
                    submission_id
                    for (submission_id,) in rows
                    if not self._submission_target_archived(submission_id, target_name)
                ]
                if not pending_ids:
                    continue
                try:
                    result = self._archive_target(target_name, staging_dir, archive_key)
                except Exception as error:
                    result = ArchiveResult(ok=False, error=str(error) or error.__class__.__name__)
                self._record_target_result(
                    pending_ids,
                    ArchiveTargetResult(
                        target=target_name,
                        ok=result.ok and bool(result.archive_uri),
                        archive_uri=result.archive_uri,
                        error=result.error,
                    ),
                    session_archive=True,
                )

            submission_ids = {row[0] for row in rows}
            for submission_id in submission_ids:
                self._sync_submission_state(submission_id)
            statuses = [self._submission_status(submission_id) for submission_id in submission_ids]
            if all(status == "archived" for status in statuses):
                for submission_id in submission_ids:
                    spool_path = self.spool_dir / submission_id
                    if self.delete_local_after_success and spool_path.exists():
                        shutil.rmtree(spool_path)
                archive_uri = self._session_archive_uri(experiment_id, participant_id, session_id)
                return SessionArchiveResult(True, "archived", archive_uri=archive_uri)
            archive_uri = self._session_archive_uri(experiment_id, participant_id, session_id)
            status = "partial" if any(status in {"partial", "archived"} for status in statuses) else "failed"
            return SessionArchiveResult(False, status, archive_uri=archive_uri, error="one or more archive targets failed")
        finally:
            if staging_dir.exists():
                shutil.rmtree(staging_dir)

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
        if self.archive_backend is None:
            return 0
        retried = 0
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            rows = db.execute(
                """
                SELECT id, experiment_id, participant_id, session_id
                FROM submissions
                WHERE archive_status IN ('pending', 'failed', 'partial')
                ORDER BY received_at
                """,
            ).fetchall()

        for submission_id, experiment_id, participant_id, session_id in rows:
            spool_path = self.spool_dir / submission_id
            if not spool_path.exists():
                continue
            archive_key = f"{experiment_id}/{participant_id}/{session_id}/{submission_id}"
            before = self._submission_status(submission_id)
            target_names = self._ensure_archive_target_rows(submission_id)
            for target_name in target_names:
                if self._submission_target_archived(submission_id, target_name):
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

            self._sync_submission_state(submission_id)
            after = self._submission_status(submission_id)
            if after == "archived":
                if self.delete_local_after_success and spool_path.exists():
                    shutil.rmtree(spool_path)
                if before != "archived":
                    retried += 1
        return retried

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
            db.commit()
        if not self.jsonl_path.exists():
            self.jsonl_path.write_text("", encoding="utf-8")

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
    ) -> None:
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            db.execute(
                """
                INSERT INTO submissions(
                  id, experiment_id, participant_id, session_id, received_at,
                  remote_addr, user_agent, file_count, status, body_sha256, archive_status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        session_archive: bool = False,
    ) -> None:
        with closing(sqlite3.connect(self.sqlite_path)) as db:
            for submission_id in submission_ids:
                archive_uri = target_result.archive_uri
                if archive_uri and session_archive:
                    archive_uri = f"{archive_uri.rstrip('/')}/{submission_id}"
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
            updated.append(json.dumps(item, sort_keys=True))
        self.jsonl_path.write_text("\n".join(updated) + ("\n" if updated else ""), encoding="utf-8")

    def _append_jsonl(self, item: dict[str, Any]) -> None:
        with self.jsonl_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(item, sort_keys=True) + "\n")

    def _mark_jsonl_archived(self, submission_ids: set[str], archive_uri: str) -> None:
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
        self.jsonl_path.write_text("\n".join(updated) + ("\n" if updated else ""), encoding="utf-8")

    def _reset_metadata(self) -> None:
        if self.sqlite_path.exists():
            self.sqlite_path.unlink()
        self.jsonl_path.write_text("", encoding="utf-8")
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
