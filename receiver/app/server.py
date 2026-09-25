from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import json
import sys
import time
from typing import Any

from .archive import build_archive_backend
from .config import ReceiverConfig, load_config_from_env
from .models import ValidationError, safe_path_segment, validate_submission
from .storage import ReceiverStorage


def json_response(handler: BaseHTTPRequestHandler, status: int, body: dict, origin: str | None = None) -> None:
    data = json.dumps(body, ensure_ascii=True).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(data)))
    if origin:
        handler.send_header("Access-Control-Allow-Origin", origin)
        handler.send_header("Vary", "Origin")
    handler.end_headers()
    handler.wfile.write(data)


def create_server(address, config: ReceiverConfig, storage: ReceiverStorage) -> ThreadingHTTPServer:
    rate_state: dict[str, list[float]] = {}

    class ReceiverHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            return

        def allowed_origin(self) -> str | None:
            origin = self.headers.get("Origin")
            if not origin:
                return None
            if not config.allowed_origins or origin in config.allowed_origins:
                return origin
            return None

        def origin_is_allowed(self) -> bool:
            origin = self.headers.get("Origin")
            return not origin or not config.allowed_origins or origin in config.allowed_origins

        def do_GET(self) -> None:
            origin = self.allowed_origin()
            if self.path == "/health":
                json_response(self, 200, {"ok": True}, origin)
                return
            json_response(self, 404, {"ok": False, "error": "not_found", "message": "Route not found."}, origin)

        def do_OPTIONS(self) -> None:
            origin = self.allowed_origin()
            self.send_response(204)
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Submit-Token")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Vary", "Origin")
            self.end_headers()

        def do_POST(self) -> None:
            origin = self.allowed_origin()
            if self.path not in ("/submit", "/api/data/", "/archive"):
                json_response(self, 404, {"ok": False, "error": "not_found", "message": "Route not found."}, origin)
                return
            if not self.origin_is_allowed():
                json_response(self, 403, {"ok": False, "error": "origin_not_allowed"}, None)
                return
            if not self.rate_allowed():
                json_response(self, 429, {"ok": False, "error": "rate_limited"}, origin)
                return
            if config.submit_token and self.headers.get("X-Submit-Token") != config.submit_token:
                json_response(self, 403, {"ok": False, "error": "invalid_token"}, origin)
                return

            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                json_response(self, 400, {"ok": False, "error": "invalid_length"}, origin)
                return
            if length > config.max_body_bytes:
                json_response(self, 413, {"ok": False, "error": "body_too_large"}, origin)
                return

            body_bytes = self.rfile.read(length)
            try:
                payload = json.loads(body_bytes.decode("utf-8"))
            except json.JSONDecodeError:
                json_response(self, 400, {"ok": False, "error": "invalid_json"}, origin)
                return

            if self.path == "/archive":
                try:
                    archive_payload = json.loads(body_bytes.decode("utf-8"))
                    if archive_payload.get("schema") != "layouttask.receiver.archive.v1":
                        raise ValidationError("invalid_schema", "schema must be layouttask.receiver.archive.v1")
                    experiment_id = safe_path_segment(archive_payload.get("experiment_id"), "experiment_id")
                    participant_id = safe_path_segment(archive_payload.get("participant_id"), "participant_id")
                    session_id = safe_path_segment(archive_payload.get("session_id"), "session_id")
                    result = storage.archive_session(experiment_id, participant_id, session_id)
                except (json.JSONDecodeError, ValidationError) as error:
                    if isinstance(error, ValidationError):
                        json_response(self, 400, {"ok": False, "error": error.code, "message": error.message}, origin)
                    else:
                        json_response(self, 400, {"ok": False, "error": "invalid_json"}, origin)
                    return
                if not result.ok:
                    json_response(self, 503, {"ok": False, "error": "archive_failed", "message": result.error}, origin)
                    return
                status = 200 if result.already_archived else 201
                json_response(self, status, {"ok": True, "archive_status": result.archive_status, "archive_uri": result.archive_uri}, origin)
                return

            if self.path == "/api/data/":
                payload = {
                    "schema": "layouttask.receiver.submission.v1",
                    "experiment_id": payload.get("experimentID"),
                    "participant_id": "datapipe-compat",
                    "session_id": "datapipe-compat",
                    "files": [
                        {
                            "filename": payload.get("filename"),
                            "content_type": "text/csv",
                            "data": payload.get("data"),
                        },
                    ],
                }

            try:
                submission = validate_submission(
                    payload,
                    max_files=config.max_files_per_submission,
                    max_file_bytes=config.max_body_bytes,
                )
                stored = storage.save_submission(
                    submission,
                    self.client_address[0],
                    self.headers.get("User-Agent"),
                    hashlib.sha256(body_bytes).hexdigest(),
                )
            except ValidationError as error:
                json_response(self, 400, {"ok": False, "error": error.code, "message": error.message}, origin)
                return
            except Exception as error:
                print(f"storage_error: {error}", file=sys.stderr)
                json_response(
                    self,
                    500,
                    {"ok": False, "error": "storage_error", "message": "Submission could not be stored."},
                    origin,
                )
                return

            json_response(self, 201, {"ok": True, "submission_id": stored.id, "file_count": stored.file_count, "archive_status": stored.archive_status}, origin)

        def rate_allowed(self) -> bool:
            now = time.time() * 1000
            key = self.client_address[0]
            window_start = now - config.rate_limit_window_ms
            timestamps = [stamp for stamp in rate_state.get(key, []) if stamp >= window_start]
            if len(timestamps) >= config.rate_limit_max:
                rate_state[key] = timestamps
                return False
            timestamps.append(now)
            rate_state[key] = timestamps
            return True

    return ThreadingHTTPServer(address, ReceiverHandler)


def main() -> None:
    config = load_config_from_env()
    backend = build_archive_backend(config.archive_mode, config.archive_local_dir, config.archive_rclone_remote)
    storage = ReceiverStorage(
        config.data_dir,
        archive_backend=backend,
        delete_local_after_success=config.archive_delete_local_after_success,
        archive_on_submit=False,
    )
    server = create_server(("", config.port), config, storage)
    print(f"receiver listening on :{config.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
