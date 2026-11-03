#!/usr/bin/env python3
"""Actual Nginx versioned-download routes in a disposable loopback-only HTTP fixture.

Does not create a signed package or claim to verify production TLS.
"""
import hashlib
import io
from pathlib import Path
import subprocess
import tarfile
import time
from urllib.error import HTTPError
from urllib.request import urlopen
import uuid

def run(*args,**kwargs): return subprocess.run(['docker',*args],check=True,capture_output=True,**kwargs)
def copy(name,target,files):
    buffer=io.BytesIO()
    with tarfile.open(fileobj=buffer,mode='w') as archive:
        for path,content in files.items():
            entry=tarfile.TarInfo(path);entry.size=len(content);entry.mode=0o644;archive.addfile(entry,io.BytesIO(content))
    run('cp','-',name+':'+target,input=buffer.getvalue())

def main():
    name='gmanager-download-test-'+uuid.uuid4().hex[:12]
    content=b'ISOLATED-DOWNLOAD-ROUTING-FIXTURE-NOT-A-SIGNED-PACKAGE'
    try:
        run('create','--name',name,'--add-host','backend:127.0.0.1','-p','127.0.0.1::8080','nginxinc/nginx-unprivileged:alpine3.24')
        root=Path(__file__).resolve().parents[3]
        copy(name,'/etc/nginx/conf.d/',{'default.conf':(root/'frontend/g-manager/ops/nginx.conf').read_bytes()})
        copy(name,'/usr/share/nginx/html/',{'index.html':b'G-Manager routing fixture','downloads/gmanager-client/4.0.0/GManager.Client.zip':content})
        run('start',name);origin='http://'+run('port',name,'8080/tcp').stdout.decode().strip()
        deadline=time.monotonic()+60
        while time.monotonic()<deadline:
            try:
                with urlopen(origin+'/healthz',timeout=2) as response:
                    if response.status==200: break
            except OSError: time.sleep(1)
        else: raise RuntimeError('Isolated Nginx did not become ready')
        with urlopen(origin+'/downloads/gmanager-client/4.0.0/GManager.Client.zip',timeout=5) as response:
            assert hashlib.sha256(response.read()).digest()==hashlib.sha256(content).digest()
            assert 'immutable' in response.headers['Cache-Control']
        for path in ('/downloads/gmanager-client/4.0.1/GManager.Client.zip','/downloads/gmanager-client/4.0.0/private.pfx','/internal/backup','/actuator/prometheus'):
            try: urlopen(origin+path,timeout=5)
            except HTTPError as error: assert error.code==404
            else: raise AssertionError('Private/missing route returned a successful response')
        print('PASS: Nginx serves exact versioned bytes and returns 404 for absent artifacts, private files and management paths. Production HTTPS remains an acceptance test.')
    finally: subprocess.run(['docker','rm','-f',name],capture_output=True)

if __name__=='__main__': main()
