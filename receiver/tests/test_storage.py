import hashlib
import json
import multiprocessing
import sqlite3
import tempfile
import threading
import unittest
from contextlib import closing
from dataclasses import replace
from pathlib import Path

from app.archive import ArchiveResult, LocalArchiveBackend, MultiArchiveBackend
from app.models import ValidationError, validate_submission
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


class ToggleTarget:
    def __init__(self, name):
        self.name = name
        self.fail = True
        self.calls = []

    def archive(self, spool_dir: Path, archive_key: str) -> ArchiveResult:
        self.calls.append(archive_key)
        if self.fail:
            return ArchiveResult(ok=False, error=f"{self.name} unavailable")
        return ArchiveResult(ok=True, archive_uri=f"{self.name}://{archive_key}")


class RaisingArchiveBackend:
    def archive(self, spool_dir: Path, archive_key: str) -> ArchiveResult:
        raise RuntimeError("backend exploded")


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


def v2_payload(assignment, kind="trial", participant_id="P47", session_id="S1", encoded="encoded-one"):
    identity = {
        "experiment_id": assignment.experiment_id, "participant_id": participant_id,
        "session_id": session_id, "assignment_id": assignment.assignment_id,
        "participant_number": assignment.participant_number, "sequence_id": assignment.sequence_id,
        "schedule_version": assignment.schedule_version, "assignment_mode": assignment.assignment_mode,
        "requested_sequence_id": assignment.requested_sequence_id,
        "replacement_attempt": assignment.replacement_attempt, "rotation_index": assignment.rotation_index,
    }
    payload = {"schema": "layouttask.receiver.submission.v2", "submission_kind": kind, **identity}
    if kind == "trial":
        trial = {**identity, "trial_session_id": "T1", "trial_type": "formal", "trial_index": 0,
                 "task_id": "task", "qid": "q", "presentation_id": "p1",
                 "hash8": "12345678", "encoding": "lz-uri", "encoded": encoded}
        payload.update({key: trial[key] for key in ("trial_session_id", "trial_type", "trial_index", "task_id", "qid", "presentation_id", "hash8", "encoding", "encoded")})
        payload["files"] = [{"filename": "task_q_T1.json", "content_type": "application/json",
                             "data": json.dumps({"schema": "layouttask.backup.v2", "saved_at": "time-1", "session": "T1", **trial})}]
    else:
        headers = list(identity)
        values = ["" if identity[key] is None else str(identity[key]) for key in headers]
        csv_data = ",".join([*headers, "note"]) + "\n" + ",".join([*values, "one"]) + "\n"
        payload["files"] = [
            {"filename": "layout_session_P47_S1.csv", "content_type": "text/csv", "data": csv_data},
            {"filename": "layout_raw_results_P47_S1.csv", "content_type": "text/csv", "data": csv_data},
        ]
    return payload


def submit_v2(storage, payload):
    return storage.save_submission(validate_submission(payload, 8, 100000), "127.0.0.1", "unit-test", "body-sha")


def archive_race_worker(data_dir, operation, started, backend_entered, release, output,
                        session=("layout_task_v1", "P001", "S001")):
    class CoordinatedBackend:
        def archive(self, spool_dir, archive_key):
            backend_entered.set()
            if release is not None and not release.wait(20):
                raise TimeoutError("archive test release timed out")
            return LocalArchiveBackend(data_dir / "archive").archive(spool_dir, archive_key)

    storage = ReceiverStorage(data_dir, archive_backend=CoordinatedBackend(), archive_on_submit=False)
    started.set()
    try:
        if operation == "session":
            result = storage.archive_session(*session)
            output.put((result.ok, result.archive_status, result.already_archived, result.error))
        else:
            output.put(storage.retry_pending())
    except Exception as error:
        output.put((type(error).__name__, str(error)))


def jsonl_update_race_worker(data_dir, submission_id, read_done, release, output):
    storage = ReceiverStorage(data_dir, archive_on_submit=False)
    original = Path.read_text

    def pause_after_read(path, *args, **kwargs):
        content = original(path, *args, **kwargs)
        if path == storage.jsonl_path:
            read_done.set()
            if not release.wait(10):
                raise TimeoutError("JSONL test release timed out")
        return content

    try:
        Path.read_text = pause_after_read
        storage._update_jsonl_submission(submission_id, "archived", "local://archive", None, [])
        output.put("updated")
    except Exception as error:
        output.put((type(error).__name__, str(error)))
    finally:
        Path.read_text = original


def jsonl_append_race_worker(data_dir, ready, go, entered, done, output):
    class SignallingStorage(ReceiverStorage):
        def _append_jsonl(self, item):
            entered.set()
            super()._append_jsonl(item)

    try:
        storage = SignallingStorage(data_dir, archive_on_submit=False)
        ready.set()
        if not go.wait(20):
            raise TimeoutError("JSONL append test start timed out")
        stored = storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha-2")
        output.put(stored.id)
    except Exception as error:
        output.put((type(error).__name__, str(error)))
    finally:
        done.set()


def unrelated_save_worker(data_dir, started, done, output):
    storage = ReceiverStorage(data_dir, archive_on_submit=False)
    try:
        submission = replace(valid_submission(), participant_id="P002", session_id="S002")
        started.set()
        stored = storage.save_submission(submission, "127.0.0.1", "unit-test", "body-sha-B")
        output.put(stored.id)
    except Exception as error:
        output.put((type(error).__name__, str(error)))
    finally:
        done.set()


