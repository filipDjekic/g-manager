#!/usr/bin/env python3
"""Actual Alertmanager delivery to a disposable private receiver, never an external contact."""
import io
import json
import subprocess
import tarfile
import time
import uuid

ALERT_IMAGE='prom/alertmanager:v0.28.1@sha256:27c475db5fb156cab31d5c18a4251ac7ed567746a2483ff264516437a39b15ba'
RECEIVER_IMAGE='gmanager-infrastructure-test'
CONFIG='''route:
  receiver: isolated
  group_wait: 1s
  group_interval: 1s
  repeat_interval: 1h
receivers:
  - name: isolated
    webhook_configs:
      - url: http://receiver:8080/alerts
        send_resolved: false
        http_config:
          authorization:
            type: Bearer
            credentials: isolated-delivery-fixture
'''
SERVER='''from http.server import BaseHTTPRequestHandler, HTTPServer
import json
class Receiver(BaseHTTPRequestHandler):
    def do_POST(self):
        value=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if self.headers.get('Authorization')!='Bearer isolated-delivery-fixture':
            self.send_response(401);self.end_headers();return
        with open('/tmp/received.json','w') as out: json.dump(value,out)
        self.send_response(200);self.end_headers()
    def log_message(self,*args): pass
HTTPServer(('0.0.0.0',8080),Receiver).serve_forever()
'''

def run(*args,**kwargs): return subprocess.run(['docker',*args],check=True,capture_output=True,**kwargs)
def copy(name,filename,content):
    buffer=io.BytesIO()
    with tarfile.open(fileobj=buffer,mode='w') as archive:
        encoded=content.encode();entry=tarfile.TarInfo(filename);entry.size=len(encoded);entry.mode=0o644;archive.addfile(entry,io.BytesIO(encoded))
    run('cp','-',name+':/tmp/',input=buffer.getvalue())

def main():
    import sys
    image=sys.argv[1] if len(sys.argv)>1 else RECEIVER_IMAGE
    prefix='gmanager-alert-test-'+uuid.uuid4().hex[:10];network=prefix;receiver=prefix+'-receiver';manager=prefix+'-manager'
    try:
        run('network','create','--internal',network)
        run('create','--name',receiver,'--network',network,'--network-alias','receiver','--entrypoint','python3',image,'/tmp/receiver.py')
        copy(receiver,'receiver.py',SERVER);run('start',receiver)
        run('create','--name',manager,'--network',network,'--network-alias','alertmanager',ALERT_IMAGE,'--config.file=/tmp/alertmanager.yml','--cluster.listen-address=')
        copy(manager,'alertmanager.yml',CONFIG);run('start',manager)
        deadline=time.monotonic()+60
        while time.monotonic()<deadline:
            ready=subprocess.run(['docker','run','--rm','--network',network,'--entrypoint','curl',image,'--fail','--silent','http://alertmanager:9093/-/ready'],capture_output=True)
            if ready.returncode==0: break
            time.sleep(1)
        else: raise RuntimeError('Isolated Alertmanager never became ready')
        run('run','--rm','--network',network,'--entrypoint','curl',image,'--fail','--silent','-H','Content-Type: application/json','-d','[{"labels":{"alertname":"GManagerDeliveryFixture","severity":"test"}}]','http://alertmanager:9093/api/v2/alerts')
        while time.monotonic()<deadline:
            received=subprocess.run(['docker','exec',receiver,'cat','/tmp/received.json'],capture_output=True)
            if received.returncode==0:
                value=json.loads(received.stdout)
                assert value['alerts'][0]['labels']['alertname']=='GManagerDeliveryFixture'
                assert value['status']=='firing'
                print('PASS: real Alertmanager delivered the alert JSON and required bearer token to an isolated private receiver.')
                return
            time.sleep(1)
        raise RuntimeError('Isolated receiver did not receive the alert')
    finally:
        for name in (manager,receiver): subprocess.run(['docker','rm','-f',name],capture_output=True)
        subprocess.run(['docker','network','rm',network],capture_output=True)

if __name__=='__main__': main()
