import http.server
import json
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from app.archive import LocalArchiveBackend
from app.config import ReceiverConfig
from app.server import create_server
from app.storage import ReceiverStorage


class BuiltPackageIntegrationTests(unittest.TestCase):
    def start_receiver(self, config):
        storage = ReceiverStorage(
            config.data_dir,
            archive_backend=LocalArchiveBackend(config.archive_local_dir),
            delete_local_after_success=config.archive_delete_local_after_success,
            archive_on_submit=False,
        )
        server = create_server(("127.0.0.1", 0), config, storage)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(lambda: (server.shutdown(), thread.join(timeout=2), server.server_close()))
        return server

    def start_static_server(self):
        dist = Path(__file__).parents[2] / "dist"
        handler = lambda *args, **kwargs: http.server.SimpleHTTPRequestHandler(
            *args, directory=str(dist), **kwargs
        )
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(lambda: (server.shutdown(), thread.join(timeout=2), server.server_close()))
        return server

    def post_assign(self, server, payload):
        connection = HTTPConnection("127.0.0.1", server.server_address[1])
        connection.request(
            "POST",
            "/assign",
            body=json.dumps(payload),
            headers={"Content-Type": "application/json", "Origin": "https://pages.example"},
        )
        response = connection.getresponse()
        body = json.loads(response.read().decode("utf-8"))
        connection.close()
        return response.status, body

    def test_built_experiment_urls_use_receiver_and_authoritative_sequence(self):
        with self.subTest("static package keeps both query forms routable"):
            static = self.start_static_server()
            for path in ("/experiment/", "/experiment/?sequence=6"):
                connection = HTTPConnection("127.0.0.1", static.server_address[1])
                connection.request("GET", path)
                response = connection.getresponse()
                body = response.read().decode("utf-8")
                connection.close()
                self.assertEqual(response.status, 200)
                self.assertIn('id="app"', body)

        with self.subTest("receiver allocates identity and honors replacement sequence"):
            import tempfile

            with tempfile.TemporaryDirectory() as temp_dir:
                config = ReceiverConfig(
                    data_dir=Path(temp_dir),
                    allowed_origins=["https://pages.example"],
                    submit_token=None,
                    assignment_experiment_id="layout_task_v1",
                    assignment_schedule_version="run12-williams-v1",
                    assignment_sequence_ids=[str(index) for index in range(1, 47)],
                )
                receiver = self.start_receiver(config)
                automatic_status, automatic = self.post_assign(
                    receiver,
                    {
                        "experiment_id": "layout_task_v1",
                        "idempotency_token": "built-auto",
                        "schedule_version": "run12-williams-v1",
                    },
                )
                replacement_payload = {
                    "experiment_id": "layout_task_v1",
                    "idempotency_token": "built-replacement",
                    "schedule_version": "run12-williams-v1",
                    "requested_sequence_id": "6",
                }
                replacement_status, replacement = self.post_assign(receiver, replacement_payload)
                repeated_status, repeated = self.post_assign(receiver, replacement_payload)
                next_replacement_status, next_replacement = self.post_assign(
                    receiver,
                    {**replacement_payload, "idempotency_token": "built-replacement-2"},
                )
                next_automatic_status, next_automatic = self.post_assign(
                    receiver,
                    {
                        "experiment_id": "layout_task_v1",
                        "idempotency_token": "built-auto-2",
                        "schedule_version": "run12-williams-v1",
                    },
                )

                self.assertEqual(automatic_status, 201)
                self.assertEqual(replacement_status, 201)
                self.assertEqual(repeated_status, 201)
                self.assertEqual(next_replacement_status, 201)
                self.assertEqual(next_automatic_status, 201)
                self.assertEqual(automatic["participant_number"], 1)
                self.assertEqual(replacement["participant_number"], 2)
                self.assertEqual(replacement["sequence_id"], "6")
                self.assertEqual(replacement["assignment_mode"], "replacement")
                self.assertEqual(replacement, repeated)
                self.assertEqual(next_replacement["replacement_attempt"], 2)
                self.assertEqual(next_automatic["participant_number"], 4)
                self.assertEqual(next_automatic["rotation_index"], 1)


if __name__ == "__main__":
    unittest.main()
