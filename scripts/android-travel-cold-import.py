#!/usr/bin/env python3
"""Deliver a real cold-process ACTION_SEND and leave it pending for sign-in."""
import importlib.util,pathlib,json
spec=importlib.util.spec_from_file_location('cold_ui',pathlib.Path(__file__).with_name('android-v015-smoke.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
report={'status':'failed','action_send':'cold-process','saved_automatically':False,'steps':h.ui.steps}
try:
 h.ui.adb('shell','am','force-stop',h.ui.PACKAGE)
 h.ui.adb('shell','am','start','-W','-n',h.ui.PACKAGE+'/.MainActivity','-a','android.intent.action.SEND','-t','text/plain','--es','android.intent.extra.TEXT','https://example.com/first-idea')
 h.verify('cold-import-review',r'Is this the dream you meant',capture=True)
 h.verify('cold-import-source',r'example\.com',capture=True)
 report['status']='passed'
finally:(h.output/'travel-cold-import-result.json').write_text(json.dumps(report,indent=2)+'\n')
