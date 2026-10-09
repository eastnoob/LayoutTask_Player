from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePath, PureWindowsPath
import re
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
    submission_kind: str | None = None
    assignment_id: str | None = None
    participant_number: int | None = None
    sequence_id: str | None = None
    schedule_version: str | None = None
    assignment_mode: str | None = None
    requested_sequence_id: str | None = None
    replacement_attempt: int | None = None
    rotation_index: int | None = None
    trial_session_id: str | None = None
    trial_type: str | None = None
    trial_index: int | None = None
    task_id: str | None = None
    qid: str | None = None
    presentation_id: str | None = None
    hash8: str | None = None
    encoding: str | None = None
    encoded: str | None = None


ASSIGNMENT_FIELDS = ("assignment_id", "participant_number", "sequence_id", "schedule_version",
                     "assignment_mode", "requested_sequence_id", "replacement_attempt", "rotation_index")
IDENTITY_FIELDS = ("experiment_id", "participant_id", "session_id", *ASSIGNMENT_FIELDS)
TRIAL_FIELDS = ("trial_session_id", "trial_type", "trial_index", "task_id", "qid",
                "presentation_id", "hash8", "encoding", "encoded")


_SAFE_SEGMENT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def classify_file_kind(filename: str) -> str:
    if filename.endswith(".csv") and "_session_" in filename:
        return "session"
    if filename.endswith(".csv") and "_results_" in filename:
        return "results"
    if filename.endswith(".csv") and "_events_" in filename:
        return "events"
    if filename.endswith(".json") and "_debug_" in filename:
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


def safe_path_segment(value: Any, field: str) -> str:
    text = require_text(value, field)
    if text in (".", "..") or not _SAFE_SEGMENT_RE.fullmatch(text):
        raise ValidationError(f"invalid_{field}", f"{field} must be a safe path segment")
    return text


def validate_submission(payload: Any, max_files: int, max_file_bytes: int) -> Submission:
    if not isinstance(payload, dict):
        raise ValidationError("invalid_submission", "request body must be a JSON object")
    schema = payload.get("schema")
    if schema not in ("layouttask.receiver.submission.v1", "layouttask.receiver.submission.v2"):
        raise ValidationError("invalid_schema", "unsupported receiver submission schema")
    v2 = schema.endswith(".v2")
    metadata = {}
    if v2:
        kind = payload.get("submission_kind")
        if kind not in ("trial", "final"):
            raise ValidationError("invalid_submission", "submission_kind must be trial or final")
        for field in ASSIGNMENT_FIELDS:
            if field not in payload:
                raise ValidationError("invalid_submission", f"{field} is required")
        for field in ("assignment_id", "sequence_id", "schedule_version"):
            require_text(payload[field], field)
        if type(payload["participant_number"]) is not int or payload["participant_number"] < 1:
            raise ValidationError("invalid_submission", "participant_number must be a positive integer")
        if payload["assignment_mode"] not in ("automatic", "replacement"):
            raise ValidationError("invalid_submission", "assignment_mode is invalid")
        if payload["requested_sequence_id"] is not None and not isinstance(payload["requested_sequence_id"], str):
            raise ValidationError("invalid_submission", "requested_sequence_id is invalid")
        if type(payload["replacement_attempt"]) is not int or payload["replacement_attempt"] < 0:
            raise ValidationError("invalid_submission", "replacement_attempt is invalid")
        if payload["rotation_index"] is not None and (type(payload["rotation_index"]) is not int or payload["rotation_index"] < 0):
            raise ValidationError("invalid_submission", "rotation_index is invalid")
        metadata = {field: payload[field] for field in ASSIGNMENT_FIELDS}
        metadata["submission_kind"] = kind
        if kind == "trial":
            metadata["trial_session_id"] = safe_path_segment(payload.get("trial_session_id"), "trial_session_id")
            for field in ("trial_type", "task_id", "qid", "hash8", "encoding", "encoded"):
                metadata[field] = require_text(payload.get(field), field)
            if metadata["trial_type"] not in ("formal", "tutorial"):
                raise ValidationError("invalid_submission", "trial_type is invalid")
            for field in ("trial_index", "presentation_id"):
                value = payload.get(field)
                if metadata["trial_type"] == "formal" and (value is None or value == ""):
                    raise ValidationError("invalid_submission", f"{field} is required for formal trials")
                if field == "trial_index" and value is not None and type(value) is not int:
                    raise ValidationError("invalid_submission", "trial_index must be an integer")
                if field == "presentation_id" and value is not None and not isinstance(value, str):
                    raise ValidationError("invalid_submission", "presentation_id must be a string")
                metadata[field] = value
        elif any(field in payload for field in TRIAL_FIELDS):
            raise ValidationError("invalid_submission", "final submissions cannot contain trial fields")

    experiment_id = safe_path_segment(payload.get("experiment_id"), "experiment_id")
    participant_id = safe_path_segment(payload.get("participant_id"), "participant_id")
    session_id = safe_path_segment(payload.get("session_id"), "session_id")
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
        **metadata,
    )
