import unittest

from app.models import ValidationError, classify_file_kind, safe_filename, validate_submission


class ModelTests(unittest.TestCase):
    def valid_payload(self):
        return {
            "schema": "layouttask.receiver.submission.v1",
            "experiment_id": "layout_task_v1",
            "participant_id": "P001",
            "session_id": "S001",
            "files": [
                {"filename": "layout_session_P001_S001.csv", "content_type": "text/csv", "data": "a\n1\n"},
                {"filename": "layout_results_P001_S001.csv", "content_type": "text/csv", "data": "b\n2\n"},
                {"filename": "layout_events_P001_S001.csv", "content_type": "text/csv", "data": "c\n3\n"},
                {"filename": "layout_debug_P001_S001.json", "content_type": "application/json", "data": "{}"},
            ],
        }

    def test_classifies_known_file_kinds(self):
        self.assertEqual(classify_file_kind("layout_session_P001_S001.csv"), "session")
        self.assertEqual(classify_file_kind("layout-task_session_P001_S001.csv"), "session")
        self.assertEqual(classify_file_kind("layout_results_P001_S001.csv"), "results")
        self.assertEqual(classify_file_kind("layout_events_P001_S001.csv"), "events")
        self.assertEqual(classify_file_kind("layout_debug_P001_S001.json"), "debug")
        self.assertEqual(classify_file_kind("notes.txt"), "unknown")

    def test_rejects_path_traversal_filename(self):
        with self.assertRaisesRegex(ValidationError, "invalid_filename"):
            safe_filename("../layout_session.csv")

    def test_rejects_unsafe_id_segments(self):
        payload = self.valid_payload()
        payload["participant_id"] = "../outside"
        with self.assertRaisesRegex(ValidationError, "invalid_participant_id"):
            validate_submission(payload, max_files=8, max_file_bytes=1024)

    def test_accepts_valid_submission(self):
        submission = validate_submission(self.valid_payload(), max_files=8, max_file_bytes=1024)
        self.assertEqual(submission.experiment_id, "layout_task_v1")
        self.assertEqual(submission.participant_id, "P001")
        self.assertEqual(submission.session_id, "S001")
        self.assertEqual([file.kind for file in submission.files], ["session", "results", "events", "debug"])

    def test_rejects_too_many_files(self):
        payload = self.valid_payload()
        payload["files"] = payload["files"] * 3
        with self.assertRaisesRegex(ValidationError, "too_many_files"):
            validate_submission(payload, max_files=8, max_file_bytes=1024)

    def test_rejects_oversized_file(self):
        payload = self.valid_payload()
        payload["files"][0]["data"] = "x" * 1025
        with self.assertRaisesRegex(ValidationError, "file_too_large"):
            validate_submission(payload, max_files=8, max_file_bytes=1024)

    def test_v2_trial_requires_flat_identity_and_encoded_result(self):
        payload = {**self.valid_payload(), "schema": "layouttask.receiver.submission.v2",
                   "submission_kind": "trial", "assignment_id": "a1", "participant_number": 47,
                   "sequence_id": "6", "schedule_version": "s1", "assignment_mode": "replacement",
                   "requested_sequence_id": "6", "replacement_attempt": 1, "rotation_index": None,
                   "trial_session_id": "T1", "trial_type": "formal", "trial_index": 0,
                   "task_id": "task", "qid": "q", "presentation_id": "p1",
                   "hash8": "12345678", "encoding": "lz-uri", "encoded": "abc"}
        trial = validate_submission(payload, 8, 4096)
        self.assertEqual((trial.submission_kind, trial.trial_session_id, trial.participant_number), ("trial", "T1", 47))
        for field in ("assignment_id", "trial_session_id", "encoded"):
            missing = dict(payload)
            missing.pop(field)
            with self.subTest(field=field), self.assertRaises(ValidationError):
                validate_submission(missing, 8, 4096)

    def test_v2_final_rejects_trial_only_fields(self):
        payload = {**self.valid_payload(), "schema": "layouttask.receiver.submission.v2",
                   "submission_kind": "final", "assignment_id": "a1", "participant_number": 47,
                   "sequence_id": "6", "schedule_version": "s1", "assignment_mode": "replacement",
                   "requested_sequence_id": "6", "replacement_attempt": 1, "rotation_index": None}
        self.assertEqual(validate_submission(payload, 8, 4096).submission_kind, "final")
        for field in ("trial_session_id", "hash8", "encoded", "presentation_id"):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                validate_submission({**payload, field: "bad"}, 8, 4096)


if __name__ == "__main__":
    unittest.main()
