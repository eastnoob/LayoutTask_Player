from pathlib import Path
import os

from .archive import build_archive_backend
from .storage import ReceiverStorage


def main() -> None:
    data_dir = Path(os.environ.get("DATA_DIR", "/app/data"))
    label = os.environ.get("ARCHIVE_METADATA_LABEL") or None
    keep_local = int(os.environ.get("METADATA_ARCHIVE_LOCAL_KEEP", "3"))
    metadata_remote = os.environ.get("METADATA_ARCHIVE_RCLONE_REMOTE") or None
    metadata_backend = (
        build_archive_backend("rclone", data_dir / "metadata_archives", metadata_remote) if metadata_remote else None
    )
    result = ReceiverStorage(
        data_dir,
        metadata_archive_backend=metadata_backend,
        metadata_delete_local_after_upload=os.environ.get("METADATA_ARCHIVE_DELETE_LOCAL_AFTER_UPLOAD", "true").lower()
        == "true",
    ).archive_metadata(label=label, keep_local=keep_local)
    if result.uploaded_uri:
        print(f"archived receiver metadata to {result.uploaded_uri}")
    elif result.local_kept:
        print(f"archived receiver metadata to {result.local_path}")
    else:
        print("archived receiver metadata and removed the local archive copy")


if __name__ == "__main__":
    main()