def paused_v2_publish_worker(data_dir, payload, entered, release, output):
    class PausedStorage(ReceiverStorage):
        def _append_jsonl(self, item):
            entered.set()
            if not release.wait(20):
                raise TimeoutError("publication test release timed out")
            super()._append_jsonl(item)

    try:
        storage = PausedStorage(data_dir, archive_on_submit=False)
        output.put(submit_v2(storage, payload).id)
    except Exception as error:
        output.put((type(error).__name__, str(error)))


def duplicate_v2_worker(data_dir, payload, ready, go, started, done, output):
    storage = ReceiverStorage(data_dir, archive_on_submit=False)
    ready.set()
    try:
        if not go.wait(20):
            raise TimeoutError("duplicate test start timed out")
        submission = validate_submission(payload, 8, 100000)
        started.set()
        result = storage.save_submission(submission, "127.0.0.1", "unit-test", "body-sha")
        output.put((result.id, result.duplicate))
    except Exception as error:
        output.put((type(error).__name__, str(error)))
    finally:
        done.set()


def late_same_session_save_worker(data_dir, payload, started, done, output):
    try:
        storage = ReceiverStorage(data_dir, archive_on_submit=False)
        started.set()
        output.put(submit_v2(storage, payload).id)
    except Exception as error:
        output.put((type(error).__name__, str(error)))
    finally:
        done.set()


