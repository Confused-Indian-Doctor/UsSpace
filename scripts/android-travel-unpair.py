#!/usr/bin/env python3
import importlib.util,pathlib,json,time
spec=importlib.util.spec_from_file_location('unpair_ui',pathlib.Path(__file__).with_name('android-v015-smoke.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
report={'status':'failed','scope':'server-observed pair revocation in real native release UI','steps':h.ui.steps}
try:
 time.sleep(3)
 h.ui.click('unpair-us',r'(?:^| )Us$',allow_nav=True);h.tap('unpair-bucket',r'Bucket List')
 h.verify('unpair-empty-dreams',r'Our someday starts here',capture=True)
 text=h.visible_text(h.dump('unpair-no-shared-records'),safe=False)
 if 'QA · Garden walk' in text:raise RuntimeError('Shared travel records remained visible after unpair')
 h.tap('unpair-trips',r'^Trips$')
 text=h.visible_text(h.dump('unpair-no-offline-copy'),safe=False)
 if 'Ready for a quiet signal' in text or 'Our little weekend' in text:raise RuntimeError('Revoked pair offline copy survived')
 report['status']='passed'
finally:(h.output/'travel-unpair-result.json').write_text(json.dumps(report,indent=2)+'\n')
