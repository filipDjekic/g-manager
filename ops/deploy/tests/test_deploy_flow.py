"""Real deployment/rollback Bash and JSON code with isolated Docker/HTTPS boundary stubs.

These tests execute no production Docker commands, SQL, network requests or signing.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import test_release

SOURCE=Path(__file__).resolve().parents[1]

@unittest.skipUnless(os.name=='posix' and shutil.which('bash') and os.geteuid()==0,'Isolated Linux root fixture for group 10001; use the disposable backup image')
class DeploymentFlowTest(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup)
        self.root=Path(self.temporary.name);self.deploy=self.root/'checkout'/'ops'/'deploy';self.deploy.mkdir(parents=True)
        for path in SOURCE.iterdir():
            if path.is_file(): shutil.copyfile(path,self.deploy/path.name)
        self.state=self.root/'state';self.state.mkdir();self.secrets=self.root/'secrets';self.secrets.mkdir(mode=0o700)
        for name in ('jwt_secret','db_username','db_password','db_root_password','backup_db_password','migration_db_password','backup_encryption_key','station_policy_signing_private_key','backup_coordination_key','restic_password','restore_verifier_password','restic_access_key','restic_secret_key'):
            path=self.secrets/name;path.write_text('gmanager' if name=='db_username' else 'disposable-fixture-value-at-least-32-bytes');os.chown(path,-1,10001);path.chmod(0o440)
        self.published=self.root/'published client packages';self.published.mkdir()
        self.config=test_release.ReleaseConfigTest().valid()|dict(APP_RELEASE='before',DEPLOY_STATE_DIR=str(self.state),DEPLOY_SECRETS_DIR=str(self.secrets),CLIENT_RELEASES_DIR=str(self.published),ENABLE_TLS='false',ENABLE_MONITORING='false',GAMING_CLIENT_SHA256=hashlib.sha256(b'published-fixture').hexdigest())
        self.current=self.state/'current.json';self.current.write_text(json.dumps(self.config))
        binary=self.root/'bin';binary.mkdir();self.trace=self.root/'docker-calls.jsonl'
        self.executable(binary/'docker', '''import json,os,sys
with open(os.environ['TRACE'],'a') as out: out.write(json.dumps(sys.argv[1:])+'\\n')
if sys.argv[-1]=='backup': print('/backup/output/gmanager-isolated.sql.gz.enc')
if sys.argv[-1]=='migrate' and os.environ.get('FAIL_MIGRATION'): sys.exit(42)
''')
        self.executable(binary/'curl', '''import os,sys
args=sys.argv[1:];url=next((value for value in args if value.startswith('https://')), '')
if url.endswith('.zip') and os.environ.get('FAIL_DOWNLOAD'): sys.exit(22)
if '-D' in args:
    with open(args[args.index('-D')+1],'w') as out: out.write('strict-transport-security: max-age=31536000\\ncontent-security-policy: default-src self\\n')
if '-o' in args:
    with open(args[args.index('-o')+1],'wb') as out: out.write(b'published-fixture' if url.endswith('.zip') else b'G-Manager')
else: print('Authentication is required' if url.endswith('/api/v1/catalog') else 'G-Manager')
if '--write-out' in args: print('302' if os.environ.get('REDIRECT_PACKAGE') else '200',end='')
''')
        self.environment=os.environ|self.config|dict(APP_RELEASE='candidate',PATH=str(binary)+os.pathsep+os.environ['PATH'],TRACE=str(self.trace))
    def executable(self,path,source):
        path.write_text('#!/usr/bin/env python3\n'+source);path.chmod(0o755)
    def run_script(self,name,**environment):
        return subprocess.run(['bash',str(self.deploy/name)],env=self.environment|environment,capture_output=True,text=True,timeout=40)
    def test_successful_upgrade_migrates_restored_schema_first_and_keeps_rollback_outside_checkout(self):
        result=self.run_script('deploy.sh');self.assertEqual(result.returncode,0,result.stderr)
        calls=[json.loads(line) for line in self.trace.read_text().splitlines()]
        self.assertLess(next(i for i,args in enumerate(calls) if args[-1]=='migrate-restored'),next(i for i,args in enumerate(calls) if args[-1]=='migrate'))
        self.assertEqual(json.loads(self.current.read_text())['APP_RELEASE'],'candidate')
        self.assertEqual(json.loads((self.state/'previous.json').read_text())['APP_RELEASE'],'before')
        result=self.run_script('rollback.sh');self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(json.loads(self.current.read_text())['APP_RELEASE'],'before')
        self.assertEqual(json.loads(self.current.read_text())['GAMING_CLIENT_PACKAGE_SIGNING_SUBJECT'],self.config['GAMING_CLIENT_PACKAGE_SIGNING_SUBJECT'])
    def test_download_failure_does_not_promote_release(self):
        result=self.run_script('deploy.sh',FAIL_DOWNLOAD='1');self.assertNotEqual(result.returncode,0)
        self.assertEqual(json.loads(self.current.read_text())['APP_RELEASE'],'before');self.assertFalse((self.state/'previous.json').exists())
    def test_redirect_cannot_promote_even_when_its_body_has_the_expected_hash(self):
        result=self.run_script('deploy.sh',REDIRECT_PACKAGE='1');self.assertNotEqual(result.returncode,0)
        self.assertEqual(json.loads(self.current.read_text())['APP_RELEASE'],'before');self.assertFalse((self.state/'previous.json').exists())
    def test_missing_secret_stops_before_any_docker_or_migration(self):
        (self.secrets/'db_password').unlink()
        result=self.run_script('deploy.sh');self.assertNotEqual(result.returncode,0)
        self.assertFalse(self.trace.exists());self.assertEqual(json.loads(self.current.read_text())['APP_RELEASE'],'before')

    def test_invalid_client_release_directory_stops_before_any_docker_or_migration(self):
        file=self.root/'ordinary-file';file.write_text('not a directory')
        link=self.root/'linked-directory';link.symlink_to(self.published,target_is_directory=True)
        for path in (self.root/'absent-directory',file,link):
            with self.subTest(path=path):
                result=self.run_script('deploy.sh',CLIENT_RELEASES_DIR=str(path))
                self.assertNotEqual(result.returncode,0,result.stderr)
                self.assertIn('Existing Client release directory required',result.stderr)
                self.assertFalse(self.trace.exists())
                self.assertFalse((self.state/'previous.json').exists())
                self.assertEqual(json.loads(self.current.read_text())['APP_RELEASE'],'before')
