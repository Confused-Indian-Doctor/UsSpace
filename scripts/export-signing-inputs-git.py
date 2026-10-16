#!/usr/bin/env python3
"""Relay public compiler inputs through a temporary orphan branch, without keys.

Useful when the execution workspace has no network access. The ordinary Actions
artifacts remain available. Each base64 text blob has an independent byte hash.
"""
import base64,hashlib,io,json,os,re,time,urllib.error,urllib.request,zipfile
from pathlib import Path
repository=os.environ['GITHUB_REPOSITORY'];source=os.environ['GITHUB_SHA'];token=os.environ['GITHUB_TOKEN']
if repository!='Confused-Indian-Doctor/UsSpace' or not re.fullmatch('[a-f0-9]{40}',source):raise SystemExit('Unexpected export scope')
root=Path('artifact-stage/signing-inputs');parts=Path('artifact-stage/apk-parts')
if (root/'SOURCE_COMMIT.txt').read_text().strip()!=source:raise SystemExit('Compiler source mismatch')
manifest=json.loads((root/'APK-PARTS.json').read_text())
if manifest['source_commit']!=source:raise SystemExit('Split APK provenance mismatch')
def api(path,body):
 payload=json.dumps(body).encode()
 for attempt in range(4):
  request=urllib.request.Request('https://api.github.com/repos/'+repository+path,data=payload,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','Content-Type':'application/json'},method='POST')
  try:
   with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)
  except urllib.error.HTTPError as error:
   if error.code not in (429,502,503) or attempt==3:raise SystemExit('Git input relay failed: HTTP '+str(error.code))
   time.sleep(min(15,int(error.headers.get('Retry-After','5'))))
def archive(files):
 stream=io.BytesIO()
 with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as target:
  for file,name in files:target.write(file,name)
 return stream.getvalue()
allowed={'SOURCE_COMMIT.txt','signing-inputs-metadata.json','APK-PARTS.json','SHA256SUMS','travel-runtime-androidTest.apk','android-sdk/build-tools/35.0.0/apksigner','android-sdk/build-tools/35.0.0/zipalign','android-sdk/build-tools/35.0.0/aapt','android-sdk/build-tools/35.0.0/lib/apksigner.jar','android-sdk/build-tools/35.0.0/lib64/libc++.so'}
files=[p for p in sorted(root.rglob('*')) if p.is_file()]
if {str(p.relative_to(root)) for p in files}!=allowed or any(p.is_symlink() for p in files):raise SystemExit('Only the explicit public compiler/tool inputs may be exported')
archives=[('signing-inputs.zip',archive([(p,'signing-inputs/'+str(p.relative_to(root))) for p in files]))]
for index,part in enumerate(manifest['parts']):
 if part['name']!=f'part-{index:03d}.bin':raise SystemExit('Unexpected part name')
 path=parts/part['name'];content=path.read_bytes()
 if len(content)!=part['bytes'] or hashlib.sha256(content).hexdigest()!=part['sha256']:raise SystemExit('Compiler part digest mismatch')
 archives.append((f'apk-part-{index:03d}.zip',archive([(path,part['name'])])))
report={'source_commit':source,'workflow_run_id':int(os.environ['GITHUB_RUN_ID']),'archives':[]};elements=[]
for name,data in archives:
 item={'name':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'chunks':[]}
 for index,offset in enumerate(range(0,len(data),1024*1024)):
  raw=data[offset:offset+1024*1024];text=base64.b64encode(raw).decode('ascii');path=f'archives/{name}/{index:04d}.b64'
  blob=api('/git/blobs',{'content':text,'encoding':'utf-8'})['sha']
  item['chunks'].append({'path':path,'blob_sha':blob,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()});elements.append({'path':path,'mode':'100644','type':'blob','sha':blob})
 report['archives'].append(item)
blob=api('/git/blobs',{'content':json.dumps(report,indent=2)+'\n','encoding':'utf-8'})['sha'];elements.append({'path':'SIGNING-INPUTS-MANIFEST.json','mode':'100644','type':'blob','sha':blob})
tree=api('/git/trees',{'tree':elements})['sha'];commit=api('/git/commits',{'message':'Temporary checked signing inputs for '+source,'tree':tree,'parents':[]})['sha']
branch='android-inputs-data/'+os.environ['GITHUB_RUN_ID']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1')
api('/git/refs',{'ref':'refs/heads/'+branch,'sha':commit})
print(json.dumps({'relay_branch':branch,'relay_commit':commit,'manifest_blob':blob,'source_commit':source,'archives':len(archives),'chunks':sum(len(x['chunks']) for x in report['archives'])}))
