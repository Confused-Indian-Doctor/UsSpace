const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{setup}=require('./travel_ui_harness.cjs'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const check=String.raw`
import sys
from html.parser import HTMLParser
class Check(HTMLParser):
 def __init__(self):super().__init__();self.stack=[];self.tabs=0;self.buttons=0
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs)
  in_tabs=any(a.get('role')=='tablist' for _,a in self.stack)
  if in_tabs and not any(a.get('role')=='tab' for _,a in self.stack):
   assert tag=='button' and attrs.get('role')=='tab','Non-tab content was nested inside the four-column tab list'
  if attrs.get('role')=='tablist':self.tabs+=1
  if attrs.get('role')=='tab':self.buttons+=1
  if tag not in ('input','img','br','hr','meta','link','source','wbr'):self.stack.append((tag,attrs))
 def handle_endtag(self,tag):
  for i in range(len(self.stack)-1,-1,-1):
   if self.stack[i][0]==tag:self.stack=self.stack[:i];break
parser=Check();parser.feed(open(sys.argv[1]).read());assert parser.tabs==1 and parser.buttons==4
`;
for(const signedIn of [false,true])test('Bucket content stays outside the four-tab list '+(signedIn?'signed in':'signed out'),()=>{const h=setup();h.state(signedIn?{}:{uid:'',pairId:'',sharedReady:false});const folder=fs.mkdtempSync(path.join(os.tmpdir(),'usspace-dom-')),file=path.join(folder,'render.html');try{fs.writeFileSync(file,h.section.innerHTML);assert.doesNotThrow(()=>execFileSync('python3',['-c',check,file],{timeout:10000,stdio:['ignore','pipe','pipe']}));}finally{fs.rmSync(folder,{recursive:true,force:true});}});
