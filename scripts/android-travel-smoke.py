#!/usr/bin/env python3
"""Real release UI with separately installed demo-Auth/Firestore instrumentation.
The fixtures are emulator-only test data. No JavaScript is injected and no
production Google Sign-In, live provider result or health record is fabricated.
"""
import importlib.util,json,pathlib,time,re
spec=importlib.util.spec_from_file_location('travel_helpers',pathlib.Path(__file__).with_name('android-v015-smoke.py'))
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
ui=h.ui;output=ui.output
# Start page swipes outside the visible map; Leaflet consumes gestures that
# begin on its canvas. Avoid Android's edge-back gesture area as well.
original_adb=ui.adb
gesture_count=0
def travel_adb(*arguments,binary=False):
    global gesture_count
    values=list(arguments)
    if values[:3]==['shell','input','swipe']:
        gesture_count+=1
        root=h.dump('travel-scroll-geometry-'+str(gesture_count))
        top,bottom=ui.safe_region(root)
        maps=[ui.visible_bounds(n) for n in root.iter('node') if ui.matches(n,r'^Confirmed saved places map$') and ui.visible_bounds(n)]
        for bounds in maps:
            if bounds[3]<=top or bounds[1]>=bottom:continue
            free=[(top,min(bottom,bounds[1])),(max(top,bounds[3]),bottom)]
            start_free,end_free=max(free,key=lambda v:v[1]-v[0])
            if end_free-start_free<40:continue
            down=int(values[6])<int(values[4]);distance=abs(int(values[6])-int(values[4]))
            start=end_free-12 if down else start_free+12
            end=max(top+12,start-distance) if down else min(bottom-12,start+distance)
            if abs(end-start)<28:continue
            values[3]=values[5]=str(ui.width//2);values[4]=str(int(start));values[6]=str(int(end))
            ui.steps.append({'action':'scroll-page-outside-map','map_bounds':bounds,'from_y':start,'to_y':end})
            break
    return original_adb(*values,binary=binary)
ui.adb=travel_adb
report={'status':'failed','scope':'actual signed release UI + native Firebase SDK against local demo emulators','production_google_signin_verified':False,'live_providers_verified':False,'javascript_injected':False,'steps':ui.steps}
def tap(label,pattern):
    direction=pattern not in (r'^Map$',r'^Trips$',r'^Memories$')
    for attempt in range(2):
        try:
            root,node=h.find('travel-'+label,pattern,interactive=True,enabled=True,direction=direction)
            left,top,right,bottom=ui.usable_bounds(node,root)
            ui.adb('shell','input','tap',str((left+right)//2),str((top+bottom)//2))
            ui.steps.append({'action':'travel-'+label,'matched':ui.text_of(node),'bounds':[left,top,right,bottom]})
            time.sleep(0.45)
            return
        except RuntimeError as error:
            if attempt or 'actual visible element not found' not in str(error):raise
            direction=not direction
def verify(label,pattern):
    direction=pattern not in (r'Our Bucket List',r'A map of our someday')
    try:return h.verify('travel-'+label,pattern,capture=False,direction=direction)
    except RuntimeError as error:
        if 'actual visible element not found' not in str(error):raise
        return h.verify('travel-'+label,pattern,capture=False,direction=not direction)
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
    tap('trips-tab',r'^Trips$');tap('open-trip',r'^Open trip$');verify('timeline',r'Our little weekend')
    verify('stop-notes',r'Bring a book');screenshot('Trip-timeline')
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
    command('offline')
    ui.adb('shell','am','start','-W','-n',ui.PACKAGE+'/.MainActivity','-a','android.intent.action.SEND','-t','text/plain','--es','android.intent.extra.TEXT','QA-offline-save')
    verify('offline-import-review',r'Is this the dream you meant')
    verify('offline-import-private',r'Private · only me')
    tap('save-private-offline-idea',r'^Save selected ideas$')
    verify('offline-idea-retained',r'QA-offline-save')
    verify('offline-save-pending',r'Saved on this phone, waiting to sync')
    screenshot('Offline-save')
    tap('trips-offline-tab',r'^Trips$');tap('offline-read-again',r'^Read saved copy$');verify('offline-read',r'Bring a book')
    h.back('travel-close-offline');command('online');command('partner');bucket()
    verify('partner-shared-dream',r'QA · Garden walk')
    # Native scoped listeners and offline getter must clear the prior account's
    # private item and downloaded shared copy; inspect real accessibility text.
    root=h.dump('travel-partner-scope');text=h.visible_text(root,safe=False)
    if 'Private coffee idea' in text or 'QA-offline-save' in text or 'Ready for a quiet signal' in text:raise RuntimeError('Prior account private data survived account switch')
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
