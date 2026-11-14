import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('export_tokens', Path(__file__).with_name('export_tokens.py'))
tokens = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tokens)
CSS = tokens.css_text()

class TokenChecks(unittest.TestCase):
    def test_unknown_declaration_fails(self):
        with patch.object(tokens, 'css_text', return_value=CSS.replace(':root {', ':root {\n --unclassified-test: rgb(1,2,3);', 1)):
            with self.assertRaises(SystemExit): tokens.build()
    def test_unknown_last_declaration_without_semicolon_fails(self):
        start = CSS.index(':root {')
        end = CSS.index('}', start)
        modified = CSS[:end] + '  --zz: rgb(1,2,3)\n' + CSS[end:]
        with patch.object(tokens, 'css_text', return_value=modified):
            with self.assertRaises(SystemExit) as raised: tokens.build()
        self.assertIn('--zz: rgb(1,2,3)', str(raised.exception))
    def test_unknown_declaration_with_underscore_fails(self):
        with patch.object(tokens, 'css_text', return_value=CSS.replace(':root {', ':root {\n --my_tok: rgb(1,2,3);', 1)):
            with self.assertRaises(SystemExit) as raised: tokens.build()
        self.assertIn('--my_tok: rgb(1,2,3)', str(raised.exception))
    def test_system_dark_divergence_fails(self):
        marker = ':root:not([data-theme="light"])'
        start = CSS.index(marker)
        modified = CSS[:start] + CSS[start:].replace('--bg:', '--bg: #123456; --unused-original:', 1)
        with patch.object(tokens, 'css_text', return_value=modified):
            with self.assertRaises(SystemExit): tokens.build()
    def test_current_export_builds(self):
        self.assertTrue(tokens.build()['color']['dark'])

if __name__ == '__main__': unittest.main()
