import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from app.archive import ArchiveResult, LocalArchiveBackend
from app.models import validate_submission
from app.storage import ReceiverStorage


class ToggleArchiveBackend:
    def __init__(self):
        self.fail = True
        self.calls = []

    def archive(self, spool_dir: Path, archive_key: str) -> ArchiveResult:
        self.calls.append((spool_dir, archive_key))
        if self.fail:
            return ArchiveResult(ok=False, error="archive unavailable")
        target = spool_dir.parents[1] / "archive" / archive_key
        target.parent.mkdir(parents=True, exist_ok=True)
        import shutil

        shutil.copytree(spool_dir, target)
        return ArchiveResult(ok=True, archive_uri=f"local://{archive_key}")


class RecordingArchiveBackend:
    def __init__(self):
        self.calls = []

    def archive(self, spool_dir: Path, archive_key: str) -> ArchiveResult:
        self.calls.append((spool_dir, archive_key))
        return ArchiveResult(ok=True, archive_uri=f"rclone://layouttask-receiver:metadata-indexes/{archive_key}")


def valid_submission():
    return validate_submission(
        {
            "schema": "layouttask.receiver.submission.v1",
            "experiment_id": "layout_task_v1",
            "participant_id": "P001",
            "session_id": "S001",
            "files": [
                {"filename": "layout_session_P001_S001.csv", "content_type": "text/csv", "data": "a\n1\n"},
                {"filename": "layout_results_P001_S001.csv", "content_type": "text/csv", "data": "b\n2\n"},
            ],
        },
        max_files=8,
        max_file_bytes=1024,
    )


class StorageTests(unittest.TestCase):
    def test_save_submission_archives_files_and_indexes_each_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            storage = ReceiverStorage(
                data_dir,
                archive_backend=LocalArchiveBackend(data_dir / "archive"),
                delete_local_after_success=True,
            )

            stored = storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha")

            self.assertEqual(stored.file_count, 2)
            self.assertFalse((data_dir / "spool" / stored.id).exists())
            archive_dir = data_dir / "archive" / "layout_task_v1" / "P001" / "S001" / stored.id
            self.assertEqual((archive_dir / "f001__layout_session_P001_S001.csv").read_text(encoding="utf-8"), "a\n1\n")
            self.assertEqual((archive_dir / "f002__layout_results_P001_S001.csv").read_text(encoding="utf-8"), "b\n2\n")

            manifest = json.loads((archive_dir / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["files"][0]["file_index"], 1)
            self.assertEqual(manifest["files"][0]["file_id"], f"{stored.id}-f001")
            self.assertEqual(manifest["files"][0]["archive_filename"], "f001__layout_session_P001_S001.csv")

            with closing(sqlite3.connect(data_dir / "submissions.sqlite")) as db:
                submission_row = db.execute("SELECT archive_status FROM submissions WHERE id = ?", (stored.id,)).fetchone()
                file_rows = db.execute(
                    "SELECT file_index, file_id, archive_filename, archive_uri FROM submission_files ORDER BY file_index",
                ).fetchall()

            self.assertEqual(submission_row, ("archived",))
            self.assertEqual(file_rows[0][0], 1)
            self.assertEqual(file_rows[0][1], f"{stored.id}-f001")
            self.assertEqual(file_rows[0][2], "f001__layout_session_P001_S001.csv")
            self.assertEqual(
                file_rows[0][3],
                f"local://layout_task_v1/P001/S001/{stored.id}/f001__layout_session_P001_S001.csv",
            )
            self.assertEqual(len((data_dir / "submissions.jsonl").read_text(encoding="utf-8").splitlines()), 1)

    def test_failed_archive_keeps_spool_and_retry_archives_it(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            backend = ToggleArchiveBackend()
            storage = ReceiverStorage(data_dir, archive_backend=backend, delete_local_after_success=True)

            stored = storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha")

            self.assertTrue((data_dir / "spool" / stored.id).exists())
            with closing(sqlite3.connect(data_dir / "submissions.sqlite")) as db:
                self.assertEqual(db.execute("SELECT archive_status FROM submissions").fetchone(), ("failed",))

            backend.fail = False
            self.assertEqual(storage.retry_pending(), 1)

            self.assertFalse((data_dir / "spool" / stored.id).exists())
            self.assertTrue(
                (
                    data_dir
                    / "archive"
                    / "layout_task_v1"
                    / "P001"
                    / "S001"
                    / stored.id
                    / "f001__layout_session_P001_S001.csv"
                ).exists(),
            )
            with closing(sqlite3.connect(data_dir / "submissions.sqlite")) as db:
                self.assertEqual(db.execute("SELECT archive_status FROM submissions").fetchone(), ("archived",))

    def test_archive_metadata_uploads_prunes_and_clears_active_index(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            storage = ReceiverStorage(data_dir, archive_backend=LocalArchiveBackend(data_dir / "archive"))
            storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha")
            for name in ["2000-01-01-old", "2000-01-02-old"]:
                old = data_dir / "metadata_archives" / name
                old.mkdir(parents=True)
                (old / "submissions.jsonl").write_text("old\n", encoding="utf-8")

            metadata_backend = RecordingArchiveBackend()
            storage = ReceiverStorage(
                data_dir,
                metadata_archive_backend=metadata_backend,
                metadata_delete_local_after_upload=True,
            )
            result = storage.archive_metadata(label="test-run", keep_local=1)

            self.assertTrue(result.uploaded_uri)
            self.assertFalse(result.local_kept)
            self.assertFalse(result.local_path.exists())
            self.assertEqual(len(metadata_backend.calls), 1)
            self.assertTrue(metadata_backend.calls[0][1].endswith("-test-run"))
            self.assertFalse(metadata_backend.calls[0][1].startswith("metadata-indexes/"))
            remaining = [path.name for path in (data_dir / "metadata_archives").iterdir()]
            self.assertEqual(len(remaining), 1)
            self.assertEqual((data_dir / "submissions.jsonl").read_text(encoding="utf-8"), "")
            with closing(sqlite3.connect(data_dir / "submissions.sqlite")) as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone(), (0,))

    def test_clear_data_removes_local_data_without_metadata_snapshot(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            storage = ReceiverStorage(
                data_dir,
                archive_backend=LocalArchiveBackend(data_dir / "archive"),
                delete_local_after_success=False,
            )
            storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha")

            storage.clear_data()

            self.assertFalse((data_dir / "spool").exists())
            self.assertFalse((data_dir / "archive").exists())
            self.assertFalse((data_dir / "metadata_archives").exists())
            self.assertEqual((data_dir / "submissions.jsonl").read_text(encoding="utf-8"), "")
            with closing(sqlite3.connect(data_dir / "submissions.sqlite")) as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone(), (0,))


if __name__ == "__main__":
    unittest.main()
