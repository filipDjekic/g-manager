#!/usr/bin/env python3
"""Run only on the protected deployment host, in the authorized group 10001."""
import os
import re
from pathlib import Path
import tempfile
from urllib.parse import urlparse

NAMES={
 'smtp_username':'SMTP_USERNAME','smtp_password':'SMTP_PASSWORD','smtp_from':'SMTP_FROM',
 'jwt_secret':'JWT_SECRET','db_username':'DB_USERNAME','db_password':'DB_PASSWORD',
 'db_root_password':'DB_ROOT_PASSWORD','migration_db_password':'MIGRATION_DB_PASSWORD',
 'backup_db_password':'BACKUP_DB_PASSWORD',
 'document_s3_access_key':'S3_ACCESS_KEY','document_s3_secret_key':'S3_SECRET_KEY',
 'backup_encryption_key':'BACKUP_KEY','ai_api_key':'AI_API_KEY',
 'station_policy_signing_private_key':'STATION_POLICY_SIGNING_PRIVATE_KEY',
 'initial_owner_password':'INITIAL_OWNER_PASSWORD','backup_coordination_key':'BACKUP_COORDINATION_KEY','restore_verifier_password':'RESTORE_VERIFIER_PASSWORD',
 'restic_password':'RESTIC_PASSWORD','restic_access_key':'RESTIC_ACCESS_KEY_ID',
 'restic_secret_key':'RESTIC_SECRET_ACCESS_KEY','alert_webhook_url':'ALERT_WEBHOOK_URL',
 'alert_webhook_token':'ALERT_WEBHOOK_TOKEN','grafana_admin_password':'GRAFANA_ADMIN_PASSWORD',
}
def provision():
    directory=Path(os.environ['DEPLOY_SECRETS_DIR'])
    checkout=Path(__file__).resolve().parents[2]
    if not directory.is_absolute() or directory.resolve().is_relative_to(checkout): raise ValueError('Secrets require an absolute directory outside the checkout')
    if any(p.is_symlink() for p in [directory,*directory.parents]): raise ValueError('Secret directory symlinks are forbidden')
    required={'JWT_SECRET','DB_USERNAME','DB_PASSWORD','DB_ROOT_PASSWORD','BACKUP_DB_PASSWORD','MIGRATION_DB_PASSWORD','BACKUP_KEY','STATION_POLICY_SIGNING_PRIVATE_KEY','BACKUP_COORDINATION_KEY','RESTIC_PASSWORD','RESTORE_VERIFIER_PASSWORD'}
    if os.environ.get('DOCUMENT_STORAGE_BACKEND')=='s3': required.update(('S3_ACCESS_KEY','S3_SECRET_KEY'))
    if os.environ.get('INITIAL_OWNER_EMAIL'): required.add('INITIAL_OWNER_PASSWORD')
    if os.environ.get('SMTP_HOST'): required.update(('SMTP_USERNAME','SMTP_PASSWORD','SMTP_FROM'))
    if os.environ.get('AI_PROVIDER')=='http': required.add('AI_API_KEY')
    if os.environ.get('ENABLE_MONITORING','true')=='true':
        required.update(('ALERT_WEBHOOK_URL','ALERT_WEBHOOK_TOKEN','GRAFANA_ADMIN_PASSWORD'))
        uri=urlparse(os.environ.get('ALERT_WEBHOOK_URL',''))
        if uri.scheme!='https' or not uri.hostname or uri.username or uri.password: raise ValueError('Alert webhook must use HTTPS')
    for name in required:
        if not os.environ.get(name): raise ValueError('Missing secret: '+name)
    for name in ('JWT_SECRET','BACKUP_KEY','BACKUP_COORDINATION_KEY','RESTIC_PASSWORD'):
        if len(os.environ[name].encode())<32: raise ValueError(name+' requires at least 32 bytes')
    if not re.fullmatch(r'[A-Za-z0-9_-]{32,256}',os.environ['BACKUP_COORDINATION_KEY']): raise ValueError('Backup coordination key must be URL-safe and 32-256 characters')
    if os.environ.get('RESTIC_REPOSITORY','').startswith('s3:') and not all(os.environ.get(k) for k in ('RESTIC_ACCESS_KEY_ID','RESTIC_SECRET_ACCESS_KEY')): raise ValueError('Off-site credentials are required')
    immutable={'jwt_secret','db_username','db_password','db_root_password','backup_db_password','migration_db_password','restore_verifier_password','station_policy_signing_private_key','backup_encryption_key','restic_password'}
    for filename in immutable:
        path=directory/filename
        if path.is_symlink(): raise ValueError('Secret symlinks are forbidden')
        if path.exists() and path.read_text(encoding='utf-8')!=os.environ.get(NAMES[filename],''):
            raise ValueError('Controlled rotation is required before changing '+filename)
    directory.mkdir(parents=True,mode=0o700,exist_ok=True);directory.chmod(0o700)
    for filename,variable in NAMES.items():
        descriptor,temporary=tempfile.mkstemp(prefix='.provision-',dir=directory)
        try:
            with os.fdopen(descriptor,'w',encoding='utf-8',newline='') as stream: stream.write(os.environ.get(variable,''))
            os.chown(temporary,-1,10001);os.chmod(temporary,0o440)
            os.replace(temporary,directory/filename)
        finally:
            if os.path.exists(temporary): os.unlink(temporary)
    print('Host secrets provisioned; no secret values were logged.')
if __name__=='__main__': provision()
