from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class ReceiverConfig:
    data_dir: Path
    allowed_origins: list[str]
    submit_token: str | None
    archive_mode: str = "local"
    archive_local_dir: Path = Path("/app/archive")
    archive_rclone_remote: str | None = None
    archive_delete_local_after_success: bool = True
    port: int = 3000
    max_body_bytes: int = 5_242_880
    max_files_per_submission: int = 8
    rate_limit_window_ms: int = 60_000
    rate_limit_max: int = 60


def load_config_from_env() -> ReceiverConfig:
    origins = [origin.strip() for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",") if origin.strip()]
    return ReceiverConfig(
        data_dir=Path(os.environ.get("DATA_DIR", "/app/data")),
        allowed_origins=origins,
        submit_token=os.environ.get("SUBMIT_TOKEN") or None,
        archive_mode=os.environ.get("ARCHIVE_MODE", "local"),
        archive_local_dir=Path(os.environ.get("ARCHIVE_LOCAL_DIR", "/app/archive")),
        archive_rclone_remote=os.environ.get("ARCHIVE_RCLONE_REMOTE") or None,
        archive_delete_local_after_success=os.environ.get("ARCHIVE_DELETE_LOCAL_AFTER_SUCCESS", "true").lower()
        == "true",
        port=int(os.environ.get("PORT", "3000")),
        max_body_bytes=int(os.environ.get("MAX_BODY_BYTES", "5242880")),
        max_files_per_submission=int(os.environ.get("MAX_FILES_PER_SUBMISSION", "8")),
        rate_limit_window_ms=int(os.environ.get("RATE_LIMIT_WINDOW_MS", "60000")),
        rate_limit_max=int(os.environ.get("RATE_LIMIT_MAX", "60")),
    )
