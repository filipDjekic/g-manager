#!/usr/bin/env python3
"""Verify initial named-volume ownership, including a read-only backup mounting documents first."""
import subprocess
import sys
import uuid

def run(*args): return subprocess.run(['docker',*args],check=True,capture_output=True)
def main():
    image=sys.argv[1] if len(sys.argv)>1 else 'gmanager-infrastructure-test'
    prefix='gmanager-volume-test-'+uuid.uuid4().hex[:12]
    volumes=[]
    try:
        for suffix,target in (('documents','/documents'),('backup','/backup/output')):
            name=prefix+'-'+suffix;run('volume','create',name);volumes.append(name)
            first=run('run','--rm','-v',name+':'+target+':ro','--entrypoint','stat',image,'-c','%u:%g',target)
            assert first.stdout.decode().strip()=='10001:10001'
            run('run','--rm','-v',name+':'+target,'--entrypoint','/bin/bash',image,'-ec','test "$(id -u)" = 10001; test -w "$1"; printf isolated > "$1/ownership-fixture"','fixture',target)
        print('PASS: read-only first mounts preserve UID/GID 10001; runtime can write the document and backup volumes.')
    finally:
        for name in volumes: subprocess.run(['docker','volume','rm',name],capture_output=True)

if __name__=='__main__': main()
