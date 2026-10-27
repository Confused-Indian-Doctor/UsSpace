#!/usr/bin/env python3
"""Keep tested browser/Node/server planner copies byte-identical; no credentials."""
from pathlib import Path
import json,sys
root=Path(__file__).resolve().parents[1];checking='--check' in sys.argv
out=root/'notification-server/floot/helpers';shared=root/'functions/shared'
out.mkdir(parents=True,exist_ok=True);shared.mkdir(parents=True,exist_ok=True)
def write(path,content):
 if checking:
  if not path.is_file() or path.read_text()!=content:raise SystemExit('Stale generated travel module: '+str(path.relative_to(root)))
 else:path.write_text(content)
write(shared/'package.json','{"type":"commonjs"}\n')
for stem,name in [('travel-models','usspaceTravelModels'),('travel-planner','usspaceTravelPlanner')]:
 source=(root/'app/src/main/assets'/f'{stem}.js').read_text();write(shared/f'{stem}.js',source)
 imports='import {usspaceTravelModels} from "./usspaceTravelModels";\n' if stem=='travel-planner' else ''
 require='const require=(path:string)=>{if(path==="./travel-models.js")return usspaceTravelModels;throw Error("Unknown module");};\n' if stem=='travel-planner' else ''
 write(out/f'{name}.tsx','// @ts-nocheck\n// Generated from the tested travel-only browser module.\n'+imports+'export const '+name+' = (()=>{const globalThis={};const module={exports:{}};\n'+require+source+'\nreturn module.exports;})();\n')
print(('Verified' if checking else 'Generated')+' matching Node and server travel models/planner')
import re
names={'travel-fetch':'usspaceTravelFetch','travel-ai':'usspaceTravelAI','travel-service':'usspaceTravelServiceCore','travel-providers':'usspaceTravelProviders','roster-service':'usspaceRosterServiceCore','jubilee-provider':'usspaceJubileeProvider'}
for stem,name in names.items():
 source=(root/'functions/src'/f'{stem}.mjs').read_text();imports=[]
 def convert(match):
  binding,path=match.groups()
  if path=='../shared/travel-planner.js':
   imports.append('import {usspaceTravelPlanner} from "./usspaceTravelPlanner";');return f'const {binding} = usspaceTravelPlanner;'
  if path.startswith('./'):
   other=names[Path(path).stem];imports.append(f'import {{{other}}} from "./{other}";');return f'const {binding} = {other};'
  imports.append(match.group(0));return ''
 body=re.sub(r"^import\s+(.+?)\s+from\s+['\"]([^'\"]+)['\"];?",convert,source,flags=re.M)
 symbols=re.findall(r'^export\s+(?:async\s+)?(?:function|const)\s+(\w+)',body,re.M)
 body=re.sub(r'^export\s+','',body,flags=re.M)
 write(out/f'{name}.tsx','// @ts-nocheck\n// Generated from the tested travel backend module.\n'+'\n'.join(imports)+'\nexport const '+name+' = (()=>{\n'+body+'\nreturn {'+', '.join(symbols)+'};})();\n')
print(('Verified' if checking else 'Generated')+' travel transport and service helpers')
