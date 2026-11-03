#!/usr/bin/env python3
"""Public release metadata, never shell code. Secrets stay in the host secret store."""
import argparse
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
from urllib.parse import urlparse

PUBLIC_KEYS = (
    'DEPLOY_ENV', 'APP_RELEASE', 'BACKEND_IMAGE', 'FRONTEND_IMAGE', 'CANONICAL_ORIGIN',
    'APP_PORT', 'PUBLIC_HOST', 'DEPLOY_STATE_DIR', 'DEPLOY_SECRETS_DIR', 'CLIENT_RELEASES_DIR',
    'DOCUMENT_STORAGE_BACKEND', 'DOCUMENT_S3_ENDPOINT', 'DOCUMENT_S3_REGION', 'DOCUMENT_S3_BUCKET',
    'AI_PROVIDER', 'AI_ENDPOINT', 'AI_MODEL', 'BACKUP_RETENTION_DAYS', 'BACKUP_INTERVAL_SECONDS',
    'BACKUP_RESTORE_INTERVAL', 'RESTIC_REPOSITORY', 'STATION_POLICY_SIGNING_KEY_ID',
    'STATION_POLICY_SIGNING_PUBLIC_KEY', 'GAMING_CLIENT_VERSION', 'GAMING_CLIENT_MINIMUM_VERSION',
    'GAMING_CLIENT_DOWNLOAD_URL', 'GAMING_CLIENT_SHA256', 'GAMING_CLIENT_PACKAGE_SIGNING_SUBJECT',
    'GAMING_CLIENT_PACKAGE_SIGNING_THUMBPRINT', 'INITIAL_OWNER_EMAIL', 'INITIAL_OWNER_NAME',
    'ENABLE_TLS', 'ENABLE_MONITORING', 'SMTP_HOST', 'SMTP_PORT', 'NOTIFICATION_EMAIL_ENABLED',
)
REQUIRED = ('APP_RELEASE', 'BACKEND_IMAGE', 'FRONTEND_IMAGE', 'CANONICAL_ORIGIN',
            'DEPLOY_STATE_DIR', 'DEPLOY_SECRETS_DIR', 'CLIENT_RELEASES_DIR', 'STATION_POLICY_SIGNING_KEY_ID', 'STATION_POLICY_SIGNING_PUBLIC_KEY',
            'GAMING_CLIENT_VERSION', 'GAMING_CLIENT_MINIMUM_VERSION', 'GAMING_CLIENT_DOWNLOAD_URL',
            'GAMING_CLIENT_SHA256', 'GAMING_CLIENT_PACKAGE_SIGNING_SUBJECT',
            'GAMING_CLIENT_PACKAGE_SIGNING_THUMBPRINT', 'RESTIC_REPOSITORY')

