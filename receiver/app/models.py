from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePath, PureWindowsPath
from typing import Any


class ValidationError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


@dataclass(frozen=True)
class SubmittedFile:
    filename: str
    content_type: str
    data: str
    kind: str


@dataclass(frozen=True)
class Submission:
    experiment_id: str
    participant_id: str
    session_id: str
    files: list[SubmittedFile]


def classify_file_kind(filename: str) -> str:
    if filename.startswith("layout_session_") and filename.endswith(".csv"):
        return "session"
    if filename.startswith("layout_results_") and filename.endswith(".csv"):
        return "results"
    if filename.startswith("layout_events_") and filename.endswith(".csv"):
        return "events"
    if filename.startswith("layout_debug_") and filename.endswith(".json"):
        return "debug"
    return "unknown"


def safe_filename(filename: Any) -> str:
    if not isinstance(filename, str) or not filename:
        raise ValidationError("invalid_filename", "filename must be a non-empty string")
    if filename != PurePath(filename).name or filename != PureWindowsPath(filename).name:
        raise ValidationError("invalid_filename", "submitted filenames must not contain path separators")
    if any(char in filename for char in ("/", "\\", "\x00", ":")):
        raise ValidationError("invalid_filename", "submitted filenames must be basename-only")
    return filename


def require_text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValidationError("invalid_submission", f"{field} must be a non-empty string")
    return value


def validate_submission(payload: Any, max_files: int, max_file_bytes: int) -> Submission:
    if not isinstance(payload, dict):
        raise ValidationError("invalid_submission", "request body must be a JSON object")
    if payload.get("schema") != "layouttask.receiver.submission.v1":
        raise ValidationError("invalid_schema", "schema must be layouttask.receiver.submission.v1")

    experiment_id = require_text(payload.get("experiment_id"), "experiment_id")
    participant_id = require_text(payload.get("participant_id"), "participant_id")
    session_id = require_text(payload.get("session_id"), "session_id")
    raw_files = payload.get("files")
    if not isinstance(raw_files, list) or not raw_files:
        raise ValidationError("invalid_files", "files must be a non-empty array")
    if len(raw_files) > max_files:
        raise ValidationError("too_many_files", f"at most {max_files} files are allowed")

    files: list[SubmittedFile] = []
    for raw_file in raw_files:
        if not isinstance(raw_file, dict):
            raise ValidationError("invalid_file", "each file must be an object")
        filename = safe_filename(raw_file.get("filename"))
        content_type = raw_file.get("content_type")
        data = raw_file.get("data")
        if not isinstance(content_type, str) or not content_type:
            content_type = "text/plain"
        if not isinstance(data, str):
            raise ValidationError("invalid_file", "file data must be a string")
        size_bytes = len(data.encode("utf-8"))
        if size_bytes > max_file_bytes:
            raise ValidationError("file_too_large", f"{filename} exceeds {max_file_bytes} bytes")
        files.append(
            SubmittedFile(filename=filename, content_type=content_type, data=data, kind=classify_file_kind(filename)),
        )

    return Submission(
        experiment_id=experiment_id,
        participant_id=participant_id,
        session_id=session_id,
        files=files,
    )
