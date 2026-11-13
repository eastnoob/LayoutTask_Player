import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from app.archive import LocalArchiveBackend, MultiArchiveBackend
from app.storage import ReceiverStorage
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


if __name__ == "__main__":
    unittest.main()
