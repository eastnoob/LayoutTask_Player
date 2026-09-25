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

from .archive import ArchiveResult
from .models import Submission


@dataclass(frozen=True)
class StoredSubmission:
    id: str
    file_count: int
    archive_status: str


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
        if self.archive_backend is not None and self.archive_on_submit:
            try:
                result: ArchiveResult = self.archive_backend.archive(spool_path, archive_key)
            except Exception as error:
                result = ArchiveResult(ok=False, error=str(error) or error.__class__.__name__)
            if result.ok and result.archive_uri:
                archive_status = "archived"
                archive_uri = result.archive_uri
                for file_info in files:
                    file_info["archive_status"] = "archived"
                    file_info["archive_uri"] = f"{archive_uri}/{file_info['archive_filename']}"
                    if self.delete_local_after_success:
                        file_info["local_path"] = None
                if self.delete_local_after_success:
                    shutil.rmtree(spool_path)
            else:
                archive_status = "failed"
                archive_error = result.error or "archive failed"
                for file_info in files:
                    file_info["archive_status"] = "failed"

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
            try:
                result: ArchiveResult = self.archive_backend.archive(staging_dir, archive_key)
            except Exception as error:
                result = ArchiveResult(ok=False, error=str(error) or error.__class__.__name__)
            if not result.ok or not result.archive_uri:
                return SessionArchiveResult(False, "failed", error=result.error or "archive failed")

            with closing(sqlite3.connect(self.sqlite_path)) as db:
                for (submission_id,) in rows:
                    db.execute(
                        "UPDATE submissions SET archive_status = 'archived' WHERE id = ?",
                        (submission_id,),
                    )
                    file_rows = db.execute(
                        "SELECT id, archive_filename FROM submission_files WHERE submission_id = ? ORDER BY file_index",
                        (submission_id,),
                    ).fetchall()
                    for file_id, archive_filename in file_rows:
                        db.execute(
                            """
                            UPDATE submission_files
                            SET archive_status = 'archived', archive_uri = ?, local_path = NULL
                            WHERE id = ?
                            """,
                            (f"{result.archive_uri}/{submission_id}/{archive_filename}", file_id),
                        )
                db.commit()
            self._mark_jsonl_archived({submission_id for (submission_id,) in rows}, result.archive_uri)
            for (submission_id,) in rows:
                shutil.rmtree(self.spool_dir / submission_id)
            return SessionArchiveResult(True, "archived", archive_uri=result.archive_uri)
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
                WHERE archive_status IN ('pending', 'failed')
                ORDER BY received_at
                """,
            ).fetchall()

        for submission_id, experiment_id, participant_id, session_id in rows:
            spool_path = self.spool_dir / submission_id
            if not spool_path.exists():
                continue
            archive_key = f"{experiment_id}/{participant_id}/{session_id}/{submission_id}"
            try:
                result: ArchiveResult = self.archive_backend.archive(spool_path, archive_key)
            except Exception:
                continue
            if not result.ok or not result.archive_uri:
                continue

            with closing(sqlite3.connect(self.sqlite_path)) as db:
                file_rows = db.execute(
                    "SELECT id, archive_filename FROM submission_files WHERE submission_id = ? ORDER BY file_index",
                    (submission_id,),
                ).fetchall()
                for file_row_id, archive_filename in file_rows:
                    db.execute(
                        """
                        UPDATE submission_files
                        SET archive_status = 'archived', archive_uri = ?, local_path = ?
                        WHERE id = ?
                        """,
                        (
                            f"{result.archive_uri}/{archive_filename}",
                            None if self.delete_local_after_success else str(spool_path / archive_filename),
                            file_row_id,
                        ),
                    )
                db.execute(
                    "UPDATE submissions SET archive_status = 'archived' WHERE id = ?",
                    (submission_id,),
                )
                db.commit()
            if self.delete_local_after_success:
                shutil.rmtree(spool_path)
            retried += 1
        return retried

    def archive_metadata(self, label: str | None = None, keep_local: int = 3) -> MetadataArchiveResult:
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
            result: ArchiveResult = self.metadata_archive_backend.archive(target, name)
            if not result.ok:
                self._prune_metadata_archives(keep_local)
                return MetadataArchiveResult(local_path=target, uploaded_uri=None, local_kept=True)
            uploaded_uri = result.archive_uri
            if self.metadata_delete_local_after_upload:
                shutil.rmtree(target)
                local_kept = False

        self._reset_metadata()
        self._prune_metadata_archives(keep_local)
        return MetadataArchiveResult(local_path=target, uploaded_uri=uploaded_uri, local_kept=local_kept)

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
            db.commit()

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

    def _prune_metadata_archives(self, keep_local: int) -> None:
        root = self.data_dir / "metadata_archives"
        if not root.exists():
            return
        archives = sorted([path for path in root.iterdir() if path.is_dir()], key=lambda path: path.name)
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
