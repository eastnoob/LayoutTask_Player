import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from app.archive import LocalArchiveBackend, RcloneArchiveBackend


class ArchiveTests(unittest.TestCase):
    def test_local_archive_copies_spool_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            spool = root / "spool" / "sub1"
            spool.mkdir(parents=True)
            (spool / "layout_session_P001_S001.csv").write_text("a\n1\n", encoding="utf-8")

            backend = LocalArchiveBackend(root / "archive")
            result = backend.archive(
                spool_dir=spool,
                archive_key="layout_task_v1/P001/S001/sub1",
            )

            self.assertTrue(result.ok)
            self.assertEqual(result.archive_uri, "local://layout_task_v1/P001/S001/sub1")
            self.assertEqual(
                (
                    root
                    / "archive"
                    / "layout_task_v1"
                    / "P001"
                    / "S001"
                    / "sub1"
                    / "layout_session_P001_S001.csv"
                ).read_text(encoding="utf-8"),
                "a\n1\n",
            )

    def test_rclone_archive_invokes_copy(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            spool = Path(temp_dir) / "spool" / "sub1"
            spool.mkdir(parents=True)
            run = Mock(return_value=subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr=""))
            backend = RcloneArchiveBackend("layouttask:submissions", run_impl=run)

            result = backend.archive(spool_dir=spool, archive_key="layout_task_v1/P001/S001/sub1")

            self.assertTrue(result.ok)
            self.assertEqual(result.archive_uri, "rclone://layouttask:submissions/layout_task_v1/P001/S001/sub1")
            run.assert_called_once()
            args = run.call_args.args[0]
            self.assertEqual(args[:2], ["rclone", "copy"])
            self.assertEqual(args[1:], ["copy", str(spool), "layouttask:submissions/layout_task_v1/P001/S001/sub1"])


if __name__ == "__main__":
    unittest.main()
