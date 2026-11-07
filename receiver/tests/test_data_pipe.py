import json
import multiprocessing
import os
import sqlite3
import subprocess
import tempfile
import threading
import time
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import Mock, patch

from app.archive import ArchiveResult, LocalArchiveBackend, MultiArchiveBackend, RcloneArchiveBackend
from app.config import ReceiverConfig
from app.models import ASSIGNMENT_FIELDS, IDENTITY_FIELDS, ValidationError, validate_submission
from app.server import create_server
from app.storage import ReceiverStorage
import test_server
from test_storage import submit_v2, v2_payload


def metadata_payload(assignment):
    payload = v2_payload(assignment, kind="final")
    payload["submission_kind"] = "metadata"
    content = {"schema": "layouttask.session-metadata.v1",
               **{field: payload[field] for field in IDENTITY_FIELDS},
               "prolific_id": "prolific-test", "participant_profile": {
                   "participant_age": 32, "participant_sex_assigned_at_birth": "female",
                   "requires_corrective_eyewear": True},
               "consent": {"consent_version": "informed-consent-2026-10-13-v2", "locale": "en-US",
                           "consented_at": "2026-11-07T12:00:00.000Z", "signature_method": "checkbox_confirmation",
                           "voluntary_participation_confirmed": True, "questions_answered_confirmed": True,
                           "prestudy_document_confirmed": True, "withdrawal_right_understood_confirmed": True,
                           "developer_mode": False}}
    payload["files"] = [{"filename": "layouttask_session_metadata_S1.json",
                         "content_type": "application/json", "data": json.dumps(content)}]
    return payload


def crash_after_archived_commit(data_dir, target_names, after_jsonl):
    class ExitStorage(ReceiverStorage):
        def _update_jsonl_submission(self, submission_id, archive_status, archive_uri, archive_error, target_results):
            if archive_status == "archived" and not after_jsonl:
                os._exit(74)
            super()._update_jsonl_submission(submission_id, archive_status, archive_uri, archive_error, target_results)
            if archive_status == "archived":
                os._exit(75)

    backend = MultiArchiveBackend({name: LocalArchiveBackend(data_dir / name) for name in target_names})
    ExitStorage(data_dir / "receiver", archive_backend=backend, archive_on_submit=False).retry_pending()


