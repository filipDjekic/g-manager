#!/usr/bin/env python3
"""Atomically publish an immutable, already signed Client candidate to the HTTPS document root."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile
import zipfile

def digest(path):
    checksum=hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda:source.read(1024*1024),b''): checksum.update(chunk)
    return checksum.hexdigest()

def publish(candidate,root):
    candidate=Path(candidate);root=Path(root)
    if not root.is_absolute() or root.resolve().is_relative_to(Path(__file__).resolve().parents[2]): raise ValueError('Published packages require a persistent absolute directory outside the checkout')
    if any(path.is_symlink() for path in (root,*root.parents)): raise ValueError('Distribution directory symlinks are forbidden')
    manifest=json.loads((candidate/'GManager.Client.manifest.json').read_text(encoding='utf-8-sig'))
    version=manifest.get('version','');sha=manifest.get('sha256','')
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:\.\d+)?',version) or not re.fullmatch(r'[a-fA-F0-9]{64}',sha): raise ValueError('Invalid release identity')
    if not manifest.get('signingSubject') or not re.fullmatch(r'[a-fA-F0-9]{40}',manifest.get('signingThumbprint','')): raise ValueError('Missing publisher identity')
    archive=candidate/'GManager.Client.zip'
    if digest(archive)!=sha.lower(): raise ValueError('Candidate hash mismatch')
    with zipfile.ZipFile(archive) as package:
        names=package.namelist()
        if 'release.json' not in names or 'release.p7s' not in names: raise ValueError('Signed release manifest is required')
        release=json.loads(package.read('release.json').decode('utf-8-sig'))
        if release.get('mode')!='Production' or release.get('version')!=version or not package.read('release.p7s'): raise ValueError('Invalid production release manifest')
        if any(re.search(r'(?i)\.(pfx|p12|key|pem)$',name) for name in names): raise ValueError('Private signing/key material is forbidden in a package')
    root.mkdir(parents=True,exist_ok=True);target=root/version
    if target.exists():
        if digest(target/'GManager.Client.zip')!=sha.lower(): raise ValueError('An immutable release version already has different bytes')
        if json.loads((target/'GManager.Client.manifest.json').read_text(encoding='utf-8-sig'))!=manifest: raise ValueError('Published manifest does not match the immutable candidate')
        if (target/'GManager.Client.zip.sha256').read_text().strip()!=sha.lower()+'  GManager.Client.zip': raise ValueError('Published checksum is invalid')
        return target
    temporary=Path(tempfile.mkdtemp(prefix='.publishing-',dir=root))
    try:
        for name in ('GManager.Client.zip','GManager.Client.manifest.json'):
            shutil.copyfile(candidate/name,temporary/name);(temporary/name).chmod(0o644)
        checksum=temporary/'GManager.Client.zip.sha256'
        checksum.write_text(sha.lower()+'  GManager.Client.zip\n',encoding='utf-8');checksum.chmod(0o644)
        temporary.chmod(0o755);temporary.rename(target)
    finally:
        if temporary.exists(): shutil.rmtree(temporary)
    return target

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('candidate');parser.add_argument('root');options=parser.parse_args()
    print(publish(options.candidate,options.root))
