import json
import io
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from app.archive import LocalArchiveBackend
from app.config import ReceiverConfig
from app.server import create_server
from app.storage import ReceiverStorage
from test_storage import v2_payload


class ServerTests(unittest.TestCase):
    def post_in_process(self, server, path, payload):
        body = json.dumps(payload).encode("utf-8")
        request = f"POST {path} HTTP/1.0\r\nContent-Type: application/json\r\nOrigin: https://pages.example\r\nContent-Length: {len(body)}\r\n\r\n".encode() + body

        class MemorySocket:
            def __init__(self):
                self.response = bytearray()

            def makefile(self, mode, _buffering=None):
                return io.BytesIO(request)

            def sendall(self, data):
                self.response.extend(data)

            def close(self):
                pass

        connection = MemorySocket()
        server.RequestHandlerClass(connection, ("127.0.0.1", 0), server)
        head, content = bytes(connection.response).split(b"\r\n\r\n", 1)
        return int(head.split(b" ")[1]), json.loads(content)

    def test_v2_status_codes_without_network_stack(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = ReceiverConfig(data_dir=Path(temp_dir), allowed_origins=["https://pages.example"], submit_token=None)
            storage = ReceiverStorage(config.data_dir, archive_on_submit=False)
            record = storage.allocate_assignment("layout_task_v1", "replacement", "s1", ["1", "6"], "6")
            server = create_server(("127.0.0.1", 0), config, storage)
            self.addCleanup(server.server_close)

            payload = v2_payload(record)
            other_record = storage.allocate_assignment("layout_task_v1", "replacement-2", "s1", ["1", "6"], "6")
            first = self.post_in_process(server, "/submit", payload)
            second = self.post_in_process(server, "/submit", payload)
            conflict = self.post_in_process(server, "/submit", v2_payload(record, encoded="other"))
            assignment_conflict = self.post_in_process(server, "/submit", v2_payload(other_record))
            self.assertEqual((first[0], second[0], conflict[0], assignment_conflict[0]), (201, 200, 409, 409))
            self.assertEqual(first[1]["submission_id"], second[1]["submission_id"])
            self.assertEqual(conflict[1]["error"], "submission_conflict")
            self.assertEqual(assignment_conflict[1]["error"], "submission_conflict")

    def test_v2_archive_after_retry_removed_trial_spool_without_network_stack(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            config = ReceiverConfig(data_dir=data_dir, archive_local_dir=data_dir / "archive",
                                    allowed_origins=["https://pages.example"], submit_token=None)
            storage = ReceiverStorage(data_dir, archive_backend=LocalArchiveBackend(config.archive_local_dir),
                                      archive_on_submit=False)
            record = storage.allocate_assignment("layout_task_v1", "automatic", "s1", ["1"])
            server = create_server(("127.0.0.1", 0), config, storage)
            self.addCleanup(server.server_close)
            trial_status, trial_body = self.post_in_process(server, "/submit", v2_payload(record))
            self.assertEqual(trial_status, 201)
            self.assertEqual(storage.retry_pending(), 1)
            self.assertFalse((storage.spool_dir / trial_body["submission_id"]).exists())
            final_status, final_body = self.post_in_process(server, "/submit", v2_payload(record, kind="final"))
            self.assertEqual(final_status, 201)
            archive = {"schema": "layouttask.receiver.archive.v1", "experiment_id": "layout_task_v1",
                       "participant_id": "P47", "session_id": "S1"}
            first = self.post_in_process(server, "/archive", archive)
            repeat = self.post_in_process(server, "/archive", archive)
            self.assertEqual((first[0], repeat[0]), (201, 200))
            self.assertTrue((config.archive_local_dir / "layout_task_v1" / "P47" / "S1" / trial_body["submission_id"]).exists())
            self.assertTrue((config.archive_local_dir / "layout_task_v1" / "P47" / "S1" / final_body["submission_id"]).exists())

    def start_server(self, config):
        storage = ReceiverStorage(
            config.data_dir,
            archive_backend=LocalArchiveBackend(config.archive_local_dir),
            delete_local_after_success=config.archive_delete_local_after_success,
            archive_on_submit=False,
        )
        server = create_server(("127.0.0.1", 0), config, storage)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        server._test_thread = thread

        def cleanup():
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()

        self.addCleanup(cleanup)
        return server

    def post_json(self, server, path, payload, headers=None):
        connection = HTTPConnection("127.0.0.1", server.server_address[1])
        body = json.dumps(payload)
        request_headers = {"Content-Type": "application/json", "Origin": "https://pages.example"}
        request_headers.update(headers or {})
        connection.request("POST", path, body=body, headers=request_headers)
        response = connection.getresponse()
        data = response.read().decode("utf-8")
        connection.close()
        return response.status, dict(response.getheaders()), json.loads(data)

    def valid_payload(self):
        return {
            "schema": "layouttask.receiver.submission.v1",
            "experiment_id": "layout_task_v1",
            "participant_id": "P001",
            "session_id": "S001",
            "files": [
                {"filename": "layout_session_P001_S001.csv", "content_type": "text/csv", "data": "a\n1\n"},
            ],
        }

    def archive_payload(self):
        return {
            "schema": "layouttask.receiver.archive.v1",
            "experiment_id": "layout_task_v1",
            "participant_id": "P001",
            "session_id": "S001",
        }

    def test_health(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = ReceiverConfig(data_dir=Path(temp_dir), allowed_origins=["https://pages.example"], submit_token=None)
            server = self.start_server(config)
            connection = HTTPConnection("127.0.0.1", server.server_address[1])
            connection.request("GET", "/health")
            response = connection.getresponse()
            body = json.loads(response.read().decode("utf-8"))
            connection.close()
            self.assertEqual(response.status, 200)
            self.assertEqual(body, {"ok": True})

    def test_accepts_valid_submit_with_token_and_cors(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = ReceiverConfig(data_dir=Path(temp_dir), allowed_origins=["https://pages.example"], submit_token="token")
            server = self.start_server(config)
            status, headers, body = self.post_json(server, "/submit", self.valid_payload(), {"X-Submit-Token": "token"})
            self.assertEqual(status, 201)
            self.assertTrue(body["ok"])
            self.assertEqual(headers["Access-Control-Allow-Origin"], "https://pages.example")

    def test_assigns_and_repeats_assignment(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = ReceiverConfig(
                data_dir=Path(temp_dir),
                allowed_origins=["https://pages.example"],
                submit_token="token",
                assignment_experiment_id="layout_task_v1",
                assignment_schedule_version="schedule-v1",
                assignment_sequence_ids=["sequence-a", "sequence-b"],
            )
            server = self.start_server(config)
            payload = {"experiment_id": "layout_task_v1", "idempotency_token": "browser-1", "schedule_version": "schedule-v1"}
            first = self.post_json(server, "/assign", payload, {"X-Submit-Token": "token"})
            repeated = self.post_json(server, "/assign", payload, {"X-Submit-Token": "token"})
            self.assertEqual(first[0], 201)
            self.assertEqual(first[2]["participant_number"], 1)
            self.assertEqual(first[2]["sequence_id"], "sequence-a")
            self.assertEqual(first[2]["assignment_mode"], "automatic")
            self.assertIsNone(first[2]["requested_sequence_id"])
            self.assertEqual(first[2]["replacement_attempt"], 0)
            self.assertEqual(first[2]["rotation_index"], 0)
            self.assertEqual(first[2], repeated[2])

    def test_assigns_requested_sequence_and_increments_replacement_attempt(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = ReceiverConfig(
                data_dir=Path(temp_dir),
                allowed_origins=["https://pages.example"],
                submit_token=None,
                assignment_experiment_id="layout_task_v1",
                assignment_schedule_version="schedule-v1",
                assignment_sequence_ids=["sequence-a", "sequence-b", "sequence-6"],
            )
            server = self.start_server(config)
            base = {"experiment_id": "layout_task_v1", "schedule_version": "schedule-v1"}
            first = self.post_json(server, "/assign", {**base, "idempotency_token": "replacement-1", "requested_sequence_id": "sequence-6"})
            second = self.post_json(server, "/assign", {**base, "idempotency_token": "replacement-2", "requested_sequence_id": "sequence-6"})
            self.assertEqual(first[0], 201)
            self.assertEqual(first[2]["sequence_id"], "sequence-6")
            self.assertEqual(first[2]["assignment_mode"], "replacement")
            self.assertEqual(first[2]["requested_sequence_id"], "sequence-6")
            self.assertEqual(first[2]["replacement_attempt"], 1)
            self.assertIsNone(first[2]["rotation_index"])
            self.assertEqual(second[2]["replacement_attempt"], 2)

    def test_rejects_malformed_or_unknown_requested_sequence_without_creating_assignment(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            config = ReceiverConfig(
                data_dir=data_dir,
                allowed_origins=["https://pages.example"],
                submit_token=None,
                assignment_experiment_id="layout_task_v1",
                assignment_schedule_version="schedule-v1",
                assignment_sequence_ids=["sequence-a", "sequence-6"],
            )
            server = self.start_server(config)
            base = {"experiment_id": "layout_task_v1", "schedule_version": "schedule-v1"}
            malformed = self.post_json(server, "/assign", {**base, "idempotency_token": "bad-1", "requested_sequence_id": 6})
            unknown = self.post_json(server, "/assign", {**base, "idempotency_token": "bad-2", "requested_sequence_id": "sequence-9"})
            self.assertEqual(malformed[0], 400)
            self.assertEqual(unknown[0], 400)
            valid = self.post_json(server, "/assign", {**base, "idempotency_token": "valid-1"})
            self.assertEqual(valid[0], 201)
            self.assertEqual(valid[2]["participant_number"], 1)

    def test_rejects_assignment_with_unknown_schedule(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = ReceiverConfig(
                data_dir=Path(temp_dir),
                allowed_origins=["https://pages.example"],
                submit_token=None,
                assignment_experiment_id="layout_task_v1",
                assignment_schedule_version="schedule-v1",
                assignment_sequence_ids=["sequence-a"],
            )
            server = self.start_server(config)
            status, _headers, body = self.post_json(
                server,
                "/assign",
                {"experiment_id": "layout_task_v1", "idempotency_token": "browser-1", "schedule_version": "wrong"},
            )
            self.assertGreaterEqual(status, 400)
            self.assertLess(status, 500)
            self.assertNotIn("participant_number", body)

    def test_submit_defers_archive_until_session_archive(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = ReceiverConfig(
                data_dir=Path(temp_dir),
                archive_local_dir=Path(temp_dir) / "archive",
                allowed_origins=["https://pages.example"],
                submit_token=None,
            )
            server = self.start_server(config)
            status, _headers, body = self.post_json(server, "/submit", self.valid_payload())
            self.assertEqual(status, 201)
            self.assertEqual(body["archive_status"], "pending")

            status, _headers, body = self.post_json(server, "/archive", self.archive_payload())
            self.assertEqual(status, 201)
            self.assertTrue(body["ok"])
            self.assertEqual(body["archive_status"], "archived")

            status, _headers, body = self.post_json(server, "/archive", self.archive_payload())
            self.assertEqual(status, 200)
            self.assertTrue(body["ok"])
            self.assertEqual(body["archive_status"], "archived")

    def test_rejects_token_mismatch(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = ReceiverConfig(data_dir=Path(temp_dir), allowed_origins=["https://pages.example"], submit_token="token")
            server = self.start_server(config)
            status, _headers, body = self.post_json(server, "/submit", self.valid_payload(), {"X-Submit-Token": "wrong"})
            self.assertEqual(status, 403)
            self.assertEqual(body["error"], "invalid_token")

    def test_rejects_disallowed_origin(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = ReceiverConfig(data_dir=Path(temp_dir), allowed_origins=["https://allowed.example"], submit_token=None)
            server = self.start_server(config)
            status, _headers, body = self.post_json(server, "/submit", self.valid_payload())
            self.assertEqual(status, 403)
            self.assertEqual(body["error"], "origin_not_allowed")

    def test_accepts_datapipe_compat_route(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = ReceiverConfig(data_dir=Path(temp_dir), allowed_origins=["https://pages.example"], submit_token=None)
            server = self.start_server(config)
            status, _headers, body = self.post_json(
                server,
                "/api/data/",
                {"experimentID": "layout_task_v1", "filename": "layout_session_P001_S001.csv", "data": "a\n1\n"},
            )
            self.assertEqual(status, 201)
            self.assertTrue(body["ok"])


if __name__ == "__main__":
    unittest.main()
