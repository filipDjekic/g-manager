"""Keep every production COPY input in the restricted backup build context."""
from fnmatch import fnmatchcase
from pathlib import Path
import shlex
import unittest


BACKUP = Path(__file__).resolve().parents[2] / 'backup'


class BackupImageContractTest(unittest.TestCase):
    def test_all_local_copy_inputs_exist_and_are_included(self):
        patterns = (BACKUP / '.dockerignore').read_text(encoding='utf-8').splitlines()
        inputs = []
        for line in (BACKUP / 'Dockerfile').read_text(encoding='utf-8').splitlines():
            parts = shlex.split(line)
            if parts and parts[0] == 'COPY' and not parts[1].startswith('--from='):
                inputs.extend(parts[1:-1])
        self.assertIn('time-ledger-check.sql', inputs)
        self.assertIn('history-ledger-check.sql', inputs)
        for name in inputs:
            with self.subTest(file=name):
                self.assertTrue((BACKUP / name).is_file())
                included = True
                for pattern in patterns:
                    if pattern and not pattern.startswith('#') and fnmatchcase(name, pattern.lstrip('!')):
                        included = pattern.startswith('!')
                self.assertTrue(included, f'{name} is excluded from the Docker build context')
