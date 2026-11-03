"""Isolated public metadata and immutable-artifact contracts. No real release/certificate is created."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

DIRECTORY=Path(__file__).resolve().parents[1]
def module(name):
    spec=importlib.util.spec_from_file_location(name,DIRECTORY/(name+'.py'));value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
config=module('release_config');publisher=module('publish_client');policy=module('check_release_policy');secrets=module('provision_secrets')

class ReleaseConfigTest(unittest.TestCase):
    def valid(self):
        return dict(APP_RELEASE='test-1',BACKEND_IMAGE='ghcr.io/example/backend@sha256:'+'a'*64,
          FRONTEND_IMAGE='ghcr.io/example/frontend@sha256:'+'b'*64,CANONICAL_ORIGIN='https://gaming.example.test',
          DEPLOY_STATE_DIR='/var/lib/gmanager/state',DEPLOY_SECRETS_DIR='/var/lib/gmanager/secrets',CLIENT_RELEASES_DIR='/var/lib/gmanager/releases',
          STATION_POLICY_SIGNING_KEY_ID='deployment-key',STATION_POLICY_SIGNING_PUBLIC_KEY='public-test-fixture',GAMING_CLIENT_VERSION='4.0.0',GAMING_CLIENT_MINIMUM_VERSION='3.0.0',
          GAMING_CLIENT_DOWNLOAD_URL='https://gaming.example.test/downloads/4.0.0/GManager.Client.zip',
          GAMING_CLIENT_SHA256='c'*64,RESTIC_REPOSITORY='s3:https://backup.example.test/test-bucket',GAMING_CLIENT_PACKAGE_SIGNING_SUBJECT="CN=Example Organization, O=Gaming $literal 'quoted'",
          GAMING_CLIENT_PACKAGE_SIGNING_THUMBPRINT='d'*40)
    def test_spaces_quotes_and_shell_text_remain_exact_data(self):
        with tempfile.TemporaryDirectory() as work:
            path=Path(work)/'release.json';value=self.valid();value['GAMING_CLIENT_PACKAGE_SIGNING_SUBJECT']+=' $(never-execute)'
            path.write_text(json.dumps(value),encoding='utf-8')
            self.assertEqual(config.read(path)['GAMING_CLIENT_PACKAGE_SIGNING_SUBJECT'],value['GAMING_CLIENT_PACKAGE_SIGNING_SUBJECT'])
    def test_writer_has_an_explicit_allowlist_and_ignores_exported_credentials(self):
        with tempfile.TemporaryDirectory() as work:
            path=Path(work)/'release.json'
            with patch.dict(os.environ,self.valid()|{'DOCUMENT_S3_SECRET_KEY':'never-record-this-secret','MIGRATION_DB_PASSWORD':'also-never-recorded'},clear=True),patch('sys.argv',['release_config.py','write',str(path)]): config.main()
            self.assertNotIn('never-record',path.read_text());self.assertNotIn('PASSWORD',path.read_text())
    def test_mutable_images_unsafe_release_names_and_bad_https_are_rejected(self):
        for key,value in [('BACKEND_IMAGE','backend:latest'),('APP_RELEASE','../../escape'),('CANONICAL_ORIGIN','http://gaming.example.test'),('GAMING_CLIENT_DOWNLOAD_URL','https://user:password@example.test/file.zip'),('GAMING_CLIENT_VERSION','not-a-version'),('BACKUP_INTERVAL_SECONDS','0'),('GAMING_CLIENT_MINIMUM_VERSION','99.0.0')]:
            with self.subTest(key=key),self.assertRaises(ValueError): config.validate(self.valid()|{key:value})
    def test_credential_keys_in_metadata_are_rejected_even_if_not_used(self):
        with self.assertRaises(ValueError): config.validate(self.valid()|{'DOCUMENT_S3_SECRET_KEY':'private'})
    def test_production_requires_offsite_repository(self):
        with self.assertRaises(ValueError): config.validate(self.valid()|{'DEPLOY_ENV':'production','RESTIC_REPOSITORY':''})
        config.validate(self.valid()|{'DEPLOY_ENV':'production','RESTIC_REPOSITORY':'s3:https://backup.example.test/dedicated-bucket'})

class ProtectionTest(unittest.TestCase):
    def test_missing_approval_self_review_and_unrestricted_refs_are_rejected(self):
        valid={'protection_rules':[{'type':'required_reviewers','reviewers':[{'type':'Team'}],'prevent_self_review':True}],'deployment_branch_policy':{'protected_branches':True}}
        policy.validate(valid,'production')
        for value in ({},valid|{'deployment_branch_policy':None},valid|{'protection_rules':[{'type':'required_reviewers','reviewers':[{}],'prevent_self_review':False}]}):
            with self.assertRaises(ValueError): policy.validate(value,'production')

@unittest.skipUnless(os.name=='posix' and os.geteuid()==0,'Isolated Linux root fixture for secret group ownership')
class SecretProvisioningTest(unittest.TestCase):
    def test_protected_permissions_idempotence_and_rotation_refusal(self):
        with tempfile.TemporaryDirectory() as work:
            root=Path(work)/'secrets'
            environment={name:'isolated-secret-fixture-at-least-32-bytes' for name in secrets.NAMES.values()}
            environment.update(DEPLOY_SECRETS_DIR=str(root),DB_USERNAME='runtime_fixture',BACKUP_COORDINATION_KEY='a'*48,ENABLE_MONITORING='false')
            with patch.dict(os.environ,environment,clear=True): secrets.provision();secrets.provision()
            before={path.name:path.read_bytes() for path in root.iterdir()}
            for path in root.iterdir(): self.assertEqual(path.stat().st_mode&0o777,0o440);self.assertEqual(path.stat().st_gid,10001)
            with patch.dict(os.environ,environment|{'DB_PASSWORD':'a-different-private-value'},clear=True),self.assertRaisesRegex(ValueError,'Controlled rotation'): secrets.provision()
            self.assertEqual(before,{path.name:path.read_bytes() for path in root.iterdir()})
    def test_checkout_secret_directory_is_rejected_before_any_write(self):
        with patch.dict(os.environ,{'DEPLOY_SECRETS_DIR':str(DIRECTORY/'forbidden-secret-fixture')},clear=True),self.assertRaisesRegex(ValueError,'outside the checkout'): secrets.provision()

class PublisherStructureTest(unittest.TestCase):
    """Synthetic signature bytes test structure only; actual trust is gated by Windows Assert-Package."""
    def candidate(self,path,version='4.0.0',private=False):
        path.mkdir(exist_ok=True)
        with zipfile.ZipFile(path/'GManager.Client.zip','w') as archive:
            archive.writestr('release.json',json.dumps({'version':version,'mode':'Production'}))
            archive.writestr('release.p7s',b'SYNTHETIC-UNIT-TEST-STRUCTURE-NOT-A-TRUSTED-SIGNATURE')
            if private:archive.writestr('forbidden.pfx',b'not-a-real-certificate')
        sha=publisher.digest(path/'GManager.Client.zip')
        (path/'GManager.Client.manifest.json').write_text(json.dumps({'version':version,'sha256':sha,'signingSubject':'CN=Fixture','signingThumbprint':'a'*40}),encoding='utf-8')
    def test_publish_is_immutable_and_keeps_historical_versions(self):
        with tempfile.TemporaryDirectory() as work:
            root=Path(work);self.candidate(root/'candidate');first=publisher.publish(root/'candidate',root/'published')
            self.assertTrue((first/'GManager.Client.zip.sha256').is_file())
            self.assertEqual(first,publisher.publish(root/'candidate',root/'published'))
            self.candidate(root/'next','4.0.1');publisher.publish(root/'next',root/'published');self.assertTrue(first.is_dir())
            with (root/'candidate'/'GManager.Client.zip').open('ab') as stream:stream.write(b'tampered')
            with self.assertRaises(ValueError):publisher.publish(root/'candidate',root/'published')
    def test_private_material_and_missing_signature_fail_before_publication(self):
        with tempfile.TemporaryDirectory() as work:
            root=Path(work);self.candidate(root/'candidate',private=True)
            with self.assertRaises(ValueError): publisher.publish(root/'candidate',root/'published')
            self.assertFalse((root/'published').exists())

if __name__=='__main__': unittest.main()
