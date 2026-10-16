#!/usr/bin/env python3
"""Write and verify a real UI setting across an in-place signed APK upgrade."""
import importlib.util,pathlib,os,json
spec=importlib.util.spec_from_file_location('upgrade_ui',pathlib.Path(__file__).with_name('android-v015-smoke.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
stage=os.environ['USSPACE_UPGRADE_STAGE'];report={'status':'failed','stage':stage,'private_storage_read':False,'javascript_injected':False,'steps':h.ui.steps}
try:
    if stage=='before':
        h.verify('upgrade-baseline-home-ready',r'\bTogether for\b',capture=True)
        h.edit_date('upgrade-before','26/03/2023')
    elif stage=='after':
        h.verify('upgrade-persisted-date',r'Since 26 March 2023',capture=True)
        h.edit_date('upgrade-restore','25/03/2023')
        h.verify('upgrade-restored-official-date',r'Since 25 March 2023',capture=True)
    else:raise ValueError('Unknown upgrade phase')
    report['status']='passed'
finally:(h.output/('upgrade-'+stage+'.json')).write_text(json.dumps(report,indent=2)+'\n')
