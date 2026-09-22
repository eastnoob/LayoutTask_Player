from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil
import subprocess


@dataclass(frozen=True)
class ArchiveResult:
    ok: bool
    archive_uri: str | None = None
    error: str | None = None


class LocalArchiveBackend:
    def __init__(self, archive_dir: Path):
        self.archive_dir = archive_dir

    def archive(self, spool_dir: Path, archive_key: str) -> ArchiveResult:
        archive_root = self.archive_dir.resolve()
        target = (archive_root / archive_key).resolve()
        if target != archive_root and archive_root not in target.parents:
            return ArchiveResult(ok=False, error="archive key escapes archive root")
        if target.exists():
            shutil.rmtree(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(spool_dir, target)
        return ArchiveResult(ok=True, archive_uri=f"local://{archive_key}")


class RcloneArchiveBackend:
    def __init__(self, remote: str, run_impl=subprocess.run):
        self.remote = remote.rstrip("/")
        self.run_impl = run_impl

    def archive(self, spool_dir: Path, archive_key: str) -> ArchiveResult:
        target = f"{self.remote}/{archive_key}"
        for directory in _rclone_directory_chain(target):
            mkdir = self.run_impl(
                ["rclone", "mkdir", directory],
                text=True,
                capture_output=True,
            )
            if mkdir.returncode != 0:
                return ArchiveResult(ok=False, error=mkdir.stderr or mkdir.stdout or "rclone mkdir failed")
        completed = self.run_impl(
            ["rclone", "copy", str(spool_dir), target],
            text=True,
            capture_output=True,
        )
        if completed.returncode != 0:
            return ArchiveResult(ok=False, error=completed.stderr or completed.stdout or "rclone failed")
        return ArchiveResult(ok=True, archive_uri=f"rclone://{target}")


def build_archive_backend(mode: str, local_dir: Path, rclone_remote: str | None):
    if mode == "local":
        return LocalArchiveBackend(local_dir)
    if mode == "rclone":
        if not rclone_remote:
            raise ValueError("ARCHIVE_RCLONE_REMOTE is required when ARCHIVE_MODE=rclone")
        return RcloneArchiveBackend(rclone_remote)
    if mode == "disabled":
        return None
    raise ValueError(f"Unsupported archive mode: {mode}")


def _rclone_directory_chain(target: str) -> list[str]:
    remote, separator, path = target.partition(":")
    if not separator or not path:
        return [target]
    parts = [part for part in path.split("/") if part]
    return [f"{remote}:{'/'.join(parts[:index])}" for index in range(1, len(parts) + 1)]
