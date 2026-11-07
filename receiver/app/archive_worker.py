from __future__ import annotations

import sys
import threading

from .storage import ReceiverStorage


class ArchiveWorker:
    """One scanner; all work and per-target progress survive in the existing SQLite store."""

    def __init__(self, storage: ReceiverStorage, interval_seconds: float = 30):
        self.storage = storage
        self.interval_seconds = interval_seconds
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="receiver-archive", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=5)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self.storage.retry_pending()
            except Exception as error:
                print(f"archive_worker_error: {type(error).__name__}: {error}", file=sys.stderr)
            if self._stop.wait(self.interval_seconds):
                break
