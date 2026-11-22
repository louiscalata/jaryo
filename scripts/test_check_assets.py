#!/usr/bin/env python3
"""Regression tests for repository-root containment in check_assets.py."""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

CHECK_ASSETS = Path(__file__).with_name("check_assets.py")


class CheckAssetsTests(unittest.TestCase):
    def test_sibling_with_repo_name_prefix_is_outside_the_repository(self):
        with tempfile.TemporaryDirectory(prefix="jaryo-assets-") as temp:
            base = Path(temp)
            repo = base / "repo"
            sibling = base / "repo-escape"
            (repo / "scripts").mkdir(parents=True)
            (repo / "data").mkdir()
            sibling.mkdir()
            shutil.copy2(CHECK_ASSETS, repo / "scripts" / "check_assets.py")

            (repo / "index.html").write_text(
                '<link rel="stylesheet" href="../repo-escape/escaped.css">\n',
                encoding="utf-8",
            )
            (repo / "lab.css").write_text("", encoding="utf-8")
            (repo / "lab.js").write_text("", encoding="utf-8")
            (repo / "data" / "embedded-data.js").write_text("", encoding="utf-8")
            (repo / ".nojekyll").write_text("", encoding="utf-8")
            (sibling / "escaped.css").write_text("/* outside */\n", encoding="utf-8")

            result = subprocess.run(
                [sys.executable, "-I", "-W", "error", str(repo / "scripts" / "check_assets.py")],
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            self.assertIn("index.html -> ../repo-escape/escaped.css escapes the repo", result.stdout)


if __name__ == "__main__":
    unittest.main()
