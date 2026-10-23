#!/usr/bin/env python3
"""Write and verify a real UI setting across an in-place signed APK upgrade."""
import importlib.util,pathlib,os,json
spec=importlib.util.spec_from_file_location('upgrade_ui',pathlib.Path(__file__).with_name('android-v015-smoke.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
stage=os.environ['USSPACE_UPGRADE_STAGE'];report={'status':'failed','stage':stage,'private_storage_read':False,'javascript_injected':False,'steps':h.ui.steps}
try:
    if stage=='before':
        try:h.verify('upgrade-baseline-home-ready',r'\bTogether for\b',capture=True)
        except RuntimeError:
            root=h.dump('upgrade-system-launcher-check')
            launcher_dialog=any(n.get('package') in ('android','com.android.systemui') and h.ui.matches(n,r'Pixel Launcher.*(?:responding|stopped)') for n in root.iter('node'))
            if not launcher_dialog:raise
            # Recover only the disposable emulator's launcher, never UsSpace.
            # No application storage or upgrade settings are cleared.
            h.ui.adb('shell','am','force-stop','com.google.android.apps.nexuslauncher')
            h.ui.adb('shell','am','start','-W','-n',h.ui.PACKAGE+'/.MainActivity')
            report['pixel_launcher_recovery']=True
            h.verify('upgrade-baseline-home-after-launcher-recovery',r'\bTogether for\b',capture=True)
        h.edit_date('upgrade-before','26/03/2023')
    elif stage=='after':
        h.verify('upgrade-new-home-ready',r'\bTogether for\b',capture=True)
        h.verify('upgrade-persisted-date',r'Since 26 March 2023',capture=True,direction=False)
        h.edit_date('upgrade-restore','25/03/2023')
        h.verify('upgrade-restored-official-date',r'Since 25 March 2023',capture=True,direction=False)
    else:raise ValueError('Unknown upgrade phase')
    report['status']='passed'
finally:(h.output/('upgrade-'+stage+'.json')).write_text(json.dumps(report,indent=2)+'\n')
