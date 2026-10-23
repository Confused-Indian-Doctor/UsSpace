#!/usr/bin/env python3
"""Real release UI with separately installed demo-Auth/Firestore instrumentation.
The fixtures are emulator-only test data. No JavaScript is injected and no
production Google Sign-In, live provider result or health record is fabricated.
"""
import importlib.util,json,pathlib,time,re
spec=importlib.util.spec_from_file_location('travel_helpers',pathlib.Path(__file__).with_name('android-v015-smoke.py'))
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
ui=h.ui;output=ui.output
report={'status':'failed','scope':'actual signed release UI + native Firebase SDK against local demo emulators','production_google_signin_verified':False,'live_providers_verified':False,'javascript_injected':False,'steps':ui.steps}
def tap(label,pattern): h.tap('travel-'+label,pattern)
def verify(label,pattern): return h.verify('travel-'+label,pattern,capture=False,direction=True)
def screenshot(label):
    value=ui.adb('exec-out','screencap','-p',binary=True)
    if not value.startswith(b'\x89PNG\r\n\x1a\n'):raise RuntimeError('Invalid screenshot')
    (output/('UsSpace-travel-'+label+'.png')).write_bytes(value)
def command(name):
    ui.adb('shell','am','broadcast','-a','app.usspace.TRAVEL_QA','--es','command',name)
    time.sleep(1)
def bucket():
    ui.click('travel-us',r'(?:^| )Us$',allow_nav=True)
    tap('bucket',r'Bucket List')
    verify('heading',r'Our Bucket List')
def run():
    # Instrumentation is started by the surrounding shell and seeds no app-private
    # files: all records arrive through the actual native Firebase listeners.
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        if 'READY_AUTH_FIRESTORE_EMULATORS' in ui.adb('logcat','-d','-s','UsSpaceTravelQA:I'):break
        time.sleep(1)
    else:raise RuntimeError('Native Firebase emulator setup did not become ready')
    verify('pending-import-after-signin',r'example\.com');tap('discard-retained-import',r'^Discard$')
    bucket();verify('dreams',r'QA · Garden walk');screenshot('Dreams')
    tap('map-tab',r'^Map$');verify('map-heading',r'A map of our someday')
    tap('load-confirmed-map',r'^Load online map$')
    verify('map-renderer-ready',r'Confirmed places only|Tiles are unavailable')
    screenshot('Map')
    tap('place-details',r'^Details$');verify('source-notes',r'Take a slow walk')
    h.back('travel-details-back');verify('map-after-back',r'A map of our someday')
    tap('trips-tab',r'^Trips$');tap('open-trip',r'^Open trip$');verify('timeline',r'Our little weekend');screenshot('Trip-timeline')
    verify('stop-notes',r'Bring a book')
    tap('numbered-day-map',r'^Load numbered map$')
    verify('numbered-map-ready',r'Confirmed places only|Tiles are unavailable')
    screenshot('Trip-numbered-map')
    tap('remove-preview',r'^Remove$');verify('remove-not-applied',r'A proposal, not a changed plan')
    screenshot('Itinerary-preview');tap('discard-removal',r'^Discard proposal$');verify('discard-keeps-stop',r'Bring a book')
    tap('remove-reviewed',r'^Remove$');tap('apply-removal',r'^Apply changes$')
    verify('removal-applied',r'Room for a little adventure')
    tap('undo-removal',r'^Undo last applied edit$');verify('undo-restores-stop',r'Bring a book')
    tap('save-offline',r'^Save itinerary for offline reading$');verify('offline-confirmed',r'Itinerary and notes saved on this phone')
    h.back('travel-trip-parent');verify('trips-parent',r'New trip')
    tap('read-offline',r'^Read saved copy$');verify('offline-notes',r'Read-only notes');screenshot('Offline-notes')
    h.back('travel-offline-close');tap('open-trip-again',r'^Open trip$')
    tap('add-stop',r'Add moment');verify('stop-editor',r'Add a little moment')
    h.back('travel-editor-back');verify('timeline-after-editor-back',r'Our little weekend')
    tap('memories-tab',r'^Memories$');verify('memory',r'A slow afternoon worth keeping');screenshot('Memories')
    command('share-text');verify('import-review',r'Is this the dream you meant');verify('import-private',r'Private review|Private · only me');screenshot('Import-review')
    tap('discard-url',r'^Discard$');command('share-image');verify('image-review',r'Is this the dream you meant')
    verify('ocr-text',r'Glasgow Botanic Gardens');screenshot('OCR-review');tap('discard-image',r'^Discard$')
    command('offline');tap('trips-offline-tab',r'^Trips$');tap('offline-read-again',r'^Read saved copy$');verify('offline-read',r'Bring a book')
    h.back('travel-close-offline');command('online');command('partner');bucket()
    verify('partner-shared-dream',r'QA · Garden walk')
    # Native scoped listeners and offline getter must clear the prior account's
    # private item and downloaded shared copy; inspect real accessibility text.
    root=h.dump('travel-partner-scope');text=h.visible_text(root,safe=False)
    if 'Private coffee idea' in text or 'Ready for a quiet signal' in text:raise RuntimeError('Prior account private data survived account switch')
    screenshot('Partner-scope');tap('partner-trips',r'^Trips$');tap('partner-open-trip',r'^Open trip$');tap('partner-offline-copy',r'^Save itinerary for offline reading$');verify('partner-copy-saved',r'Itinerary and notes saved on this phone');report['status']='passed'
    print('ANDROID_TRAVEL_UI_TEST_PASSED')
if __name__=='__main__':
    try:run()
    except Exception as error:
        report['error']=str(error)
        try:screenshot('failure');h.dump('travel-failure')
        except Exception:pass
        raise
    finally:(output/'travel-ui-result.json').write_text(json.dumps(report,indent=2)+'\n')
