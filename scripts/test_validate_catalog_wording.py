import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("catalog_wording", Path(__file__).with_name("catalog_wording.py"))
wording = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(wording)


def repo_inputs() -> tuple[list[dict], int]:
    ext = json.loads((ROOT / "data/curated-extended.json").read_text(encoding="utf-8"))
    return ext["families"], int(ext["source_catalog"]["curated_count"])


def repo_texts() -> dict[str, str]:
    return {rel: (ROOT / rel).read_text(encoding="utf-8") for rel in wording.PHRASE_FILES}


class CatalogWordingChecks(unittest.TestCase):
    def test_current_repository_files_pass(self):
        fams, curated_n = repo_inputs()
        self.assertEqual(wording.catalog_wording_errors(fams, curated_n, repo_texts()), [])

    def test_agents_md_with_wrong_count_fails(self):
        fams, curated_n = repo_inputs()
        texts = repo_texts()
        texts["AGENTS.md"] = texts["AGENTS.md"].replace("85 curated + 12 optional", "84 curated + 12 optional", 1)
        errors = wording.catalog_wording_errors(fams, curated_n, texts)
        self.assertEqual(len(errors), 1, errors)
        self.assertTrue(errors[0].startswith("AGENTS.md missing catalog phrase"), errors)

    def test_readme_breakdown_with_wrong_monochrome_count_fails(self):
        fams, curated_n = repo_inputs()
        texts = repo_texts()
        texts["README.md"] = texts["README.md"].replace("80 monochrome", "79 monochrome", 1)
        errors = wording.catalog_wording_errors(fams, curated_n, texts)
        self.assertEqual(len(errors), 1, errors)
        self.assertTrue(errors[0].startswith("README.md missing catalog breakdown"), errors)


if __name__ == "__main__":
    unittest.main()