class ReliableDataPipeTests(unittest.TestCase):
    def test_worker_finishes_archived_spool_after_abrupt_exit_without_new_cloud_obligations(self):
        from app.archive_worker import ArchiveWorker

        for target_names in (("jianguoyun", "sciebo"), ("jianguoyun",)):
            for after_jsonl in (False, True):
                with self.subTest(targets=target_names, after_jsonl=after_jsonl), tempfile.TemporaryDirectory() as directory:
                    root = Path(directory)
                    backend = MultiArchiveBackend({name: LocalArchiveBackend(root / name) for name in target_names})
                    storage = ReceiverStorage(root / "receiver", archive_backend=backend, archive_on_submit=False)
                    assignment = storage.allocate_assignment("layout_task_v1", "first", "s1", ["1"])
                    history = submit_v2(storage, v2_payload(assignment, session_id="old-session"))
                    self.assertEqual(storage.retry_pending(), 1)
                    saved = submit_v2(storage, v2_payload(assignment))
                    expected_files = {path.name: path.read_bytes() for path in (storage.spool_dir / saved.id).iterdir()}
                    child = multiprocessing.get_context("spawn").Process(
                        target=crash_after_archived_commit, args=(root, target_names, after_jsonl))
                    child.start()
                    try:
                        child.join(10)
                        self.assertEqual(child.exitcode, 75 if after_jsonl else 74)
                    finally:
                        if child.is_alive():
                            child.terminate()
                            child.join(5)
                        child.close()
                    self.assertEqual(storage._submission_status(saved.id), "archived")
                    self.assertTrue((storage.spool_dir / saved.id).exists())
                    lines = storage.jsonl_path.read_text(encoding="utf-8").splitlines()
                    crashed_index = next(json.loads(line) for line in lines if json.loads(line)["id"] == saved.id)
                    self.assertEqual(crashed_index["archive_status"], "archived" if after_jsonl else "partial" if len(target_names) == 2 else "pending")
                    history_line = json.dumps(json.loads(lines[0]), separators=(",", ":")) + "  "
                    storage.jsonl_path.write_text(history_line + "\n" + "\n".join(lines[1:]) + "\n", encoding="utf-8", newline="\n")
                    with closing(sqlite3.connect(storage.sqlite_path)) as db:
                        recorded_targets = db.execute("SELECT * FROM archive_targets ORDER BY submission_id, target_name").fetchall()
                        assignments = db.execute("SELECT * FROM assignments").fetchall()
                        historical_rows = {
                            table: db.execute(f"SELECT * FROM {table} WHERE {key} = ?", (history.id,)).fetchall()
                            for table, key in (("submissions", "id"), ("submission_files", "submission_id"))}
                    targets = {name: Mock(wraps=LocalArchiveBackend(root / name)) for name in ("jianguoyun", "sciebo")}
                    recovered = ReceiverStorage(root / "receiver", archive_backend=MultiArchiveBackend(targets), archive_on_submit=False)
                    worker = ArchiveWorker(recovered, interval_seconds=0.02)
                    worker.start()
                    try:
                        deadline = time.monotonic() + 3
                        while (recovered.spool_dir / saved.id).exists() and time.monotonic() < deadline:
                            time.sleep(0.01)
                        self.assertFalse((recovered.spool_dir / saved.id).exists())
                    finally:
                        worker.stop()
                    self.assertEqual(recovered.retry_pending(), 0)
                    self.assertTrue(all(target.archive.call_count == 0 for target in targets.values()))
                    self.assertEqual(list(recovered.spool_dir.iterdir()), [])
                    lines = recovered.jsonl_path.read_text(encoding="utf-8").splitlines()
                    self.assertEqual(lines[0], history_line)
                    index = next(json.loads(line) for line in lines if json.loads(line)["id"] == saved.id)
                    self.assertEqual(index["archive_status"], "archived")
                    self.assertEqual({item["target"] for item in index["archive_targets"]}, set(target_names))
                    self.assertTrue(all(item["ok"] for item in index["archive_targets"]))
                    self.assertTrue(all(file["archive_status"] == "archived" and file["local_path"] is None
                                        and file["archive_uri"] for file in index["files"]))
                    with closing(sqlite3.connect(recovered.sqlite_path)) as db:
                        self.assertEqual(db.execute("SELECT * FROM archive_targets ORDER BY submission_id, target_name").fetchall(), recorded_targets)
                        self.assertEqual(db.execute("SELECT * FROM assignments").fetchall(), assignments)
                        for table, rows in historical_rows.items():
                            key = "id" if table == "submissions" else "submission_id"
                            self.assertEqual(db.execute(f"SELECT * FROM {table} WHERE {key} = ?", (history.id,)).fetchall(), rows)
                    for name in target_names:
                        archive = root / name / "layout_task_v1" / "P47" / "S1" / saved.id
                        self.assertEqual({path.name: path.read_bytes() for path in archive.iterdir()}, expected_files)
                    if "sciebo" not in target_names:
                        self.assertFalse((root / "sciebo").exists())

    def test_metadata_rejects_incomplete_or_invalid_content_before_accepting_correct_retry(self):
        invalid_values = {
            ("prolific_id",): [None, "", "  ", 47],
            ("participant_profile",): [None, [], {}, {"age": 32, "sex_assigned_at_birth": "female", "corrective_eyewear": True}],
            ("participant_profile", "participant_age"): [None, True, 32.5, "32"],
            ("participant_profile", "participant_sex_assigned_at_birth"): [None, "", "other", True, []],
            ("participant_profile", "requires_corrective_eyewear"): [None, 0, "false"],
            ("consent",): [None, [], {}, {"accepted": True}],
            ("consent", "consent_version"): [None, "", "unknown", []],
            ("consent", "locale"): [None, "en", []],
            ("consent", "consented_at"): [None, "", "  ", 123],
            ("consent", "signature_method"): [None, "signature", []],
            ("consent", "developer_mode"): [None, 0, "false"],
        }
        for field in ("voluntary_participation_confirmed", "questions_answered_confirmed",
                      "prestudy_document_confirmed", "withdrawal_right_understood_confirmed"):
            invalid_values[("consent", field)] = [None, False, 1, "true"]
        for path, values in invalid_values.items():
            for missing, value in [(True, None), *((False, value) for value in values)]:
                with self.subTest(path=path, missing=missing, value=value), tempfile.TemporaryDirectory() as directory:
                    storage = ReceiverStorage(Path(directory), archive_on_submit=False)
                    assignment = storage.allocate_assignment("layout_task_v1", "first", "s1", ["1"])
                    payload = metadata_payload(assignment)
                    content = json.loads(payload["files"][0]["data"])
                    parent = content if len(path) == 1 else content[path[0]]
                    if missing:
                        del parent[path[-1]]
                    else:
                        parent[path[-1]] = value
                    payload["files"][0]["data"] = json.dumps(content)
                    config = ReceiverConfig(data_dir=Path(directory), allowed_origins=["https://pages.example"], submit_token=None)
                    server = create_server(("127.0.0.1", 0), config, storage)
                    try:
                        status, body = test_server.ServerTests().post_in_process(server, "/submit", payload)
                        self.assertEqual((status, body.get("error")), (400, "invalid_metadata_file"))
                        self.assertEqual(storage.jsonl_path.read_bytes(), b"")
                        self.assertFalse(storage.spool_dir.exists())
                        with closing(sqlite3.connect(storage.sqlite_path)) as db:
                            self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone(), (0,))
                            self.assertEqual(db.execute("SELECT participant_id FROM assignments").fetchone(), (None,))
                        correct = metadata_payload(assignment)
                        accepted = test_server.ServerTests().post_in_process(server, "/submit", correct)
                        duplicate = test_server.ServerTests().post_in_process(server, "/submit", correct)
                        self.assertEqual((accepted[0], duplicate[0]), (201, 200))
                        self.assertEqual(accepted[1]["submission_id"], duplicate[1]["submission_id"])
                    finally:
                        server.server_close()

    def test_metadata_accepts_actual_consent_variants_without_extra_participant_policy(self):
        for version, locale, sex, developer_mode in (
            ("informed-consent-2026-10-03-v1", "zh-CN", "male", True),
            ("informed-consent-2026-10-13-v2", "en-US", "female", False),
        ):
            with self.subTest(version=version), tempfile.TemporaryDirectory() as directory:
                storage = ReceiverStorage(Path(directory), archive_on_submit=False)
                assignment = storage.allocate_assignment("layout_task_v1", "first", "s1", ["1"])
                payload = metadata_payload(assignment)
                content = json.loads(payload["files"][0]["data"])
                content["participant_profile"].update(participant_age=17, participant_sex_assigned_at_birth=sex,
                                                      requires_corrective_eyewear=False)
                content["consent"].update(consent_version=version, locale=locale, developer_mode=developer_mode)
                payload["files"][0]["data"] = json.dumps(content)
                self.assertFalse(submit_v2(storage, payload).duplicate)

    def test_session_rejects_cross_kind_assignment_changes_in_both_arrival_orders(self):
        for first_kind, second_kind in (("metadata", "trial"), ("trial", "metadata"),
                                        ("metadata", "final"), ("final", "metadata")):
            with self.subTest(first=first_kind, second=second_kind), tempfile.TemporaryDirectory() as directory:
                storage = ReceiverStorage(Path(directory), archive_on_submit=False)
                first_assignment = storage.allocate_assignment("layout_task_v1", "first", "s1", ["1", "2"])
                other_assignment = storage.allocate_assignment("layout_task_v1", "other", "s1", ["1", "2"], "2")
                payload = metadata_payload(first_assignment) if first_kind == "metadata" else v2_payload(first_assignment, kind=first_kind)
                saved = submit_v2(storage, payload)
                original_index = storage.jsonl_path.read_bytes()
                original_spool = {path.name: path.read_bytes() for path in (storage.spool_dir / saved.id).iterdir()}
                with closing(sqlite3.connect(storage.sqlite_path)) as db:
                    original_rows = {table: db.execute(f"SELECT * FROM {table}").fetchall()
                                     for table in ("submissions", "submission_files", "assignments", "archive_targets")}
                config = ReceiverConfig(data_dir=Path(directory), allowed_origins=["https://pages.example"], submit_token=None)
                server = create_server(("127.0.0.1", 0), config, storage)
                try:
                    conflicting = metadata_payload(other_assignment) if second_kind == "metadata" else v2_payload(other_assignment, kind=second_kind)
                    status, body = test_server.ServerTests().post_in_process(server, "/submit", conflicting)
                    self.assertEqual((status, body.get("error")), (409, "submission_conflict"))
                finally:
                    server.server_close()
                self.assertEqual(storage.jsonl_path.read_bytes(), original_index)
                self.assertEqual({path.name: path.read_bytes() for path in (storage.spool_dir / saved.id).iterdir()}, original_spool)
                self.assertEqual([path.name for path in storage.spool_dir.iterdir()], [saved.id])
                with closing(sqlite3.connect(storage.sqlite_path)) as db:
                    for table, rows in original_rows.items():
                        self.assertEqual(db.execute(f"SELECT * FROM {table}").fetchall(), rows)
                self.assertEqual(submit_v2(storage, payload).id, saved.id)
                matching = metadata_payload(first_assignment) if second_kind == "metadata" else v2_payload(first_assignment, kind=second_kind)
                self.assertFalse(submit_v2(storage, matching).duplicate)

    def test_cross_kind_assignment_is_checked_after_concurrent_preflight_validation(self):
        for first_kind in ("metadata", "trial"):
            with self.subTest(first=first_kind), tempfile.TemporaryDirectory() as directory:
                storage = ReceiverStorage(Path(directory), archive_on_submit=False)
                late = ReceiverStorage(Path(directory), archive_on_submit=False)
                first_assignment = storage.allocate_assignment("layout_task_v1", "first", "s1", ["1", "2"])
                other_assignment = storage.allocate_assignment("layout_task_v1", "other", "s1", ["1", "2"])
                first = metadata_payload(first_assignment) if first_kind == "metadata" else v2_payload(first_assignment)
                second = v2_payload(other_assignment) if first_kind == "metadata" else metadata_payload(other_assignment)
                validated, release = threading.Event(), threading.Event()
                validate = late._validate_v2
                outcome = []

                def pause_after_validation(submission):
                    validate(submission)
                    validated.set()
                    if not release.wait(5):
                        raise TimeoutError("preflight test release timed out")

                def publish():
                    try:
                        outcome.append(submit_v2(late, second))
                    except ValidationError as error:
                        outcome.append(error.code)

                with patch.object(late, "_validate_v2", side_effect=pause_after_validation):
                    thread = threading.Thread(target=publish)
                    thread.start()
                    try:
                        self.assertTrue(validated.wait(2))
                        saved = submit_v2(storage, first)
                    finally:
                        release.set()
                        thread.join(6)
                    self.assertFalse(thread.is_alive())
                self.assertEqual(outcome, ["submission_conflict"])
                self.assertEqual([path.name for path in storage.spool_dir.iterdir()], [saved.id])
                with closing(sqlite3.connect(storage.sqlite_path)) as db:
                    self.assertEqual(db.execute("SELECT participant_id FROM assignments ORDER BY participant_number").fetchall(), [("P47",), (None,)])

    def test_cross_kind_assignment_comparison_includes_every_persisted_field(self):
        differences = {"assignment_id": "other", "participant_number": 47, "sequence_id": "2",
                       "schedule_version": "s2", "assignment_mode": "replacement", "requested_sequence_id": "2",
                       "replacement_attempt": 1, "rotation_index": None}
        for first_kind in ("metadata", "trial"):
            for field, changed in differences.items():
                with self.subTest(first=first_kind, field=field), tempfile.TemporaryDirectory() as directory:
                    storage = ReceiverStorage(Path(directory), archive_on_submit=False)
                    assignment = storage.allocate_assignment("layout_task_v1", "first", "s1", ["1"])
                    first = metadata_payload(assignment) if first_kind == "metadata" else v2_payload(assignment)
                    saved = submit_v2(storage, first)
                    with closing(sqlite3.connect(storage.sqlite_path)) as db:
                        db.execute(f"UPDATE submissions SET {field} = ? WHERE id = ?", (changed, saved.id))
                        db.commit()
                        original = db.execute("SELECT * FROM submissions").fetchall()
                    incoming = v2_payload(assignment) if first_kind == "metadata" else metadata_payload(assignment)
                    with self.assertRaisesRegex(ValidationError, "submission_conflict"):
                        submit_v2(storage, incoming)
                    with closing(sqlite3.connect(storage.sqlite_path)) as db:
                        self.assertEqual(db.execute("SELECT * FROM submissions").fetchall(), original)

    def test_complete_24_trial_workload_keeps_every_original_byte_in_both_archives(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            targets = {name: LocalArchiveBackend(root / name) for name in ("jianguoyun", "sciebo")}
            storage = ReceiverStorage(root / "receiver", archive_backend=MultiArchiveBackend(targets), archive_on_submit=False)
            assignment = storage.allocate_assignment("layout_task_v1", "token", "s1", ["1"])
            payloads = [metadata_payload(assignment)]
            for index in range(25):
                payload = v2_payload(assignment)
                payload.update(trial_session_id=f"T{index}", trial_type="tutorial" if index == 0 else "formal",
                               trial_index=None if index == 0 else index,
                               presentation_id=None if index == 0 else f"p{index}")
                backup = json.loads(payload["files"][0]["data"])
                for field in ("trial_session_id", "trial_type", "trial_index", "presentation_id"):
                    backup[field] = payload[field]
                backup["session"] = payload["trial_session_id"]
                payload["files"][0]["data"] = json.dumps(backup)
                payloads.append(payload)
            payloads.append(v2_payload(assignment, kind="final"))
            expected = [(submit_v2(storage, payload).id, payload["files"]) for payload in payloads]
            started = time.monotonic()
            self.assertEqual(storage.queue_archive("layout_task_v1", "P47", "S1").archive_status, "queued")
            self.assertLess(time.monotonic() - started, 1)
            self.assertEqual(storage.retry_pending(), 27)
            self.assertEqual(list(storage.spool_dir.iterdir()), [])
            for name in targets:
                for submission_id, files in expected:
                    archive = root / name / "layout_task_v1" / "P47" / "S1" / submission_id
                    for index, file in enumerate(files, 1):
                        self.assertEqual((archive / f"f{index:03d}__{file['filename']}").read_bytes(), file["data"].encode("utf-8"))
            self.assertEqual(storage.queue_archive("layout_task_v1", "P47", "S1").archive_status, "archived")

    def test_adding_second_cloud_preserves_already_archived_history_and_assignment_counter(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            storage = ReceiverStorage(root, archive_backend=MultiArchiveBackend({"jianguoyun": LocalArchiveBackend(root / "old-cloud")}), archive_on_submit=False)
            assignment = storage.allocate_assignment("layout_task_v1", "token", "s1", ["1", "2"])
            saved = submit_v2(storage, v2_payload(assignment))
            self.assertEqual(storage.retry_pending(), 1)
            old_jsonl = storage.jsonl_path.read_bytes()
            recovered = ReceiverStorage(root, archive_backend=MultiArchiveBackend({
                "jianguoyun": LocalArchiveBackend(root / "old-cloud"), "sciebo": LocalArchiveBackend(root / "new-cloud")}), archive_on_submit=False)
            self.assertEqual(recovered.retry_pending(), 0)
            self.assertEqual(recovered.jsonl_path.read_bytes(), old_jsonl)
            with closing(sqlite3.connect(recovered.sqlite_path)) as db:
                self.assertEqual(db.execute("SELECT target_name FROM archive_targets WHERE submission_id = ?", (saved.id,)).fetchall(), [("jianguoyun",)])
                self.assertEqual(db.execute("SELECT COUNT(*), MAX(participant_number) FROM assignments").fetchone(), (1, 1))

    def test_metadata_validates_assignment_and_retries_without_another_slot(self):
        with tempfile.TemporaryDirectory() as directory:
            storage = ReceiverStorage(Path(directory), archive_on_submit=False)
            assignment = storage.allocate_assignment("layout_task_v1", "token", "s1", ["1", "2"])
            payload = metadata_payload(assignment)
            first = submit_v2(storage, payload)
            duplicate = submit_v2(storage, payload)
            self.assertEqual((duplicate.id, duplicate.duplicate), (first.id, True))
            submit_v2(storage, v2_payload(assignment))
            with closing(sqlite3.connect(storage.sqlite_path)) as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM assignments").fetchone()[0], 1)
                rows = db.execute("SELECT submission_kind, participant_number, sequence_id FROM submissions ORDER BY rowid").fetchall()
                self.assertEqual(rows, [("metadata", 1, "1"), ("trial", 1, "1")])
            changed = metadata_payload(assignment)
            content = json.loads(changed["files"][0]["data"])
            content["participant_profile"]["participant_age"] = 33
            changed["files"][0]["data"] = json.dumps(content)
            with self.assertRaisesRegex(ValidationError, "submission_conflict"):
                submit_v2(storage, changed)

    def test_metadata_rejects_missing_assignment_trial_fields_and_invalid_json_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            storage = ReceiverStorage(Path(directory), archive_on_submit=False)
            assignment = storage.allocate_assignment("layout_task_v1", "token", "s1", ["1"])
            for field in ASSIGNMENT_FIELDS:
                payload = metadata_payload(assignment)
                del payload[field]
                with self.subTest(missing=field), self.assertRaises(ValidationError):
                    submit_v2(storage, payload)
            for field in ("trial_session_id", "encoded", "presentation_id"):
                payload = metadata_payload(assignment)
                payload[field] = "bad"
                with self.subTest(trial_field=field), self.assertRaises(ValidationError):
                    submit_v2(storage, payload)
            for data in ("not json", "[]", '{}', json.dumps({"schema": "layouttask.session-metadata.v1"})):
                payload = metadata_payload(assignment)
                payload["files"][0]["data"] = data
                with self.subTest(data=data), self.assertRaises(ValidationError):
                    submit_v2(storage, payload)
            payload = metadata_payload(assignment)
            content = json.loads(payload["files"][0]["data"])
            content["participant_number"] = 999
            payload["files"][0]["data"] = json.dumps(content)
            with self.assertRaisesRegex(ValidationError, "identity_mismatch"):
                submit_v2(storage, payload)

    def test_submit_does_not_acknowledge_a_failed_disk_sync(self):
        with tempfile.TemporaryDirectory() as directory:
            storage = ReceiverStorage(Path(directory), archive_on_submit=False)
            assignment = storage.allocate_assignment("layout_task_v1", "token", "s1", ["1"])
            with patch("app.storage.os.fsync", side_effect=OSError("disk sync failed")):
                with self.assertRaisesRegex(OSError, "disk sync failed"):
                    submit_v2(storage, v2_payload(assignment))
            with closing(sqlite3.connect(storage.sqlite_path)) as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone()[0], 0)

    def test_archive_ack_does_not_wait_for_network_or_session_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            entered, release = threading.Event(), threading.Event()

            class BlockedArchive:
                def archive(self, spool_dir, archive_key):
                    entered.set()
                    if not release.wait(5):
                        raise TimeoutError("test archive blocked")
                    return ArchiveResult(ok=True, archive_uri=f"local://{archive_key}")

            storage = ReceiverStorage(Path(directory), archive_backend=BlockedArchive(), archive_on_submit=False)
            assignment = storage.allocate_assignment("layout_task_v1", "token", "s1", ["1"])
            submit_v2(storage, v2_payload(assignment))
            thread = threading.Thread(target=storage.retry_pending)
            thread.start()
            self.assertTrue(entered.wait(2))
            config = ReceiverConfig(data_dir=Path(directory), allowed_origins=[], submit_token=None)
            server = create_server(("127.0.0.1", 0), config, storage)
            try:
                started = time.monotonic()
                status, body = test_server.ServerTests().post_in_process(server, "/archive", {
                    "schema": "layouttask.receiver.archive.v1", "experiment_id": "layout_task_v1",
                    "participant_id": "P47", "session_id": "S1"})
                self.assertLess(time.monotonic() - started, 1)
                self.assertEqual((status, body["ok"], body["archive_status"]), (202, True, "queued"))
                self.assertTrue(thread.is_alive())
            finally:
                release.set()
                thread.join(6)
                server.server_close()

    def test_offline_target_is_attempted_once_per_session_pass_and_other_target_continues(self):
        with tempfile.TemporaryDirectory() as directory:
            bad = Mock()
            bad.archive.return_value = ArchiveResult(ok=False, error="offline")
            good = Mock(wraps=LocalArchiveBackend(Path(directory) / "good"))
            storage = ReceiverStorage(Path(directory), archive_backend=MultiArchiveBackend({
                "jianguoyun": bad, "sciebo": good}), archive_on_submit=False)
            assignment = storage.allocate_assignment("layout_task_v1", "token", "s1", ["1"])
            saved = [submit_v2(storage, v2_payload(assignment)), submit_v2(storage, v2_payload(assignment, kind="final"))]
            self.assertEqual(storage.retry_pending(), 0)
            self.assertEqual((bad.archive.call_count, good.archive.call_count), (1, 2))
            self.assertTrue(all((storage.spool_dir / item.id).exists() for item in saved))

    def test_missing_spool_is_recorded_as_failure_instead_of_left_pending(self):
        import shutil

        with tempfile.TemporaryDirectory() as directory:
            storage = ReceiverStorage(Path(directory), archive_backend=LocalArchiveBackend(Path(directory) / "cloud"), archive_on_submit=False)
            assignment = storage.allocate_assignment("layout_task_v1", "token", "s1", ["1"])
            saved = submit_v2(storage, v2_payload(assignment))
            shutil.rmtree(storage.spool_dir / saved.id)
            storage.retry_pending()
            self.assertEqual(storage._submission_status(saved.id), "failed")
            with closing(sqlite3.connect(storage.sqlite_path)) as db:
                self.assertIn("missing spool", db.execute("SELECT error FROM archive_targets WHERE submission_id = ?", (saved.id,)).fetchone()[0])

    def test_worker_recovers_after_restart_and_never_reuploads_successful_target(self):
        from app.archive_worker import ArchiveWorker

        with tempfile.TemporaryDirectory() as directory:
            good = Mock(wraps=LocalArchiveBackend(Path(directory) / "good"))
            bad = Mock()
            bad.archive.return_value = ArchiveResult(ok=False, error="offline")
            backend = MultiArchiveBackend({"jianguoyun": good, "sciebo": bad})
            storage = ReceiverStorage(Path(directory), archive_backend=backend, archive_on_submit=False)
            assignment = storage.allocate_assignment("layout_task_v1", "token", "s1", ["1"])
            saved = submit_v2(storage, v2_payload(assignment))
            storage.retry_pending()
            self.assertEqual(storage._submission_status(saved.id), "partial")
            self.assertTrue((storage.spool_dir / saved.id).exists())
            recovered = ReceiverStorage(Path(directory), archive_backend=backend, archive_on_submit=False)
            bad.archive.side_effect = LocalArchiveBackend(Path(directory) / "recovered").archive
            worker = ArchiveWorker(recovered, interval_seconds=0.02)
            worker.start()
            try:
                deadline = time.monotonic() + 3
                while (recovered.spool_dir / saved.id).exists() and time.monotonic() < deadline:
                    time.sleep(0.01)
                self.assertEqual(recovered._submission_status(saved.id), "archived")
                self.assertFalse((recovered.spool_dir / saved.id).exists())
                self.assertEqual(good.archive.call_count, 1)
                self.assertEqual(bad.archive.call_count, 2)
            finally:
                worker.stop()

    def test_rclone_reuses_successful_ancestor_directories_between_submissions(self):
        run = Mock(return_value=subprocess.CompletedProcess([], 0, "", ""))
        backend = RcloneArchiveBackend("remote:submissions", run_impl=run)
        for submission in ("first", "second"):
            self.assertTrue(backend.archive(Path("spool"), f"experiment/P/S/{submission}").ok)
        directories = [call.args[0][2] for call in run.call_args_list if call.args[0][1] == "mkdir"]
        self.assertEqual(directories, ["remote:submissions", "remote:submissions/experiment",
                                      "remote:submissions/experiment/P", "remote:submissions/experiment/P/S",
                                      "remote:submissions/experiment/P/S/first", "remote:submissions/experiment/P/S/second"])

    def test_rclone_timeout_is_a_retryable_result(self):
        run = Mock(side_effect=subprocess.TimeoutExpired("rclone", 90))
        result = RcloneArchiveBackend("remote:submissions", run_impl=run).archive(Path("spool"), "exp/P/S/one")
        self.assertFalse(result.ok)
        self.assertIn("timed out", result.error)


if __name__ == "__main__":
    unittest.main()