def validate(config):
    config.setdefault('DEPLOY_ENV','staging')
    if config['DEPLOY_ENV'] not in ('staging','production'): raise ValueError('Unknown deployment environment')
    if set(config) - set(PUBLIC_KEYS): raise ValueError('Release contains unapproved keys')
    if any(not isinstance(v, str) or any(c in v for c in '\r\n\0') for v in config.values()):
        raise ValueError('Release values must be single-line strings')
    for key in REQUIRED:
        if not config.get(key): raise ValueError(f'{key} is required')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}', config['APP_RELEASE']):
        raise ValueError('Invalid release identifier')
    for key in ('BACKEND_IMAGE', 'FRONTEND_IMAGE'):
        if not re.fullmatch(r'[a-zA-Z0-9._:/-]+@sha256:[a-f0-9]{64}', config[key]):
            raise ValueError(f'{key} must be an immutable image digest')
    for key in ('CANONICAL_ORIGIN', 'GAMING_CLIENT_DOWNLOAD_URL'):
        uri=urlparse(config[key])
        if uri.scheme!='https' or not uri.hostname or uri.username or uri.password or uri.fragment or uri.query:
            raise ValueError(f'{key} must be a credential-free HTTPS URL')
        if key=='CANONICAL_ORIGIN' and uri.path not in ('','/'):
            raise ValueError('Canonical origin must not contain a path')
    for key in ('GAMING_CLIENT_VERSION','GAMING_CLIENT_MINIMUM_VERSION'):
        if not re.fullmatch(r'\d+\.\d+\.\d+(?:\.\d+)?',config[key]): raise ValueError(f'{key} must be numeric')
    def numeric_version(value): return tuple(map(int,(value+'.0').split('.')[:4]))
    if numeric_version(config['GAMING_CLIENT_MINIMUM_VERSION'])>numeric_version(config['GAMING_CLIENT_VERSION']): raise ValueError('Minimum Client version exceeds the published release')
    for key,length in (('GAMING_CLIENT_SHA256',64),('GAMING_CLIENT_PACKAGE_SIGNING_THUMBPRINT',40)):
        if not re.fullmatch('[a-fA-F0-9]{'+str(length)+'}',config[key]): raise ValueError(f'{key} is invalid')
    for key in ('DEPLOY_STATE_DIR','DEPLOY_SECRETS_DIR','CLIENT_RELEASES_DIR'):
        if not PurePosixPath(config[key]).is_absolute(): raise ValueError(f'{key} must be an absolute Linux host path')
    if config.get('DOCUMENT_STORAGE_BACKEND','local') not in ('local','s3'): raise ValueError('Unsupported document storage backend')
    if config.get('DOCUMENT_STORAGE_BACKEND')=='s3' and not config.get('DOCUMENT_S3_BUCKET'): raise ValueError('S3 bucket is required')
    if config.get('NOTIFICATION_EMAIL_ENABLED')=='true' and not config.get('SMTP_HOST'): raise ValueError('Enabled email delivery requires an SMTP relay')
    for key in ('ENABLE_TLS','ENABLE_MONITORING','NOTIFICATION_EMAIL_ENABLED'):
        if key in config and config[key] not in ('true','false'): raise ValueError(f'{key} must be true or false')
    for key,maximum in (('BACKUP_INTERVAL_SECONDS',604800),('BACKUP_RETENTION_DAYS',3650),('BACKUP_RESTORE_INTERVAL',365),('SMTP_PORT',65535),('APP_PORT',65535)):
        if key in config and (not config[key].isdigit() or not 1<=int(config[key])<=maximum): raise ValueError(f'{key} must be a positive bounded integer')
    if int(config.get('BACKUP_INTERVAL_SECONDS','86400'))<60: raise ValueError('Backup interval must be at least 60 seconds')
    if config.get('DEPLOY_ENV')=='production' and not config.get('RESTIC_REPOSITORY','').startswith('s3:https://'):
        raise ValueError('Production requires a configured off-site HTTPS S3 restic repository')
    if config.get('RESTIC_REPOSITORY','').startswith('s3:'):
        repository=urlparse(config['RESTIC_REPOSITORY'][3:])
        if repository.scheme!='https' or not repository.hostname or repository.username or repository.password or repository.query or repository.fragment:
            raise ValueError('Repository credentials must use secret files')
    config.setdefault('PUBLIC_HOST',urlparse(config['CANONICAL_ORIGIN']).netloc)
    config.setdefault('DOCUMENT_STORAGE_BACKEND','local')
    return config

def read(path): return validate(json.loads(Path(path).read_text(encoding='utf-8-sig')))

def state_directory():
    directory=Path(os.environ['DEPLOY_STATE_DIR'])
    checkout=Path(__file__).resolve().parents[2]
    if not directory.is_absolute() or directory.resolve().is_relative_to(checkout):
        raise ValueError('Deployment state must remain outside the checkout')
    if any(p.is_symlink() for p in [directory,*directory.parents]): raise ValueError('State directory symlinks are forbidden')
    directory.mkdir(mode=0o700,parents=True,exist_ok=True);directory.chmod(0o700)
    return directory

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['write','validate','get','compose','state'])
    parser.add_argument('path',nargs='?',default='');parser.add_argument('args',nargs=argparse.REMAINDER)
    args=parser.parse_args()
    if args.action=='state': print(state_directory());return
    if args.action=='write':
        config=validate({k:os.environ[k] for k in PUBLIC_KEYS if k in os.environ})
        path=Path(args.path);path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(config,indent=2)+'\n',encoding='utf-8')
        temporary.chmod(0o600);temporary.replace(path);return
    config=read(args.path)
    if args.action=='validate': print('Public release configuration valid; no secret values were serialized.')
    elif args.action=='get':
        if len(args.args)!=1 or args.args[0] not in PUBLIC_KEYS: raise ValueError('Expected one approved public key')
        print(config.get(args.args[0],''))
    else:
        directory=Path(__file__).resolve().parent
        command=['docker','compose','-f',str(directory/'compose.yml')]
        if config.get('ENABLE_TLS','true')=='true': command+=['-f',str(directory/'compose.tls.yml')]
        if config.get('ENABLE_MONITORING','true')=='true': command+=['-f',str(directory/'compose.monitoring.yml')]
        environment=os.environ.copy()
        for key in list(environment):
            if key.startswith('COMPOSE_'): environment.pop(key)
        for key in PUBLIC_KEYS: environment.pop(key,None)
        environment.update(config)
        sys.exit(subprocess.call(command+args.args,cwd=directory,env=environment))

if __name__=='__main__':
    try: main()
    except (ValueError,OSError) as error:
        print('Release configuration rejected: '+str(error),file=sys.stderr);sys.exit(2)
