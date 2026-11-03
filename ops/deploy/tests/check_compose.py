#!/usr/bin/env python3
"""Exercise the actual Compose parser without starting containers or reading production secrets."""
import itertools
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import test_release

DIRECTORY = Path(__file__).resolve().parents[1]
TARGET = '/usr/share/nginx/html/downloads/gmanager-client'


class ComposeConfigurationTest(unittest.TestCase):
    def setUp(self):
        if not shutil.which('docker'):
            self.fail('Docker CLI and Compose are required for production topology validation')
        self.temporary = tempfile.TemporaryDirectory(prefix='gmanager compose ')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.releases = self.root / 'published client packages'
        self.releases.mkdir()
        self.environment = {key: value for key, value in os.environ.items()
                            if not key.startswith('COMPOSE_') and key not in test_release.config.PUBLIC_KEYS}
        self.environment.update(test_release.ReleaseConfigTest().valid(),
                                CLIENT_RELEASES_DIR=str(self.releases),
                                DEPLOY_STATE_DIR=str(self.root / 'state'),
                                DEPLOY_SECRETS_DIR=str(self.root / 'isolated-secrets'),
                                PUBLIC_HOST='gaming.example.test')

    def compose(self, arguments, overlays=('tls', 'monitoring'), environment=None):
        command = ['docker', 'compose', '--env-file', os.devnull,
                   '-f', str(DIRECTORY / 'compose.yml')]
        for name in overlays:
            command.extend(['-f', str(DIRECTORY / f'compose.{name}.yml')])
        return subprocess.run(command + ['config'] + arguments,
                              cwd=DIRECTORY, env=self.environment if environment is None else environment,
                              capture_output=True, text=True, timeout=45)

    def test_uninterpolated_full_topology(self):
        result = self.compose(['--no-interpolate', '--quiet'])
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_every_overlay_combination_preserves_the_protected_bind(self):
        for tls, monitoring in itertools.product((False, True), repeat=2):
            overlays = tuple(name for name, enabled in [('tls', tls), ('monitoring', monitoring)] if enabled)
            with self.subTest(overlays=overlays):
                result = self.compose(['--format', 'json'], overlays)
                self.assertEqual(result.returncode, 0, result.stderr)
                topology = json.loads(result.stdout)
                mounts = [mount for mount in topology['services']['frontend']['volumes']
                          if mount['target'] == TARGET]
                self.assertEqual(len(mounts), 1)
                mount = mounts[0]
                self.assertEqual(mount['type'], 'bind')
                self.assertEqual(Path(mount['source']).resolve(), self.releases.resolve())
                self.assertIs(mount['read_only'], True)
                # Compose 2 omits false fields in JSON; Compose 5 writes them explicitly.
                self.assertIs(mount.get('bind', {}).get('create_host_path', False), False)
                self.assertEqual('tls' in topology['services'], tls)
                self.assertEqual('prometheus' in topology['services'], monitoring)

    def test_missing_or_empty_client_release_directory_is_rejected(self):
        for value in (None, ''):
            with self.subTest(value=value):
                environment = self.environment.copy()
                environment.pop('CLIENT_RELEASES_DIR')
                if value is not None:
                    environment['CLIENT_RELEASES_DIR'] = value
                result = self.compose(['--quiet'], environment=environment)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('Client release directory required', result.stderr)


if __name__ == '__main__':
    unittest.main()
