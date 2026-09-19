from pathlib import Path
import os

from .archive import build_archive_backend
from .storage import ReceiverStorage


def main() -> None:
    data_dir = Path(os.environ.get("DATA_DIR", "/app/data"))
    backend = build_archive_backend(
        os.environ.get("ARCHIVE_MODE", "local"),
        Path(os.environ.get("ARCHIVE_LOCAL_DIR", str(data_dir / "archive"))),
        os.environ.get("ARCHIVE_RCLONE_REMOTE") or None,
    )
    count = ReceiverStorage(
        data_dir,
        archive_backend=backend,
        delete_local_after_success=os.environ.get("ARCHIVE_DELETE_LOCAL_AFTER_SUCCESS", "true").lower() == "true",
    ).retry_pending()
    print(f"retried {count} pending receiver submission(s)")


if __name__ == "__main__":
    main()