class StorageTests(unittest.TestCase):
    def test_slow_archive_does_not_block_unrelated_session_submission(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            storage = ReceiverStorage(data_dir, archive_backend=LocalArchiveBackend(data_dir / "archive"), archive_on_submit=False)
            first = storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha-A")
            ctx = multiprocessing.get_context("spawn")
            archive_started, archive_entered, release = ctx.Event(), ctx.Event(), ctx.Event()
            save_started, save_done = ctx.Event(), ctx.Event()
            archive_output, save_output = ctx.Queue(), ctx.Queue()
            archiver = ctx.Process(target=archive_race_worker, args=(data_dir, "session", archive_started, archive_entered, release, archive_output))
            saver = ctx.Process(target=unrelated_save_worker, args=(data_dir, save_started, save_done, save_output))
            try:
                archiver.start()
                self.assertTrue(archive_entered.wait(10))
                saver.start()
                self.assertTrue(save_started.wait(10))
                save_completed_before_release = save_done.wait(5)
            finally:
                release.set()
                for process in (archiver, saver):
                    if process.pid is not None:
                        process.join(10)
                        if process.is_alive():
                            process.terminate()
                            process.join(5)
            self.assertEqual((archiver.exitcode, saver.exitcode), (0, 0))
            self.assertTrue(save_completed_before_release)
            self.assertEqual(archive_output.get(timeout=2)[:2], (True, "archived"))
            second_id = save_output.get(timeout=2)
            self.assertIsInstance(second_id, str)
            self.assertTrue((storage.spool_dir / second_id).exists())
            self.assertFalse((storage.spool_dir / first.id).exists())
            self.assertEqual({item["id"] for item in map(json.loads, storage.jsonl_path.read_text(encoding="utf-8").splitlines())}, {first.id, second_id})

    def test_failed_jsonl_append_is_reconciled_on_restart_and_v2_retry(self):
        class FailingAppendStorage(ReceiverStorage):
            def _append_jsonl(self, item):
                with self.jsonl_path.open("a", encoding="utf-8") as handle:
                    handle.write('{"id":')
                raise OSError("simulated append failure")

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            storage = FailingAppendStorage(data_dir, archive_on_submit=False)
            assignment = storage.allocate_assignment("exp", "token", "s1", ["1"])
            payload = v2_payload(assignment)
            with self.assertRaisesRegex(OSError, "simulated append failure"):
                submit_v2(storage, payload)
            with closing(sqlite3.connect(storage.sqlite_path)) as db:
                original_id = db.execute("SELECT id FROM submissions").fetchone()[0]
                self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone(), (1,))
            self.assertEqual(storage.jsonl_path.read_text(encoding="utf-8"), '{"id":')

            restarted = ReceiverStorage(data_dir, archive_on_submit=False)
            retried = submit_v2(restarted, payload)
            self.assertEqual((retried.id, retried.duplicate), (original_id, True))
            with closing(sqlite3.connect(storage.sqlite_path)) as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone(), (1,))
            entries = [json.loads(line) for line in storage.jsonl_path.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(len(entries), 1)
            self.assertEqual((entries[0]["id"], entries[0]["submission_kind"], entries[0]["assignment_id"], entries[0]["archive_status"]),
                             (original_id, "trial", assignment.assignment_id, "pending"))
            self.assertEqual(entries[0]["files"][0]["sha256"], json.loads((storage.spool_dir / original_id / "manifest.json").read_text(encoding="utf-8"))["files"][0]["sha256"])

    def test_v2_retry_repairs_missing_jsonl_without_restart(self):
        class FailingAppendStorage(ReceiverStorage):
            def _append_jsonl(self, item):
                raise OSError("simulated append failure")

        with tempfile.TemporaryDirectory() as temp_dir:
            storage = FailingAppendStorage(Path(temp_dir), archive_on_submit=False)
            assignment = storage.allocate_assignment("exp", "token", "s1", ["1"])
            payload = v2_payload(assignment)
            with self.assertRaises(OSError):
                submit_v2(storage, payload)
            with closing(sqlite3.connect(storage.sqlite_path)) as db:
                original_id = db.execute("SELECT id FROM submissions").fetchone()[0]
            retried = submit_v2(storage, payload)
            self.assertEqual((retried.id, retried.duplicate), (original_id, True))
            self.assertEqual(len(storage.jsonl_path.read_text(encoding="utf-8").splitlines()), 1)

    def test_v2_retry_recovers_intervening_v1_after_partial_jsonl_append_without_restart(self):
        class FailingOnceAppendStorage(ReceiverStorage):
            fail_append = True

            def _append_jsonl(self, item):
                if self.fail_append:
                    self.fail_append = False
                    with self.jsonl_path.open("a", encoding="utf-8") as handle:
                        handle.write('{"id":')
                    raise OSError("simulated partial append failure")
                super()._append_jsonl(item)

        with tempfile.TemporaryDirectory() as temp_dir:
            storage = FailingOnceAppendStorage(Path(temp_dir), archive_on_submit=False)
            assignment = storage.allocate_assignment("exp", "token", "s1", ["1"])
            payload = v2_payload(assignment)
            with self.assertRaisesRegex(OSError, "simulated partial append failure"):
                submit_v2(storage, payload)
            with closing(sqlite3.connect(storage.sqlite_path)) as db:
                original_id = db.execute("SELECT id FROM submissions").fetchone()[0]
            self.assertEqual(storage.jsonl_path.read_text(encoding="utf-8"), '{"id":')

            legacy = storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha-v1")
            self.assertEqual(legacy.archive_status, "pending")
            lines_before_retry = storage.jsonl_path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines_before_retry), 2)
            self.assertEqual(lines_before_retry[0], '{"id":')
            self.assertEqual(json.loads(lines_before_retry[1])["id"], legacy.id)
            originals = {path: path.read_bytes() for path in storage.spool_dir.rglob("*") if path.is_file()}
            self.assertIn(storage.spool_dir / original_id / "manifest.json", originals)
            self.assertIn(storage.spool_dir / legacy.id / "manifest.json", originals)

            retried = submit_v2(storage, payload)
            self.assertEqual((retried.id, retried.duplicate), (original_id, True))
            with closing(sqlite3.connect(storage.sqlite_path)) as db:
                ids = [row[0] for row in db.execute("SELECT id FROM submissions")]
                file_hashes = {(row[0], row[1]): row[2] for row in db.execute(
                    "SELECT submission_id, archive_filename, sha256 FROM submission_files",
                )}
            self.assertCountEqual(ids, [original_id, legacy.id])
            entries = [json.loads(line) for line in storage.jsonl_path.read_text(encoding="utf-8").splitlines()]
            self.assertCountEqual([item["id"] for item in entries], ids)
            by_id = {item["id"]: item for item in entries}
            self.assertEqual((by_id[original_id]["submission_kind"], by_id[original_id]["assignment_id"]),
                             ("trial", assignment.assignment_id))
            self.assertNotIn("submission_kind", by_id[legacy.id])
            for item in entries:
                self.assertEqual(item["archive_status"], "pending")
                for file_info in item["files"]:
                    original_text = Path(file_info["local_path"]).read_text(encoding="utf-8")
                    self.assertEqual(file_info["sha256"], hashlib.sha256(original_text.encode("utf-8")).hexdigest())
                    self.assertEqual(file_info["sha256"], file_hashes[item["id"], file_info["archive_filename"]])
            self.assertEqual({path: path.read_bytes() for path in storage.spool_dir.rglob("*") if path.is_file()}, originals)

    def test_missing_archived_v1_jsonl_is_rebuilt_from_sqlite_after_spool_cleanup(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            storage = ReceiverStorage(data_dir, archive_backend=LocalArchiveBackend(data_dir / "archive"), archive_on_submit=False)
            stored = storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha")
            self.assertTrue(storage.archive_session("layout_task_v1", "P001", "S001").ok)
            self.assertFalse((storage.spool_dir / stored.id).exists())
            storage.jsonl_path.write_text("", encoding="utf-8")

            ReceiverStorage(data_dir, archive_on_submit=False)
            entries = [json.loads(line) for line in storage.jsonl_path.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(len(entries), 1)
            self.assertEqual((entries[0]["id"], entries[0]["archive_status"], entries[0]["archive_uri"]),
                             (stored.id, "archived", f"local://layout_task_v1/P001/S001/{stored.id}"))
            self.assertNotIn("submission_kind", entries[0])
            self.assertTrue(all(file_info["archive_status"] == "archived" and file_info["local_path"] is None for file_info in entries[0]["files"]))

    def test_v2_duplicate_waits_for_original_jsonl_publication(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            storage = ReceiverStorage(data_dir, archive_on_submit=False)
            assignment = storage.allocate_assignment("exp", "token", "s1", ["1"])
            payload = v2_payload(assignment)
            ctx = multiprocessing.get_context("spawn")
            ready, go, started, done, entered, release = (ctx.Event() for _ in range(6))
            original_output, duplicate_output = ctx.Queue(), ctx.Queue()
            duplicate = ctx.Process(target=duplicate_v2_worker, args=(data_dir, payload, ready, go, started, done, duplicate_output))
            original = ctx.Process(target=paused_v2_publish_worker, args=(data_dir, payload, entered, release, original_output))
            try:
                duplicate.start()
                self.assertTrue(ready.wait(10))
                original.start()
                self.assertTrue(entered.wait(10))
                go.set()
                self.assertTrue(started.wait(10))
                duplicate_finished_before_release = done.wait(1)
            finally:
                release.set()
                for process in (original, duplicate):
                    if process.pid is not None:
                        process.join(10)
                        if process.is_alive():
                            process.terminate()
                            process.join(5)
            self.assertEqual((original.exitcode, duplicate.exitcode), (0, 0))
            self.assertFalse(duplicate_finished_before_release)
            original_id = original_output.get(timeout=2)
            self.assertEqual(duplicate_output.get(timeout=2), (original_id, True))
            with closing(sqlite3.connect(storage.sqlite_path)) as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone(), (1,))
            self.assertEqual(len(storage.jsonl_path.read_text(encoding="utf-8").splitlines()), 1)

    def test_archive_session_and_retry_pending_serialize_across_processes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            storage = ReceiverStorage(data_dir, archive_backend=LocalArchiveBackend(data_dir / "archive"), archive_on_submit=False)
            stored = storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha")
            ctx = multiprocessing.get_context("spawn")
            first_started, first_entered, release = ctx.Event(), ctx.Event(), ctx.Event()
            second_started, second_entered = ctx.Event(), ctx.Event()
            first_output, second_output = ctx.Queue(), ctx.Queue()
            first = ctx.Process(target=archive_race_worker, args=(data_dir, "session", first_started, first_entered, release, first_output))
            second = ctx.Process(target=archive_race_worker, args=(data_dir, "retry", second_started, second_entered, None, second_output))
            try:
                first.start()
                self.assertTrue(first_entered.wait(10))
                second.start()
                self.assertTrue(second_started.wait(10))
                second_entered_before_release = second_entered.wait(1)
            finally:
                release.set()
                for process in (first, second):
                    if process.pid is not None:
                        process.join(10)
                        if process.is_alive():
                            process.terminate()
                            process.join(5)
            self.assertEqual((first.exitcode, second.exitcode), (0, 0))
            self.assertFalse(second_entered_before_release)
            self.assertEqual(first_output.get(timeout=2)[:2], (True, "archived"))
            self.assertEqual(second_output.get(timeout=2), 0)
            self.assertFalse((storage.spool_dir / stored.id).exists())
            self.assertTrue((data_dir / "archive" / "layout_task_v1" / "P001" / "S001" / stored.id).exists())

    def test_jsonl_rewrite_does_not_erase_concurrent_append_across_processes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            storage = ReceiverStorage(data_dir, archive_on_submit=False)
            first = storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha")
            ctx = multiprocessing.get_context("spawn")
            read_done, release, append_ready, append_go, append_entered, append_done = (ctx.Event() for _ in range(6))
            first_output, second_output = ctx.Queue(), ctx.Queue()
            updater = ctx.Process(target=jsonl_update_race_worker, args=(data_dir, first.id, read_done, release, first_output))
            appender = ctx.Process(target=jsonl_append_race_worker, args=(data_dir, append_ready, append_go, append_entered, append_done, second_output))
            try:
                appender.start()
                self.assertTrue(append_ready.wait(10))
                updater.start()
                self.assertTrue(read_done.wait(10))
                append_go.set()
                self.assertTrue(append_entered.wait(10))
                append_finished_before_release = append_done.wait(1)
            finally:
                release.set()
                for process in (updater, appender):
                    if process.pid is not None:
                        process.join(10)
                        if process.is_alive():
                            process.terminate()
                            process.join(5)
            self.assertEqual((updater.exitcode, appender.exitcode), (0, 0))
            self.assertFalse(append_finished_before_release)
            self.assertEqual(first_output.get(timeout=2), "updated")
            second_id = second_output.get(timeout=2)
            self.assertEqual({item["id"] for item in map(json.loads, storage.jsonl_path.read_text(encoding="utf-8").splitlines())}, {first.id, second_id})

    def test_existing_v1_submission_row_is_preserved_with_null_v2_columns(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            with closing(sqlite3.connect(data_dir / "submissions.sqlite")) as db:
                db.execute("CREATE TABLE submissions(id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, participant_id TEXT NOT NULL, session_id TEXT NOT NULL, received_at TEXT NOT NULL, remote_addr TEXT, user_agent TEXT, file_count INTEGER NOT NULL, status TEXT NOT NULL, body_sha256 TEXT NOT NULL, archive_status TEXT NOT NULL)")
                db.execute("INSERT INTO submissions VALUES ('old', 'exp', 'P', 'S', '2026-01-01', NULL, NULL, 1, 'accepted', 'sha', 'archived')")
                db.commit()
            ReceiverStorage(data_dir)
            with closing(sqlite3.connect(data_dir / "submissions.sqlite")) as db:
                self.assertEqual(db.execute("SELECT id, participant_id, submission_kind, assignment_id, trial_session_id FROM submissions").fetchone(), ("old", "P", None, None, None))

    def test_v2_replacement_identity_deduplicates_and_preserves_metadata(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = ReceiverStorage(Path(temp_dir), archive_on_submit=False)
            assignment = storage.allocate_assignment("exp", "replacement", "s1", ["1", "6"], "6")
            self.assertEqual((assignment.participant_number, assignment.sequence_id), (1, "6"))
            payload = v2_payload(assignment)
            first = submit_v2(storage, payload)
            backup = json.loads(payload["files"][0]["data"])
            backup["saved_at"] = "time-2"
            payload["files"][0]["data"] = json.dumps(backup)
            second = submit_v2(storage, payload)
            self.assertEqual(first.id, second.id)
            with self.assertRaisesRegex(ValidationError, "conflict"):
                submit_v2(storage, v2_payload(assignment, encoded="different"))
            changed_identity = v2_payload(assignment)
            changed_identity["presentation_id"] = "p2"
            changed_backup = json.loads(changed_identity["files"][0]["data"])
            changed_backup["presentation_id"] = "p2"
            changed_identity["files"][0]["data"] = json.dumps(changed_backup)
            with self.assertRaisesRegex(ValidationError, "conflict"):
                submit_v2(storage, changed_identity)
            with closing(sqlite3.connect(storage.sqlite_path)) as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone(), (1,))
                self.assertEqual(db.execute("SELECT submission_kind, assignment_id, trial_session_id, participant_number, sequence_id FROM submissions").fetchone(), ("trial", assignment.assignment_id, "T1", 1, "6"))
            manifest = json.loads((storage.spool_dir / first.id / "manifest.json").read_text(encoding="utf-8"))
            index = json.loads(storage.jsonl_path.read_text(encoding="utf-8").splitlines()[0])
            self.assertEqual((manifest["assignment_id"], index["sequence_id"]), (assignment.assignment_id, "6"))

    def test_v2_duplicate_rejects_different_valid_assignment(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = ReceiverStorage(Path(temp_dir), archive_on_submit=False)
            first_assignment = storage.allocate_assignment("exp", "first", "s1", ["1", "6"])
            second_assignment = storage.allocate_assignment("exp", "second", "s1", ["1", "6"], "6")
            first = submit_v2(storage, v2_payload(first_assignment))
            original_spool = {path.name: path.read_bytes() for path in (storage.spool_dir / first.id).iterdir()}
            original_index = storage.jsonl_path.read_bytes()

            with self.assertRaisesRegex(ValidationError, "submission_conflict"):
                submit_v2(storage, v2_payload(second_assignment))

            retry = submit_v2(storage, v2_payload(first_assignment))
            self.assertEqual((retry.id, retry.duplicate), (first.id, True))
            self.assertEqual({path.name: path.read_bytes() for path in (storage.spool_dir / first.id).iterdir()}, original_spool)
            self.assertEqual(storage.jsonl_path.read_bytes(), original_index)
            with closing(sqlite3.connect(storage.sqlite_path)) as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone(), (1,))
                self.assertEqual(
                    db.execute("SELECT assignment_id, participant_number, sequence_id FROM submissions").fetchone(),
                    (first_assignment.assignment_id, first_assignment.participant_number, first_assignment.sequence_id),
                )
                self.assertEqual(db.execute("SELECT participant_id FROM assignments ORDER BY participant_number").fetchall(), [("P47",), (None,)])

    def test_v2_duplicate_rejects_different_persisted_assignment_fields(self):
        # A valid retry must conflict with each changed stored field, even when its content digest matches.
        differences = {"assignment_id": "other", "participant_number": 47, "sequence_id": "6",
                       "schedule_version": "s2", "assignment_mode": "replacement", "requested_sequence_id": "6",
                       "replacement_attempt": 1, "rotation_index": None}
        for kind in ("trial", "final"):
            for field, changed in differences.items():
                with self.subTest(kind=kind, field=field), tempfile.TemporaryDirectory() as temp_dir:
                    storage = ReceiverStorage(Path(temp_dir), archive_on_submit=False)
                    assignment = storage.allocate_assignment("exp", "first", "s1", ["1"])
                    payload = v2_payload(assignment, kind=kind)
                    first = submit_v2(storage, payload)
                    with closing(sqlite3.connect(storage.sqlite_path)) as db:
                        db.execute(f"UPDATE submissions SET {field} = ? WHERE id = ?", (changed, first.id))
                        db.commit()
                    with self.assertRaisesRegex(ValidationError, "submission_conflict"):
                        submit_v2(storage, payload)

    def test_archive_session_reports_late_same_session_submission(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            storage = ReceiverStorage(data_dir, archive_backend=LocalArchiveBackend(data_dir / "archive"), archive_on_submit=False)
            assignment = storage.allocate_assignment("exp", "first", "s1", ["1"])
            first = submit_v2(storage, v2_payload(assignment))
            late_payload = v2_payload(assignment)
            late_payload["trial_session_id"] = "T2"
            late_payload["trial_index"] = 1
            late_payload["presentation_id"] = "p2"
            late_backup = json.loads(late_payload["files"][0]["data"])
            late_backup.update({"trial_session_id": "T2", "trial_index": 1, "presentation_id": "p2", "session": "T2"})
            late_payload["files"][0]["filename"] = "task_q_T2.json"
            late_payload["files"][0]["data"] = json.dumps(late_backup)
            ctx = multiprocessing.get_context("spawn")
            archive_started, archive_entered, release = ctx.Event(), ctx.Event(), ctx.Event()
            save_started, save_done = ctx.Event(), ctx.Event()
            archive_output, save_output = ctx.Queue(), ctx.Queue()
            archiver = ctx.Process(target=archive_race_worker, args=(data_dir, "session", archive_started, archive_entered, release, archive_output, ("exp", "P47", "S1")))
            saver = ctx.Process(target=late_same_session_save_worker, args=(data_dir, late_payload, save_started, save_done, save_output))
            try:
                archiver.start()
                self.assertTrue(archive_entered.wait(10))
                saver.start()
                self.assertTrue(save_started.wait(10))
                self.assertTrue(save_done.wait(10))
            finally:
                release.set()
                for process in (archiver, saver):
                    if process.pid is not None:
                        process.join(10)
                        if process.is_alive():
                            process.terminate()
                            process.join(5)
            self.assertEqual((archiver.exitcode, saver.exitcode), (0, 0))
            first_result = archive_output.get(timeout=2)
            self.assertEqual(first_result[:2], (False, "partial"))
            self.assertIn("retry", first_result[3])
            late_id = save_output.get(timeout=2)
            self.assertIsInstance(late_id, str)
            self.assertFalse((data_dir / "spool" / first.id).exists())
            self.assertTrue((data_dir / "spool" / late_id).exists())
            entries = {item["id"]: item for item in map(json.loads, storage.jsonl_path.read_text(encoding="utf-8").splitlines())}
            self.assertEqual({key: item["archive_status"] for key, item in entries.items()}, {first.id: "archived", late_id: "pending"})

            class RecordingLocalBackend(LocalArchiveBackend):
                def archive(self, spool_dir, archive_key):
                    calls.append(archive_key)
                    return super().archive(spool_dir, archive_key)

            calls = []
            storage.archive_backend = RecordingLocalBackend(data_dir / "archive")
            second = storage.archive_session("exp", "P47", "S1")
            self.assertEqual((second.ok, second.archive_status, second.already_archived), (True, "archived", False))
            self.assertEqual(calls, [f"exp/P47/S1/{late_id}"])
            self.assertFalse((data_dir / "spool" / late_id).exists())
            late_path = data_dir / "archive" / "exp" / "P47" / "S1" / late_id / "f001__task_q_T2.json"
            self.assertEqual(json.loads(late_path.read_text(encoding="utf-8")), late_backup)
            self.assertTrue(storage.archive_session("exp", "P47", "S1").already_archived)
            self.assertEqual(calls, [f"exp/P47/S1/{late_id}"])

    def test_v2_rejects_assignment_binding_and_embedded_identity_conflicts(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = ReceiverStorage(Path(temp_dir), archive_on_submit=False)
            assignment = storage.allocate_assignment("exp", "automatic", "s1", ["1", "6"])
            payload = v2_payload(assignment)
            for field, value in (("participant_number", 47), ("sequence_id", "6"), ("rotation_index", 10)):
                with self.subTest(field=field), self.assertRaises(ValidationError):
                    submit_v2(storage, {**payload, field: value})
            bad_backup = v2_payload(assignment)
            content = json.loads(bad_backup["files"][0]["data"])
            content["participant_id"] = "other"
            bad_backup["files"][0]["data"] = json.dumps(content)
            with self.assertRaises(ValidationError):
                submit_v2(storage, bad_backup)
            submit_v2(storage, payload)
            with self.assertRaisesRegex(ValidationError, "conflict"):
                submit_v2(storage, v2_payload(assignment, participant_id="other"))
            self.assertEqual(submit_v2(storage, v2_payload(assignment, session_id="S2")).file_count, 1)

    def test_v2_final_csv_identity_and_batch_idempotency(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = ReceiverStorage(Path(temp_dir), archive_on_submit=False)
            assignment = storage.allocate_assignment("exp", "automatic", "s1", ["1"])
            payload = v2_payload(assignment, kind="final")
            first = submit_v2(storage, payload)
            self.assertEqual(submit_v2(storage, payload).id, first.id)
            for index in (0, 1):
                bad = v2_payload(assignment, kind="final")
                bad["files"][index]["data"] = bad["files"][index]["data"].replace("P47", "wrong")
                with self.subTest(index=index), self.assertRaises(ValidationError):
                    submit_v2(storage, bad)
            changed = v2_payload(assignment, kind="final")
            changed["files"][1]["data"] = changed["files"][1]["data"].replace("one", "two")
            with self.assertRaisesRegex(ValidationError, "submission_conflict"):
                submit_v2(storage, changed)

    def test_retry_archived_trial_missing_spool_does_not_block_final_archive(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            backend = LocalArchiveBackend(data_dir / "archive")
            storage = ReceiverStorage(data_dir, archive_backend=backend, archive_on_submit=False)
            assignment = storage.allocate_assignment("exp", "automatic", "s1", ["1"])
            trial = submit_v2(storage, v2_payload(assignment))
            self.assertEqual(storage.retry_pending(), 1)
            self.assertFalse((storage.spool_dir / trial.id).exists())
            final = submit_v2(storage, v2_payload(assignment, kind="final"))
            first = storage.archive_session("exp", "P47", "S1")
            second = storage.archive_session("exp", "P47", "S1")
            self.assertTrue(first.ok)
            self.assertTrue(second.ok)
            self.assertTrue((data_dir / "archive" / "exp" / "P47" / "S1" / trial.id / "f001__task_q_T1.json").exists())
            self.assertTrue((data_dir / "archive" / "exp" / "P47" / "S1" / final.id / "f001__layout_session_P47_S1.csv").exists())

    def test_session_archive_skips_archived_trial_on_one_target_only(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            first_target = ToggleTarget("first")
            second_target = ToggleTarget("second")
            first_target.fail = False
            backend = MultiArchiveBackend({"first": first_target, "second": second_target})
            storage = ReceiverStorage(Path(temp_dir), archive_backend=backend, archive_on_submit=False)
            assignment = storage.allocate_assignment("exp", "automatic", "s1", ["1"])
            trial = submit_v2(storage, v2_payload(assignment))
            self.assertEqual(storage.retry_pending(), 0)
            self.assertEqual(len(first_target.calls), 1)
            second_target.fail = False
            submit_v2(storage, v2_payload(assignment, kind="final"))
            result = storage.archive_session("exp", "P47", "S1")
            self.assertTrue(result.ok)
            self.assertEqual(len(first_target.calls), 2)
            self.assertEqual(len(second_target.calls), 3)
            self.assertFalse((storage.spool_dir / trial.id).exists())
    def test_partial_submission_archive_retries_only_failed_target(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            jianguoyun = ToggleTarget("jianguoyun")
            sciebo = ToggleTarget("sciebo")
            jianguoyun.fail = False
            backend = MultiArchiveBackend({"jianguoyun": jianguoyun, "sciebo": sciebo})
            storage = ReceiverStorage(data_dir, archive_backend=backend, delete_local_after_success=True)

            stored = storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha")

            self.assertEqual(stored.archive_status, "partial")
            self.assertTrue((data_dir / "spool" / stored.id).exists())
            sciebo.fail = False
            self.assertEqual(storage.retry_pending(), 1)
            self.assertEqual(len(jianguoyun.calls), 1)
            self.assertEqual(len(sciebo.calls), 2)
            self.assertFalse((data_dir / "spool" / stored.id).exists())

    def test_partial_session_archive_retries_only_failed_target(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            jianguoyun = ToggleTarget("jianguoyun")
            sciebo = ToggleTarget("sciebo")
            jianguoyun.fail = False
            backend = MultiArchiveBackend({"jianguoyun": jianguoyun, "sciebo": sciebo})
            storage = ReceiverStorage(data_dir, archive_backend=backend, archive_on_submit=False)
            stored = storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha")

            first = storage.archive_session("layout_task_v1", "P001", "S001")

            self.assertFalse(first.ok)
            self.assertEqual(first.archive_status, "partial")
            self.assertTrue((data_dir / "spool" / stored.id).exists())
            sciebo.fail = False
            second = storage.archive_session("layout_task_v1", "P001", "S001")

            self.assertTrue(second.ok)
            self.assertEqual(len(jianguoyun.calls), 1)
            self.assertEqual(len(sciebo.calls), 2)
            self.assertFalse((data_dir / "spool" / stored.id).exists())

    def test_allocate_assignment_is_idempotent_and_cycles_configured_sequences(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = ReceiverStorage(Path(temp_dir))
            first = storage.allocate_assignment("exp", "token-1", "schedule-v1", ["sequence-a", "sequence-b"])
            repeated = storage.allocate_assignment("exp", "token-1", "schedule-v1", ["sequence-a", "sequence-b"])
            second = storage.allocate_assignment("exp", "token-2", "schedule-v1", ["sequence-a", "sequence-b"])
            third = storage.allocate_assignment("exp", "token-3", "schedule-v1", ["sequence-a", "sequence-b"])

            self.assertEqual(first, repeated)
            self.assertEqual(first.participant_number, 1)
            self.assertEqual(first.sequence_id, "sequence-a")
            self.assertEqual(second.participant_number, 2)
            self.assertEqual(second.sequence_id, "sequence-b")
            self.assertEqual(third.participant_number, 3)
            self.assertEqual(third.sequence_id, "sequence-a")

    def test_allocate_assignment_is_unique_under_concurrent_requests(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = ReceiverStorage(Path(temp_dir))
            results = []
            errors = []

            def allocate(index):
                try:
                    results.append(storage.allocate_assignment("exp", f"token-{index}", "schedule-v1", ["sequence-a", "sequence-b"]))
                except Exception as error:  # pragma: no cover - assertion reports unexpected SQLite failures
                    errors.append(error)

            threads = [threading.Thread(target=allocate, args=(index,)) for index in range(20)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()

            self.assertEqual(errors, [])
            self.assertEqual(sorted(item.participant_number for item in results), list(range(1, 21)))
            self.assertEqual(sorted(item.rotation_index for item in results), list(range(20)))

    def test_assignment_metadata_keeps_replacements_out_of_rotation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = ReceiverStorage(Path(temp_dir))
            automatic = storage.allocate_assignment("exp", "auto-1", "schedule-v1", ["sequence-a", "sequence-b"])
            replacement = storage.allocate_assignment("exp", "replacement-1", "schedule-v1", ["sequence-a", "sequence-b"], "sequence-b")
            next_automatic = storage.allocate_assignment("exp", "auto-2", "schedule-v1", ["sequence-a", "sequence-b"])

            self.assertEqual((automatic.assignment_mode, automatic.rotation_index, automatic.replacement_attempt, automatic.requested_sequence_id), ("automatic", 0, 0, None))
            self.assertEqual((replacement.participant_number, replacement.sequence_id, replacement.assignment_mode, replacement.requested_sequence_id, replacement.replacement_attempt, replacement.rotation_index), (2, "sequence-b", "replacement", "sequence-b", 1, None))
            self.assertEqual((next_automatic.participant_number, next_automatic.sequence_id, next_automatic.rotation_index), (3, "sequence-b", 1))

    def test_replacement_attempts_and_idempotency_are_stable(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = ReceiverStorage(Path(temp_dir))
            first = storage.allocate_assignment("exp", "replacement-1", "schedule-v1", ["sequence-a", "sequence-b"], "sequence-b")
            repeated = storage.allocate_assignment("exp", "replacement-1", "schedule-v1", ["sequence-a", "sequence-b"], "sequence-b")
            second = storage.allocate_assignment("exp", "replacement-2", "schedule-v1", ["sequence-a", "sequence-b"], "sequence-b")

            self.assertEqual(first, repeated)
            self.assertEqual(first.replacement_attempt, 1)
            self.assertEqual(second.replacement_attempt, 2)
            self.assertEqual(second.participant_number, 2)

    def test_legacy_assignment_rows_receive_stable_rotation_metadata(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            data_dir.mkdir(exist_ok=True)
            db_path = data_dir / "submissions.sqlite"
            with closing(sqlite3.connect(db_path)) as db:
                db.execute("""
                    CREATE TABLE assignments(
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
                """)
                db.execute("INSERT INTO assignments VALUES (?, ?, ?, ?, ?, ?, ?)", ("a1", "exp", "token-1", 1, "sequence-a", "schedule-v1", "2026-01-01T00:00:00+00:00"))
                db.commit()

            storage = ReceiverStorage(data_dir)
            with closing(sqlite3.connect(db_path)) as db:
                columns = {row[1] for row in db.execute("PRAGMA table_info(assignments)")}
                row = db.execute("SELECT assignment_mode, requested_sequence_id, replacement_attempt, rotation_index FROM assignments WHERE assignment_id = 'a1'").fetchone()
            self.assertTrue({"assignment_mode", "requested_sequence_id", "replacement_attempt", "rotation_index"} <= columns)
            self.assertEqual(row, ("automatic", None, 0, 0))
            next_assignment = storage.allocate_assignment("exp", "token-2", "schedule-v1", ["sequence-a", "sequence-b"])
            self.assertEqual(next_assignment.rotation_index, 1)
    def test_deferred_submit_keeps_spool_until_session_archive(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            backend = ToggleArchiveBackend()
            storage = ReceiverStorage(data_dir, archive_backend=backend, delete_local_after_success=True, archive_on_submit=False)

            stored = storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha")

            self.assertEqual(stored.archive_status, "pending")
            self.assertTrue((data_dir / "spool" / stored.id).exists())
            self.assertEqual(backend.calls, [])

            backend.fail = False
            result = storage.archive_session("layout_task_v1", "P001", "S001")

            self.assertTrue(result.ok)
            self.assertFalse((data_dir / "spool" / stored.id).exists())
            self.assertEqual(len(backend.calls), 1)
            self.assertTrue(backend.calls[0][1].endswith(f"/P001/S001/{stored.id}"))
            with closing(sqlite3.connect(data_dir / "submissions.sqlite")) as db:
                self.assertEqual(db.execute("SELECT archive_status FROM submissions").fetchone(), ("archived",))
            metadata = json.loads((data_dir / "submissions.jsonl").read_text(encoding="utf-8").splitlines()[0])
            self.assertEqual(metadata["archive_status"], "archived")
            self.assertTrue(all(file_info["archive_status"] == "archived" for file_info in metadata["files"]))

    def test_session_archive_is_idempotent_after_success(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            backend = ToggleArchiveBackend()
            storage = ReceiverStorage(data_dir, archive_backend=backend, delete_local_after_success=True, archive_on_submit=False)
            storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha")
            backend.fail = False

            first = storage.archive_session("layout_task_v1", "P001", "S001")
            second = storage.archive_session("layout_task_v1", "P001", "S001")

            self.assertTrue(first.ok)
            self.assertTrue(second.ok)
            self.assertEqual(len(backend.calls), 1)

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

            for file_info, source in zip(manifest["files"], valid_submission().files):
                archived_bytes = (archive_dir / file_info["archive_filename"]).read_bytes()
                self.assertEqual(archived_bytes, source.data.encode("utf-8"))
                self.assertEqual(hashlib.sha256(archived_bytes).hexdigest(), file_info["sha256"])
                self.assertEqual(len(archived_bytes), file_info["size_bytes"])

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

    def test_archive_exception_records_failed_submission_for_retry(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            storage = ReceiverStorage(data_dir, archive_backend=RaisingArchiveBackend(), delete_local_after_success=True)

            stored = storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha")

            self.assertEqual(stored.archive_status, "failed")
            self.assertTrue((data_dir / "spool" / stored.id).exists())
            with closing(sqlite3.connect(data_dir / "submissions.sqlite")) as db:
                self.assertEqual(db.execute("SELECT archive_status FROM submissions WHERE id = ?", (stored.id,)).fetchone(), ("failed",))
                self.assertEqual(db.execute("SELECT archive_status FROM submission_files").fetchall(), [("failed",), ("failed",)])

            lines = (data_dir / "submissions.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 1)
            self.assertEqual(json.loads(lines[0])["archive_error"], "backend exploded")

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

    def test_partial_metadata_archive_retries_only_failed_target(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            jianguoyun = ToggleTarget("jianguoyun")
            sciebo = ToggleTarget("sciebo")
            jianguoyun.fail = False
            backend = MultiArchiveBackend({"jianguoyun": jianguoyun, "sciebo": sciebo})
            storage = ReceiverStorage(
                data_dir,
                metadata_archive_backend=backend,
                metadata_delete_local_after_upload=True,
            )
            storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha")

            first = storage.archive_metadata(label="metadata-test", keep_local=0)

            self.assertTrue(first.local_kept)
            self.assertTrue(first.local_path.exists())
            sciebo.fail = False
            second = storage.archive_metadata(label="metadata-test", keep_local=0)

            self.assertFalse(second.local_kept)
            self.assertFalse(second.local_path.exists())
            self.assertEqual(len(jianguoyun.calls), 1)
            self.assertEqual(len(sciebo.calls), 2)
            self.assertEqual((data_dir / "submissions.jsonl").read_text(encoding="utf-8"), "")

    def test_metadata_retry_does_not_clear_new_submissions(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            jianguoyun = ToggleTarget("jianguoyun")
            sciebo = ToggleTarget("sciebo")
            jianguoyun.fail = False
            backend = MultiArchiveBackend({"jianguoyun": jianguoyun, "sciebo": sciebo})
            storage = ReceiverStorage(
                data_dir,
                metadata_archive_backend=backend,
                metadata_delete_local_after_upload=True,
            )

            first = storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha-1")
            storage.archive_metadata(label="metadata-test", keep_local=0)
            second = storage.save_submission(valid_submission(), "127.0.0.1", "unit-test", "body-sha-2")

            sciebo.fail = False
            retried = storage.archive_metadata(label="metadata-test", keep_local=0)

            self.assertFalse(retried.local_kept)
            with closing(sqlite3.connect(data_dir / "submissions.sqlite")) as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone(), (2,))
            lines = (data_dir / "submissions.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 2)
            self.assertEqual({json.loads(line)["id"] for line in lines}, {first.id, second.id})

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
