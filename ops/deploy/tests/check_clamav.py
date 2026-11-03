#!/usr/bin/env python3
"""Disposable real ClamAV health/clean/EICAR test. Never scans or modifies host files."""
import json
import subprocess
import time
import uuid

IMAGE='clamav/clamav:stable@sha256:6d87c712e3391e13c1ba6e05dfb074d4b1ddb5a6834b23bb9da990d2a4ef042a'

def main():
    name='gmanager-clamav-test-'+uuid.uuid4().hex[:12]
    try:
        subprocess.run(['docker','run','-d','--name',name,'-e','CLAMAV_NO_FRESHCLAMD=true',IMAGE],check=True,capture_output=True)
        deadline=time.monotonic()+600
        while time.monotonic()<deadline:
            state=json.loads(subprocess.check_output(['docker','inspect',name]))[0]['State']
            if state.get('Health',{}).get('Status')=='healthy': break
            if not state['Running']: raise RuntimeError('Disposable ClamAV exited')
            time.sleep(2)
        else: raise RuntimeError('Disposable ClamAV did not become healthy')
        for content,expected in [(b'hello isolated clean file',0),(b'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',1)]:
            result=subprocess.run(['docker','exec','-i',name,'clamdscan','--stream','--no-summary','-'],input=content,capture_output=True)
            if result.returncode!=expected: raise RuntimeError('Unexpected clean/malware scan result: '+result.stdout.decode(errors='replace'))
        print('PASS: real ClamAV healthy; clean input accepted; EICAR rejected. No Windows enforcement tested.')
    finally:
        subprocess.run(['docker','rm','-f',name],capture_output=True)

if __name__=='__main__': main()
