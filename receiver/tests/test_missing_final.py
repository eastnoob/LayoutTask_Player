import json
import multiprocessing
import os
import sqlite3
import tempfile
import threading
import time
import unittest
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from app.archive import ArchiveResult, LocalArchiveBackend, MultiArchiveBackend
from app.config import ReceiverConfig
from app.server import create_server
from app.storage import ReceiverStorage
import test_server
from test_storage import submit_v2, v2_payload


def formal_payload(assignment, index, participant="P47", session="S1", trial_id=None):
    payload = v2_payload(assignment, participant_id=participant, session_id=session)
    payload.update(trial_session_id=trial_id or f"T{index}",
                   trial_type="tutorial" if index == 0 else "formal",
                   trial_index=None if index == 0 else index,
                   presentation_id=None if index == 0 else f"presentation-{trial_id or index}")
    backup = json.loads(payload["files"][0]["data"])
    for key in ("trial_session_id", "trial_type", "trial_index", "presentation_id"):
        backup[key] = payload[key]
    backup["session"] = payload["trial_session_id"]
    payload["files"][0]["data"] = json.dumps(backup)
    return payload


def final_payload(assignment, n=3, participant="P47", session="S1", valid=True):
    payload = v2_payload(assignment, kind="final", participant_id=participant, session_id=session)
    if valid:
        identity = ("experiment_id", "participant_id", "session_id", "assignment_id", "participant_number",
                    "sequence_id", "schedule_version", "assignment_mode", "requested_sequence_id",
                    "replacement_attempt", "rotation_index")
        prefix = ",".join("" if payload[key] is None else str(payload[key]) for key in identity)
        payload["files"][1]["data"] = ",".join((*identity, "trial_index", "trial_type")) + "\n" + "".join(
            f"{prefix},{index},formal\n" for index in range(1, n + 1))
    return payload


def session_state(storage, participant="P47", session="S1", experiment="exp"):
    with closing(sqlite3.connect(storage.sqlite_path)) as db:
        db.row_factory = sqlite3.Row
        row = db.execute("SELECT * FROM session_finalizations WHERE experiment_id=? AND participant_id=? AND session_id=?",
                         (experiment, participant, session)).fetchone()
        return dict(row) if row else {}


def fallback_process(data_dir, archive_root, phase, entered=None, release=None, ready=None, output=None):
    targets = {name: LocalArchiveBackend(Path(archive_root) / name) for name in ("jianguoyun", "sciebo")}
    original_copy = targets["jianguoyun"].archive

    def copy(spool_dir, archive_key):
        if entered is not None:
            entered.set()
        if release is not None and not release.wait(15):
            raise RuntimeError("test process barrier expired")
        result = original_copy(spool_dir, archive_key)
        if phase == "cloud-before-db":
            os._exit(43)
        return result

    targets["jianguoyun"].archive = copy
    storage = ReceiverStorage(Path(data_dir), archive_backend=MultiArchiveBackend(targets), archive_on_submit=False,
                              expected_formal_trial_count=3, require_tutorial=True, schedule_version="fallback-v1")
    qualify = storage._archive_submission_ids_locked

    def after_proof(*key):
        result = qualify(*key)
        os._exit(42)
        return result

    if phase == "before-proof":
        storage._session_manifest = lambda *args: os._exit(41)
    elif phase == "after-proof":
        storage._archive_submission_ids_locked = after_proof
    if ready is not None:
        ready.set()
    with patch("app.storage._utc_now", return_value="2026-11-13T12:05:00+00:00"):
        count = storage.retry_pending()
    if output is not None:
        output.put(count)


class MissingFinalTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.now = datetime(2026, 11, 13, 12, tzinfo=timezone.utc)
        clock = patch("app.storage._utc_now", side_effect=lambda: self.now.isoformat())
        clock.start()
        self.addCleanup(clock.stop)
        self.targets = {name: LocalArchiveBackend(self.root / name) for name in ("jianguoyun", "sciebo")}
        self.storage = self.reopen()

    def reopen(self, n=3):
        return ReceiverStorage(self.root / "receiver", archive_backend=MultiArchiveBackend(self.targets),
                               archive_on_submit=False, expected_formal_trial_count=n,
                               require_tutorial=True, schedule_version="fallback-v1")

    def workload(self, n=3, indices=None, metadata=True, tutorial=True, participant="P47", session="S1"):
        assignment = self.storage.allocate_assignment("exp", f"token-{participant}-{session}", "fallback-v1", ["1", "2"])
        saved = []
        if metadata:
            saved.append(submit_v2(self.storage, v2_payload(assignment, kind="metadata", participant_id=participant, session_id=session)))
        if tutorial:
            saved.append(submit_v2(self.storage, formal_payload(assignment, 0, participant, session)))
        for index in range(1, n + 1) if indices is None else indices:
            saved.append(submit_v2(self.storage, formal_payload(assignment, index, participant, session)))
        return assignment, saved

    def test_wait_origin_is_last_formal_after_durable_files_not_experiment_start(self):
        from app import storage as storage_module

        assignment, _ = self.workload(indices=[1, 2])
        self.assertIn("final_wait_started_at", session_state(self.storage))
        self.assertIsNone(session_state(self.storage)["final_wait_started_at"])
        self.now += timedelta(minutes=40)
        durable_write = storage_module._write_durable

        def slow_manifest(path, content):
            durable_write(path, content)
            if path.name == "manifest.json":
                self.now += timedelta(seconds=20)

        with patch("app.storage._write_durable", side_effect=slow_manifest):
            submit_v2(self.storage, formal_payload(assignment, 3))
        self.assertEqual(session_state(self.storage)["final_wait_started_at"], "2026-11-13T12:40:20+00:00")

    def test_wait_origin_survives_idempotent_last_trial_retry_and_restart(self):
        assignment, saved = self.workload()
        self.now += timedelta(minutes=10)
        duplicate = submit_v2(self.storage, formal_payload(assignment, 3))
        self.assertEqual(duplicate.id, saved[-1].id)
        self.storage = self.reopen()
        state = session_state(self.storage)
        self.assertIn("final_wait_started_at", state)
        self.assertEqual(state["final_wait_started_at"], "2026-11-13T12:00:00+00:00")
        with closing(sqlite3.connect(self.storage.sqlite_path)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM assignments").fetchone()[0], 1)

    def test_failed_last_trial_transaction_cannot_publish_wait_origin(self):
        assignment, _ = self.workload(indices=[1, 2])
        with closing(sqlite3.connect(self.storage.sqlite_path)) as db:
            db.execute("CREATE TRIGGER fail_last BEFORE INSERT ON submissions WHEN NEW.trial_index=3 BEGIN SELECT RAISE(ABORT, 'test rollback'); END")
            db.commit()
        with self.assertRaises(ValueError):
            submit_v2(self.storage, formal_payload(assignment, 3))
        state = session_state(self.storage)
        self.assertIn("final_wait_started_at", state)
        self.assertIsNone(state["final_wait_started_at"])
        with closing(sqlite3.connect(self.storage.sqlite_path)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions WHERE trial_index=3").fetchone()[0], 0)
            db.execute("DROP TRIGGER fail_last")
            db.commit()
        self.now += timedelta(seconds=10)
        submit_v2(self.storage, formal_payload(assignment, 3))
        self.assertEqual(session_state(self.storage)["final_wait_started_at"], self.now.isoformat())

    def test_historical_rows_and_identical_retry_do_not_guess_missing_origin(self):
        assignment, _ = self.workload()
        with closing(sqlite3.connect(self.storage.sqlite_path)) as db:
            columns = {row[1] for row in db.execute("PRAGMA table_info(session_finalizations)")}
            for column in ("final_wait_started_at", "fallback_archive_ready"):
                if column in columns:
                    db.execute(f"ALTER TABLE session_finalizations DROP COLUMN {column}")
            db.commit()
        self.storage = self.reopen()
        self.storage = self.reopen()
        self.now += timedelta(hours=5)
        submit_v2(self.storage, formal_payload(assignment, 3))
        self.assertIn("final_wait_started_at", session_state(self.storage))
        self.assertIsNone(session_state(self.storage)["final_wait_started_at"])
        self.assertEqual(self.storage.retry_pending(), 0)

    def test_wrong_schedule_cannot_start_wait_using_current_count(self):
        self.storage.schedule_version = "other-version"
        self.workload()
        self.assertIn("final_wait_started_at", session_state(self.storage))
        self.assertIsNone(session_state(self.storage)["final_wait_started_at"])

    def test_requirements_from_another_schedule_cannot_waive_this_sessions_tutorial(self):
        self.storage.schedule_version = "other-version"
        self.storage.require_tutorial = False
        assignment, _ = self.workload(indices=[1, 2], tutorial=False)
        self.storage = self.reopen()
        submit_v2(self.storage, formal_payload(assignment, 3))
        self.now += timedelta(seconds=300)
        self.assertEqual(self.storage.retry_pending(), 0)
        state = session_state(self.storage)
        self.assertEqual((state["tutorial_required"], state["fallback_archive_ready"]), (1, 0))
        submit_v2(self.storage, formal_payload(assignment, 0))
        self.assertEqual(self.storage.retry_pending(), 5)

    def test_changed_tutorial_requirement_cannot_start_or_qualify_wait(self):
        self.storage.require_tutorial = False
        assignment, _ = self.workload(indices=[1, 2], tutorial=False)
        self.storage = self.reopen()
        submit_v2(self.storage, formal_payload(assignment, 3))
        self.assertIsNone(session_state(self.storage)["final_wait_started_at"])
        with closing(sqlite3.connect(self.storage.sqlite_path)) as db:
            db.execute("UPDATE session_finalizations SET final_wait_started_at=?", (self.now.isoformat(),))
            db.commit()
        self.now += timedelta(seconds=300)
        self.assertEqual(self.storage.retry_pending(), 0)
        self.assertEqual(session_state(self.storage)["fallback_archive_ready"], 0)

    def test_24_formal_trials_qualify_at_300_not_299_and_preserve_both_cloud_bytes(self):
        self.storage = self.reopen(n=24)
        _, saved = self.workload(n=24)
        original = {item.id: {path.name: path.read_bytes() for path in (self.storage.spool_dir / item.id).iterdir()}
                    for item in saved}
        self.now += timedelta(seconds=299)
        self.assertEqual(self.storage.retry_pending(), 0)
        self.assertTrue(all(not (self.root / name).exists() for name in self.targets))
        self.now += timedelta(seconds=1)
        self.assertEqual(self.storage.retry_pending(), 26)
        state = session_state(self.storage)
        self.assertEqual((state["data_complete"], state["fallback_archive_ready"], state["archive_status"]), (0, 1, "archived"))
        self.assertIsNone(state["final_submission_id"])
        proof = json.loads(state["manifest_json"])
        self.assertEqual(set(proof["submission_ids"]), set(original))
        for name in self.targets:
            for submission_id, files in original.items():
                directory = self.root / name / "exp" / "P47" / "S1" / submission_id
                self.assertEqual({path.name: path.read_bytes() for path in directory.iterdir()}, files)
        self.assertEqual(list(self.storage.spool_dir.iterdir()), [])
        result = self.storage.queue_archive("exp", "P47", "S1")
        self.assertFalse(result.ok)
        self.assertFalse(result.data_complete)
        self.assertEqual(session_state(self.storage)["manifest_json"], state["manifest_json"])

    def test_incomplete_sessions_never_qualify_even_after_deadline(self):
        for name, kwargs in (("no-last", {"indices": [1, 2]}), ("missing-earlier", {"indices": [1, 3]}),
                             ("no-metadata", {"metadata": False}), ("no-tutorial", {"tutorial": False})):
            with self.subTest(name=name):
                self.storage = ReceiverStorage(self.root / name, archive_backend=MultiArchiveBackend(self.targets),
                                               archive_on_submit=False, expected_formal_trial_count=3,
                                               require_tutorial=True, schedule_version="fallback-v1")
                self.workload(**kwargs)
                self.now += timedelta(hours=1)
                self.assertEqual(self.storage.retry_pending(), 0)
                self.assertEqual(session_state(self.storage)["fallback_archive_ready"], 0)

    def test_late_earlier_trials_and_metadata_use_original_last_trial_origin(self):
        assignment, _ = self.workload(indices=[3], metadata=False)
        self.now += timedelta(minutes=10)
        self.assertEqual(self.storage.retry_pending(), 0)
        for index in (1, 2):
            submit_v2(self.storage, formal_payload(assignment, index))
        submit_v2(self.storage, v2_payload(assignment, kind="metadata"))
        self.assertEqual(self.storage.retry_pending(), 5)
        self.assertEqual(session_state(self.storage)["final_wait_started_at"], "2026-11-13T12:00:00+00:00")

    def test_malformed_naive_future_or_missing_wait_origin_never_qualifies(self):
        self.workload()
        self.now += timedelta(minutes=10)
        for value in ("broken", "2026-11-13T12:00:00", "2026-11-14T12:00:00+00:00", None):
            with self.subTest(value=value):
                with closing(sqlite3.connect(self.storage.sqlite_path)) as db:
                    db.execute("UPDATE session_finalizations SET final_wait_started_at=?", (value,))
                    db.commit()
                self.assertEqual(self.storage.retry_pending(), 0)
                self.assertEqual(session_state(self.storage)["fallback_archive_ready"], 0)

    def test_accepted_final_without_archive_request_takes_normal_path_without_wait(self):
        assignment, _ = self.workload()
        submit_v2(self.storage, final_payload(assignment))
        self.assertEqual(self.storage.retry_pending(), 6)
        state = session_state(self.storage)
        self.assertEqual((state["data_complete"], state["fallback_archive_ready"], state["archive_status"]), (1, 0, "archived"))

    def test_invalid_final_before_any_qualification_cannot_create_fallback(self):
        assignment, _ = self.workload()
        submit_v2(self.storage, final_payload(assignment, valid=False))
        self.now += timedelta(minutes=10)
        self.assertEqual(self.storage.retry_pending(), 0)
        self.assertEqual(session_state(self.storage)["fallback_archive_ready"], 0)
        self.assertFalse(session_state(self.storage)["data_complete"])

    def test_late_invalid_final_preserves_original_proof_and_second_cloud_retry(self):
        assignment, saved = self.workload()
        sciebo = self.targets["sciebo"]
        with patch.object(sciebo, "archive", return_value=ArchiveResult(ok=False, error="offline")):
            self.now += timedelta(seconds=300)
            self.storage.retry_pending()
        proof = session_state(self.storage)["manifest_json"]
        final = submit_v2(self.storage, final_payload(assignment, valid=False))
        self.assertFalse(self.storage.queue_archive("exp", "P47", "S1").ok)
        self.assertEqual(session_state(self.storage)["manifest_json"], proof)
        self.assertEqual(self.storage.retry_pending(), 5)
        self.assertFalse(session_state(self.storage)["data_complete"])
        for item in saved:
            for name in self.targets:
                self.assertTrue((self.root / name / "exp/P47/S1" / item.id).is_dir())
        for name in self.targets:
            self.assertFalse((self.root / name / "exp/P47/S1" / final.id).exists())
        self.assertTrue((self.storage.spool_dir / final.id).exists())

    def test_late_final_validation_exception_does_not_stop_old_valid_whitelist_retry(self):
        assignment, _ = self.workload()
        with patch.object(self.targets["sciebo"], "archive", return_value=ArchiveResult(ok=False, error="offline")):
            self.now += timedelta(seconds=300)
            self.storage.retry_pending()
        final = submit_v2(self.storage, final_payload(assignment, valid=False))
        with patch.object(self.storage, "_session_completeness_error", side_effect=RuntimeError("new-final-check-error")):
            self.assertEqual(self.storage.retry_pending(), 5)
        state = session_state(self.storage)
        self.assertIn("new-final-check-error", state["error"])
        self.assertFalse(state["data_complete"])
        self.assertEqual(self.storage._submission_status(final.id), "pending")

    def test_final_after_original_spool_cleanup_updates_aggregate_then_normal_completion(self):
        assignment, _ = self.workload()
        self.now += timedelta(seconds=300)
        self.assertEqual(self.storage.retry_pending(), 5)
        final = submit_v2(self.storage, final_payload(assignment))
        self.assertNotEqual(session_state(self.storage)["archive_status"], "archived")
        self.assertEqual(self.storage.retry_pending(), 1)
        self.assertEqual(session_state(self.storage)["data_complete"], 1)
        for name in self.targets:
            self.assertTrue((self.root / name / "exp/P47/S1" / final.id).is_dir())

    def test_final_arriving_during_upload_is_not_added_to_validated_whitelist(self):
        assignment, _ = self.workload()
        self.now += timedelta(seconds=300)
        local_archive = self.targets["jianguoyun"].archive
        arrivals = []

        def arrive_during_copy(spool_dir, archive_key):
            if not arrivals:
                arrivals.append(submit_v2(self.storage, final_payload(assignment, valid=False)))
            return local_archive(spool_dir, archive_key)

        with patch.object(self.targets["jianguoyun"], "archive", side_effect=arrive_during_copy):
            self.assertEqual(self.storage.retry_pending(), 5)
        self.assertEqual(len(arrivals), 1)
        self.assertEqual(self.storage._submission_status(arrivals[0].id), "pending")
        self.assertNotIn(arrivals[0].id, json.loads(session_state(self.storage)["manifest_json"])["submission_ids"])

    def test_same_session_final_acknowledgement_does_not_wait_for_blocked_cloud_upload(self):
        assignment, _ = self.workload()
        server = create_server(("127.0.0.1", 0), ReceiverConfig(
            data_dir=self.storage.data_dir, allowed_origins=["https://pages.example"], submit_token=None), self.storage)
        self.addCleanup(server.server_close)
        entered, release = threading.Event(), threading.Event()
        local_archive = self.targets["jianguoyun"].archive

        def blocked_copy(spool_dir, archive_key):
            entered.set()
            if not release.wait(8):
                return ArchiveResult(ok=False, error="test wait expired")
            return local_archive(spool_dir, archive_key)

        self.now += timedelta(seconds=300)
        with patch.object(self.targets["jianguoyun"], "archive", side_effect=blocked_copy):
            worker = threading.Thread(target=self.storage.retry_pending)
            worker.start()
            try:
                self.assertTrue(entered.wait(3))
                submit_v2(self.storage, final_payload(assignment))
                started = time.monotonic()
                status, result = test_server.ServerTests().post_in_process(server, "/archive", {
                    "schema": "layouttask.receiver.archive.v1", "experiment_id": "exp", "participant_id": "P47", "session_id": "S1"})
                self.assertLess(time.monotonic() - started, 2)
                self.assertEqual(status, 202)
                self.assertTrue(result["data_complete"])
                self.assertTrue(worker.is_alive())
            finally:
                release.set()
                worker.join(10)
        self.assertFalse(worker.is_alive())
        self.assertEqual(self.storage.retry_pending(), 1)

    def test_duplicate_index_does_not_reset_origin_or_qualify(self):
        assignment, _ = self.workload()
        self.now += timedelta(minutes=10)
        submit_v2(self.storage, formal_payload(assignment, 3, trial_id="OTHER"))
        self.assertEqual(session_state(self.storage)["final_wait_started_at"], "2026-11-13T12:00:00+00:00")
        self.assertEqual(self.storage.retry_pending(), 0)

    def test_corrupted_proof_cannot_authorize_transfer(self):
        _, _ = self.workload()
        with patch.object(self.targets["sciebo"], "archive", return_value=ArchiveResult(ok=False, error="offline")):
            self.now += timedelta(seconds=300)
            self.storage.retry_pending()
        proof = json.loads(session_state(self.storage)["manifest_json"])
        self.assertTrue(proof.get("submission_ids"))
        proof["content_sha256"][0] = "wrong"
        with closing(sqlite3.connect(self.storage.sqlite_path)) as db:
            db.execute("UPDATE session_finalizations SET manifest_json=?", (json.dumps(proof),))
            db.commit()
        self.assertEqual(self.storage.retry_pending(), 0)
        self.assertFalse((self.root / "sciebo").exists())

    def test_new_record_invalidates_complete_cache_but_preserves_old_valid_backup(self):
        assignment, _ = self.workload()
        submit_v2(self.storage, final_payload(assignment))
        self.assertTrue(self.storage.queue_archive("exp", "P47", "S1").data_complete)
        with patch.object(self.targets["sciebo"], "archive", return_value=ArchiveResult(ok=False, error="offline")):
            self.storage.retry_pending()
        extra = submit_v2(self.storage, formal_payload(assignment, 3, trial_id="EXTRA"))
        self.assertFalse(self.storage.queue_archive("exp", "P47", "S1").data_complete)
        self.assertEqual(self.storage.retry_pending(), 6)
        self.assertEqual(self.storage._submission_status(extra.id), "pending")
        self.assertFalse(session_state(self.storage)["data_complete"])

    def test_one_session_check_error_does_not_end_another_sessions_scan(self):
        import io
        from contextlib import redirect_stderr

        for participant in ("A", "B"):
            assignment, _ = self.workload(participant=participant)
            submit_v2(self.storage, final_payload(assignment, participant=participant))
        original_check = self.storage._session_completeness_error

        def fail_one(submissions, state):
            if state["participant_id"] == "A":
                raise RuntimeError("isolated-check-failure")
            return original_check(submissions, state)

        errors = io.StringIO()
        with patch.object(self.storage, "_session_completeness_error", side_effect=fail_one), redirect_stderr(errors):
            self.assertEqual(self.storage.retry_pending(), 6)
        self.assertIn("isolated-check-failure", errors.getvalue())
        self.assertEqual(session_state(self.storage, participant="B")["data_complete"], 1)
        self.assertEqual(session_state(self.storage, participant="A")["data_complete"], 0)

    def test_archive_http_contract_remains_409_after_fallback_and_202_for_late_valid_final(self):
        assignment, _ = self.workload()
        server = create_server(("127.0.0.1", 0), ReceiverConfig(
            data_dir=self.storage.data_dir, allowed_origins=["https://pages.example"], submit_token=None), self.storage)
        self.addCleanup(server.server_close)
        archive = {"schema": "layouttask.receiver.archive.v1", "experiment_id": "exp", "participant_id": "P47", "session_id": "S1"}
        request = test_server.ServerTests().post_in_process
        for elapsed in (0, 300):
            self.now += timedelta(seconds=elapsed)
            self.storage.retry_pending()
            status, body = request(server, "/archive", archive)
            self.assertEqual(status, 409)
            self.assertFalse(body["data_complete"])
        self.assertEqual(request(server, "/submit", final_payload(assignment))[0], 201)
        status, body = request(server, "/archive", archive)
        self.assertEqual(status, 202)
        self.assertTrue(body["data_complete"])
        self.assertEqual(self.storage.retry_pending(), 1)
        self.assertEqual(request(server, "/archive", archive)[0], 200)

    def test_rejected_final_does_not_change_wait_or_proof(self):
        assignment, _ = self.workload()
        self.now += timedelta(seconds=300)
        self.storage.retry_pending()
        before = session_state(self.storage)
        payload = final_payload(assignment)
        payload["files"][0]["data"] = "invalid CSV"
        with self.assertRaises(ValueError):
            submit_v2(self.storage, payload)
        self.assertEqual(session_state(self.storage), before)
        self.assertEqual(self.storage.retry_pending(), 0)

    def test_missing_bytes_repeated_presentations_or_missing_config_cannot_qualify(self):
        for name in ("missing-bytes", "repeated-presentation", "missing-count", "changed-version"):
            with self.subTest(name=name):
                self.storage = ReceiverStorage(self.root / name, archive_backend=MultiArchiveBackend(self.targets),
                                               archive_on_submit=False, expected_formal_trial_count=3,
                                               require_tutorial=True, schedule_version="fallback-v1")
                _, saved = self.workload()
                with closing(sqlite3.connect(self.storage.sqlite_path)) as db:
                    if name == "missing-bytes":
                        path = db.execute("SELECT local_path FROM submission_files WHERE submission_id=?", (saved[0].id,)).fetchone()[0]
                        Path(path).unlink()
                    elif name == "repeated-presentation":
                        db.execute("UPDATE submissions SET presentation_id='same' WHERE trial_type='formal'")
                    elif name == "missing-count":
                        db.execute("UPDATE session_finalizations SET expected_formal_trial_count=NULL")
                    else:
                        self.storage.schedule_version = "new-version"
                    db.commit()
                self.now += timedelta(seconds=300)
                self.assertEqual(self.storage.retry_pending(), 0)
                self.assertEqual(session_state(self.storage)["fallback_archive_ready"], 0)

    def test_a_waiting_b_complete_c_incomplete_and_shared_identity_parts_stay_isolated(self):
        a, _ = self.workload(participant="A")
        b, _ = self.workload(participant="B")
        self.workload(participant="C", indices=[1, 2])
        self.workload(participant="A", session="S2", indices=[1])
        submit_v2(self.storage, final_payload(b, participant="B"))
        self.assertEqual(self.storage.retry_pending(), 6)
        self.assertEqual(session_state(self.storage, participant="A")["fallback_archive_ready"], 0)
        self.assertEqual(session_state(self.storage, participant="B")["data_complete"], 1)
        self.assertEqual(session_state(self.storage, participant="C")["data_complete"], 0)
        self.now += timedelta(seconds=300)
        self.assertEqual(self.storage.retry_pending(), 5)
        self.assertEqual(session_state(self.storage, participant="A")["fallback_archive_ready"], 1)
        self.assertEqual(session_state(self.storage, participant="A", session="S2")["fallback_archive_ready"], 0)
        self.assertEqual(session_state(self.storage, participant="C")["fallback_archive_ready"], 0)
        for name in self.targets:
            self.assertFalse((self.root / name / "exp/C").exists())
            self.assertFalse((self.root / name / "exp/A/S2").exists())
        self.assertEqual(a.sequence_id, "1")

    def test_two_half_sessions_do_not_combine_and_experiment_is_part_of_identity(self):
        self.storage = self.reopen(n=24)
        self.workload(n=24, indices=range(1, 13), participant="A")
        self.workload(n=24, indices=range(13, 25), participant="B")
        from types import SimpleNamespace
        assignment = SimpleNamespace(**self.storage.allocate_assignment("other", "other", "fallback-v1", ["1"]).__dict__)
        for payload in (v2_payload(assignment, kind="metadata", participant_id="A"),
                        formal_payload(assignment, 0, participant="A"),
                        *(formal_payload(assignment, i, participant="A") for i in range(1, 25))):
            submit_v2(self.storage, payload)
        self.now += timedelta(seconds=300)
        self.assertEqual(self.storage.retry_pending(), 26)
        self.assertEqual(session_state(self.storage, participant="A")["fallback_archive_ready"], 0)
        self.assertEqual(session_state(self.storage, participant="B")["fallback_archive_ready"], 0)
        self.assertEqual(session_state(self.storage, participant="A", experiment="other")["fallback_archive_ready"], 1)

    def test_developer_uses_identical_checks_without_allocating_a_slot(self):
        from types import SimpleNamespace
        assignment = SimpleNamespace(experiment_id="exp_debug", assignment_id="developer-9999", participant_number=9999,
                                     sequence_id="developer", schedule_version="fallback-v1", assignment_mode="developer",
                                     requested_sequence_id=None, replacement_attempt=0, rotation_index=None)
        for payload in (v2_payload(assignment, kind="metadata", participant_id="9999"),
                        *(formal_payload(assignment, i, participant="9999") for i in range(4))):
            submit_v2(self.storage, payload)
        self.assertEqual(self.storage.retry_pending(), 0)
        self.now += timedelta(seconds=300)
        self.assertEqual(self.storage.retry_pending(), 5)
        state = session_state(self.storage, participant="9999", experiment="exp_debug")
        self.assertEqual((state["fallback_archive_ready"], state["data_complete"]), (1, 0))
        submit_v2(self.storage, final_payload(assignment, participant="9999"))
        self.assertEqual(self.storage.retry_pending(), 1)
        self.assertEqual(session_state(self.storage, participant="9999", experiment="exp_debug")["data_complete"], 1)
        with closing(sqlite3.connect(self.storage.sqlite_path)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM assignments").fetchone()[0], 0)

    def test_failed_final_disk_sync_and_jsonl_repair_keep_correct_wait_origin(self):
        assignment, _ = self.workload(indices=[1, 2])
        with patch("app.storage.os.fsync", side_effect=OSError("disk sync failed")):
            with self.assertRaises(OSError):
                submit_v2(self.storage, formal_payload(assignment, 3))
        self.assertIsNone(session_state(self.storage)["final_wait_started_at"])
        with patch.object(self.storage, "_append_jsonl", side_effect=OSError("index append failed")):
            with self.assertRaises(OSError):
                submit_v2(self.storage, formal_payload(assignment, 3))
        self.assertEqual(session_state(self.storage)["final_wait_started_at"], self.now.isoformat())
        self.now += timedelta(seconds=300)
        self.storage = self.reopen()
        duplicate = submit_v2(self.storage, formal_payload(assignment, 3))
        self.assertTrue(duplicate.duplicate)
        self.assertEqual(len(self.storage.jsonl_path.read_text(encoding="utf-8").splitlines()), 5)
        self.assertEqual(self.storage.retry_pending(), 5)

    def test_process_exit_around_proof_commit_and_cloud_write_recovers_same_ids_paths_bytes(self):
        ctx = multiprocessing.get_context("spawn")
        for phase, code in (("before-proof", 41), ("after-proof", 42), ("cloud-before-db", 43)):
            with self.subTest(phase=phase):
                self.storage = ReceiverStorage(self.root / phase, archive_backend=MultiArchiveBackend(self.targets),
                                               archive_on_submit=False, expected_formal_trial_count=3,
                                               require_tutorial=True, schedule_version="fallback-v1")
                self.now = datetime(2026, 11, 13, 12, tzinfo=timezone.utc)
                _, saved = self.workload()
                original = {item.id: {p.name: p.read_bytes() for p in (self.storage.spool_dir / item.id).iterdir()} for item in saved}
                process = ctx.Process(target=fallback_process, args=(self.storage.data_dir, self.root, phase))
                process.start()
                process.join(15)
                if process.is_alive():
                    process.terminate()
                    process.join(5)
                self.assertEqual(process.exitcode, code)
                state = session_state(self.storage)
                self.assertEqual(state["fallback_archive_ready"], int(phase != "before-proof"))
                self.assertEqual(bool(json.loads(state["manifest_json"])), phase != "before-proof")
                self.now += timedelta(seconds=300)
                self.assertEqual(self.storage.retry_pending(), 5)
                for name in self.targets:
                    for item in saved:
                        path = self.root / name / "exp/P47/S1" / item.id
                        self.assertEqual({p.name: p.read_bytes() for p in path.iterdir()}, original[item.id])
                with closing(sqlite3.connect(self.storage.sqlite_path)) as db:
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone()[0], 5)

    def test_two_processes_serialize_the_same_fallback_without_reuploading(self):
        self.workload()
        ctx = multiprocessing.get_context("spawn")
        entered, release, second_ready, second_entered = (ctx.Event() for _ in range(4))
        first_output, second_output = ctx.Queue(), ctx.Queue()
        first = ctx.Process(target=fallback_process, args=(self.storage.data_dir, self.root, "retry", entered, release, None, first_output))
        second = ctx.Process(target=fallback_process, args=(self.storage.data_dir, self.root, "retry", second_entered, None, second_ready, second_output))
        try:
            first.start()
            self.assertTrue(entered.wait(10))
            second.start()
            self.assertTrue(second_ready.wait(10))
            self.assertFalse(second_entered.wait(0.5))
        finally:
            release.set()
            for process in (first, second):
                if process.pid:
                    process.join(15)
                    if process.is_alive():
                        process.terminate()
                        process.join(5)
        self.assertEqual((first.exitcode, second.exitcode), (0, 0))
        self.assertEqual((first_output.get(timeout=2), second_output.get(timeout=2)), (5, 0))
        self.assertFalse(second_entered.is_set())

    def test_aggregate_read_write_cannot_overwrite_a_new_finals_pending_state(self):
        assignment, _ = self.workload()
        self.now += timedelta(seconds=300)
        self.storage.retry_pending()
        read_done, release, save_started, save_done = (threading.Event() for _ in range(4))
        connect = sqlite3.connect
        errors = []

        class BarrierConnection(sqlite3.Connection):
            def execute(connection, sql, *args):
                cursor = super().execute(sql, *args)
                if threading.current_thread() is sync and "SELECT archive_status FROM submissions" in sql:
                    read_done.set()
                    if not release.wait(8):
                        raise RuntimeError("aggregate test barrier expired")
                return cursor

        def save():
            save_started.set()
            try:
                submit_v2(self.storage, final_payload(assignment))
            except Exception as error:
                errors.append(error)
            finally:
                save_done.set()

        sync = threading.Thread(target=self.storage._sync_finalization_archive_status, args=("exp", "P47", "S1"))
        publisher = threading.Thread(target=save)
        with patch("app.storage.sqlite3.connect", side_effect=lambda *args, **kwargs: connect(*args, factory=BarrierConnection, **kwargs)):
            try:
                sync.start()
                self.assertTrue(read_done.wait(3))
                publisher.start()
                self.assertTrue(save_started.wait(3))
                self.assertFalse(save_done.wait(0.3))
            finally:
                release.set()
                for thread in (sync, publisher):
                    if thread.ident:
                        thread.join(10)
        self.assertFalse(errors)
        self.assertFalse(sync.is_alive() or publisher.is_alive())
        self.assertEqual(session_state(self.storage)["archive_status"], "partial")
        self.assertEqual(self.storage.retry_pending(), 1)

    def test_blocked_a_cloud_does_not_delay_b_local_normal_completion(self):
        self.workload(participant="A")
        b, _ = self.workload(participant="B")
        entered, release = threading.Event(), threading.Event()
        original = self.targets["jianguoyun"].archive

        def blocked_copy(spool_dir, key):
            entered.set()
            if not release.wait(8):
                raise RuntimeError("cross-session barrier expired")
            return original(spool_dir, key)

        self.now += timedelta(seconds=300)
        with patch.object(self.targets["jianguoyun"], "archive", side_effect=blocked_copy):
            worker = threading.Thread(target=self.storage.retry_pending)
            try:
                worker.start()
                self.assertTrue(entered.wait(3))
                submit_v2(self.storage, final_payload(b, participant="B"))
                self.assertTrue(self.storage.queue_archive("exp", "B", "S1").data_complete)
                self.assertTrue(worker.is_alive())
            finally:
                release.set()
                worker.join(10)
        self.assertFalse(worker.is_alive())
        self.assertEqual(session_state(self.storage, participant="B")["data_complete"], 1)

    def test_worker_and_maintenance_command_use_same_deadline_and_whitelist(self):
        from app.archive_worker import ArchiveWorker
        from app.retry_archive import main
        for route in ("worker", "maintenance"):
            with self.subTest(route=route):
                self.storage = ReceiverStorage(self.root / route, archive_backend=MultiArchiveBackend(self.targets),
                                               archive_on_submit=False, expected_formal_trial_count=3,
                                               require_tutorial=True, schedule_version="fallback-v1")
                self.now = datetime(2026, 11, 13, 12, tzinfo=timezone.utc)
                self.workload()
                for seconds, expected in ((299, 0), (300, 1)):
                    self.now = datetime(2026, 11, 13, 12, tzinfo=timezone.utc) + timedelta(seconds=seconds)
                    if route == "worker":
                        worker = ArchiveWorker(self.storage)
                        with patch.object(worker._stop, "wait", side_effect=lambda _: worker._stop.set() or True):
                            worker._run()
                    else:
                        with patch.dict(os.environ, {"DATA_DIR": str(self.storage.data_dir), "ASSIGNMENT_SCHEDULE_VERSION": "fallback-v1",
                                                    "ASSIGNMENT_EXPECTED_FORMAL_TRIAL_COUNT": "3", "ASSIGNMENT_REQUIRE_TUTORIAL": "true"}), \
                             patch("app.retry_archive.build_archive_backend", return_value=MultiArchiveBackend(self.targets)):
                            main()
                    self.assertEqual(session_state(self.storage)["fallback_archive_ready"], expected)


if __name__ == "__main__":
    unittest.main()
