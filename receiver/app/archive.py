from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil
import subprocess
from typing import Any


@dataclass(frozen=True)
class ArchiveTargetResult:
    target: str
    ok: bool
    archive_uri: str | None = None
    error: str | None = None


@dataclass(frozen=True)
class ArchiveResult:
    ok: bool
    archive_uri: str | None = None
    error: str | None = None
    target_results: tuple[ArchiveTargetResult, ...] = ()


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


class MultiArchiveBackend:
    """Fan out one archive operation to several independently retryable targets."""

    def __init__(self, targets: dict[str, Any]):
        if not targets:
            raise ValueError("at least one archive target is required")
        self.targets = dict(targets)

    @property
    def target_names(self) -> tuple[str, ...]:
        return tuple(self.targets)

    def archive_target(self, target_name: str, spool_dir: Path, archive_key: str) -> ArchiveResult:
        backend = self.targets.get(target_name)
        if backend is None:
            return ArchiveResult(ok=False, error=f"unknown archive target: {target_name}")
        return backend.archive(spool_dir, archive_key)

    def archive(self, spool_dir: Path, archive_key: str) -> ArchiveResult:
        results: list[ArchiveTargetResult] = []
        for target_name in self.target_names:
            try:
                result = self.archive_target(target_name, spool_dir, archive_key)
            except Exception as error:  # keep the other target attempt independent
                result = ArchiveResult(ok=False, error=str(error) or error.__class__.__name__)
            results.append(
                ArchiveTargetResult(
                    target=target_name,
                    ok=result.ok and bool(result.archive_uri),
                    archive_uri=result.archive_uri,
                    error=result.error,
                ),
            )
        return _combine_target_results(results)


def _combine_target_results(results: list[ArchiveTargetResult]) -> ArchiveResult:
    successful = [result for result in results if result.ok]
    failed = [result for result in results if not result.ok]
    errors = [f"{result.target}: {result.error or 'archive failed'}" for result in failed]
    return ArchiveResult(
        ok=not failed,
        archive_uri=successful[0].archive_uri if successful else None,
        error="; ".join(errors) if errors else None,
        target_results=tuple(results),
    )


def build_archive_backend(
    mode: str,
    local_dir: Path,
    rclone_remote: str | None,
    rclone_remotes: str | None = None,
):
    if mode == "local":
        return MultiArchiveBackend({"local": LocalArchiveBackend(local_dir)})
    if mode == "rclone":
        remotes = parse_archive_remotes(rclone_remotes)
        if not remotes and rclone_remote:
            remotes = [("primary", rclone_remote)]
        if not remotes:
            raise ValueError("ARCHIVE_RCLONE_REMOTE or ARCHIVE_RCLONE_REMOTES is required when ARCHIVE_MODE=rclone")
        return MultiArchiveBackend({name: RcloneArchiveBackend(remote) for name, remote in remotes})
    if mode == "disabled":
        return None
    raise ValueError(f"Unsupported archive mode: {mode}")


def parse_archive_remotes(value: str | None) -> list[tuple[str, str]]:
    if not value:
        return []
    remotes: list[tuple[str, str]] = []
    for index, item in enumerate(value.split(";"), start=1):
        item = item.strip()
        if not item:
            continue
        if "=" in item:
            name, remote = item.split("=", 1)
        else:
            name, remote = f"target-{index}", item
        name = name.strip()
        remote = remote.strip()
        if not name or not remote:
            raise ValueError("archive remote entries must contain a target name and remote")
        if any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for char in name):
            raise ValueError(f"invalid archive target name: {name}")
        if any(existing_name == name for existing_name, _ in remotes):
            raise ValueError(f"duplicate archive target name: {name}")
        remotes.append((name, remote))
    return remotes


def _rclone_directory_chain(target: str) -> list[str]:
    remote, separator, path = target.partition(":")
    if not separator or not path:
        return [target]
    parts = [part for part in path.split("/") if part]
    return [f"{remote}:{'/'.join(parts[:index])}" for index in range(1, len(parts) + 1)]
