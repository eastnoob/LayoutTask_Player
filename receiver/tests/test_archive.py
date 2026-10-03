import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from app.archive import ArchiveResult, LocalArchiveBackend, MultiArchiveBackend, RcloneArchiveBackend


class ArchiveTests(unittest.TestCase):
    def test_multi_archive_backend_keeps_target_results_separate(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            spool = Path(temp_dir) / "spool" / "sub1"
            spool.mkdir(parents=True)
            calls = []

            class Target:
                def __init__(self, name, succeeds):
                    self.name = name
                    self.succeeds = succeeds

                def archive(self, spool_dir, archive_key):
                    calls.append((self.name, archive_key))
                    if not self.succeeds:
                        return ArchiveResult(ok=False, error=f"{self.name} unavailable")
                    return ArchiveResult(ok=True, archive_uri=f"{self.name}://{archive_key}")

            backend = MultiArchiveBackend(
                {
                    "jianguoyun": Target("jianguoyun", True),
                    "sciebo": Target("sciebo", False),
                },
            )

            result = backend.archive(spool, "layout_task_v1/P001/S001/sub1")

            self.assertFalse(result.ok)
            self.assertEqual(result.archive_uri, "jianguoyun://layout_task_v1/P001/S001/sub1")
            self.assertEqual(
                [(item.target, item.ok) for item in result.target_results],
                [("jianguoyun", True), ("sciebo", False)],
            )
            self.assertEqual(calls, [("jianguoyun", "layout_task_v1/P001/S001/sub1"), ("sciebo", "layout_task_v1/P001/S001/sub1")])

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

    def test_local_archive_rejects_targets_outside_archive_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            spool = root / "spool" / "sub1"
            spool.mkdir(parents=True)
            (spool / "layout_session_P001_S001.csv").write_text("a\n1\n", encoding="utf-8")

            backend = LocalArchiveBackend(root / "archive")
            result = backend.archive(spool_dir=spool, archive_key="../outside")

            self.assertFalse(result.ok)
            self.assertEqual(result.error, "archive key escapes archive root")
            self.assertFalse((root / "outside").exists())

    def test_rclone_archive_invokes_copy(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            spool = Path(temp_dir) / "spool" / "sub1"
            spool.mkdir(parents=True)
            run = Mock(return_value=subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr=""))
            backend = RcloneArchiveBackend("layouttask:submissions", run_impl=run)

            result = backend.archive(spool_dir=spool, archive_key="layout_task_v1/P001/S001/sub1")

            self.assertTrue(result.ok)
            self.assertEqual(result.archive_uri, "rclone://layouttask:submissions/layout_task_v1/P001/S001/sub1")
            self.assertGreaterEqual(run.call_count, 2)
            mkdir_args = run.call_args_list[0].args[0]
            last_mkdir_args = run.call_args_list[-2].args[0]
            copy_args = run.call_args_list[-1].args[0]
            self.assertEqual(mkdir_args, ["rclone", "mkdir", "layouttask:submissions"])
            self.assertEqual(last_mkdir_args, ["rclone", "mkdir", "layouttask:submissions/layout_task_v1/P001/S001/sub1"])
            self.assertEqual(copy_args[:2], ["rclone", "copy"])
            self.assertEqual(copy_args[1:], ["copy", str(spool), "layouttask:submissions/layout_task_v1/P001/S001/sub1"])


if __name__ == "__main__":
    unittest.main()
