#!/usr/bin/env python3
"""Deliver a real cold-process ACTION_SEND and leave it pending for sign-in."""
import importlib.util,pathlib,json,re,subprocess
spec=importlib.util.spec_from_file_location('cold_ui',pathlib.Path(__file__).with_name('android-v015-smoke.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
report={'status':'failed','action_send':'cold-process','saved_automatically':False,'cases':{},'steps':h.ui.steps}
image_uri=None
try:
 # Insert a real, bounded PNG fixture through Android's public MediaStore.
 # Including the same URI as Intent data grants read access to the cold app.
 inserted=h.ui.adb('shell','content','insert','--uri','content://media/external/images/media','--bind','_display_name:s:UsSpace-QA-cold-import.png','--bind','mime_type:s:image/png','--bind','relative_path:s:Pictures/')
 match=re.search(r'content://[^\s]+',inserted)
 if not match:raise RuntimeError('MediaStore did not return a cold image URI: '+inserted)
 image_uri=match.group(0)
 fixture=pathlib.Path('app/src/main/assets/our_icon.png').read_bytes()
 written=subprocess.run([h.ui.args.adb,'-s',h.ui.args.serial,'shell','-T','content','write','--uri',image_uri],input=fixture,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=35)
 if b'Error' in written.stdout+written.stderr:raise RuntimeError('MediaStore rejected the cold image fixture')
 h.ui.adb('shell','am','force-stop',h.ui.PACKAGE)
 h.ui.adb('shell','am','start','-W','-n',h.ui.PACKAGE+'/.MainActivity','-a','android.intent.action.SEND','-d',image_uri,'-t','image/png','--eu','android.intent.extra.STREAM',image_uri,'--grant-read-uri-permission')
 h.verify('cold-image-review',r'Is this the dream you meant',capture=True,direction=False)
 h.verify('cold-image-private',r'Private · only me',capture=True)
 h.verify('cold-image-preserved',r'Screenshot being reviewed',capture=True)
 h.tap('cold-image-discard',r'^Discard$')
 report['cases']['image']='passed: cold process, real MediaStore URI, private image review and explicit discard'
 h.ui.adb('shell','content','delete','--uri',image_uri);image_uri=None
 h.ui.adb('shell','am','force-stop',h.ui.PACKAGE)
 h.ui.adb('shell','am','start','-W','-n',h.ui.PACKAGE+'/.MainActivity','-a','android.intent.action.SEND','-t','text/plain','--es','android.intent.extra.TEXT','https://example.com/first-idea')
 # Keep startup at the top while the WebView delivers its pending cold intent.
 h.verify('cold-import-review',r'Is this the dream you meant',capture=True,direction=False)
 h.verify('cold-import-source',r'example\.com',capture=True)
 report['cases']['text']='passed: cold text review left pending for native sign-in test'
 report['status']='passed'
except Exception as error:
 report['error']=str(error)
 try:h.screenshot('cold-import-failure')
 except Exception:pass
 raise
finally:
 if image_uri:
  try:h.ui.adb('shell','content','delete','--uri',image_uri)
  except Exception as cleanup_error:report['image_cleanup_error']=str(cleanup_error)
 (h.output/'travel-cold-import-result.json').write_text(json.dumps(report,indent=2)+'\n')
