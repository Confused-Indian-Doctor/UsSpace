'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/v014-integration.js'), 'utf8');
function fixture() {
  const nativeAuth = {signedIn: true, uid: 'al'};
  const state = {sync: {signedIn: true, uid: 'al', paired: false, coupleId: ''}};
  const navigated = [], identities = [], timers = new Map(); let timerId = 0, settingsOpened = 0;
  const notice = {textContent: ''};
  const context = {
    state, NAV_GROUP: {}, document: {getElementById: id => id === 'notificationDeviceStatus' ? notice : null},
    UsAuth: {status: () => JSON.stringify(nativeAuth)},
    UsPreferences: {init() {}, onIdentity: value => identities.push(value), render() {}},
    UsWorkSchedule: {init() {}, onIdentity() {}},
    UsNotifications: {refresh() {}, status: () => JSON.stringify({signedIn: true, enabled: false})},
    onUsAuthState: value => { state.sync = Object.assign({}, state.sync, value); if (!value.signedIn) {state.sync.paired = false; state.sync.coupleId = ''; } },
    onUsSyncState: value => {state.sync = Object.assign({}, state.sync, value);},
    go: route => navigated.push(route), openSettings: () => {settingsOpened++;}, toast() {},
    setTimeout: callback => {const id = ++timerId; timers.set(id, callback); return id;},
    clearTimeout: id => timers.delete(id),
  };
  context.window = context; vm.createContext(context); vm.runInContext(source, context);
  const open = (overrides = {}) => context.onUsNotificationOpen(Object.assign({route: 'notes', recipientUid: 'al', coupleId: 'our-space', category: 'notes', eventId: 'e'.repeat(64)}, overrides));
  return {context, nativeAuth, state, navigated, identities, timers, notice, open, settingsOpened: () => settingsOpened};
}
let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }
check('verified notification tap waits for actual pair hydration on a cold launch', () => {
  const f = fixture(); f.open(); assert.deepEqual(f.navigated, []);
  f.context.onUsSyncState({paired: true, coupleId: 'our-space'});
  assert.deepEqual(f.navigated, ['notes']); assert.equal(f.timers.size, 0);
});
check('native account, rather than cached web auth, determines the settings and rota scope', () => {
  const f = fixture(); f.state.sync = {uid: 'previous-user', paired: true, coupleId: 'old-space'};
  f.context.onUsSyncState({}); const last = f.identities.at(-1);
  assert.equal(last.uid, 'al'); assert.equal(last.paired, false); assert.equal(last.coupleId, '');
});
check('sign-out clears a buffered route before another account can hydrate it', () => {
  const f = fixture(); f.open(); Object.assign(f.nativeAuth, {signedIn: false, uid: ''}); f.context.onUsAuthState({signedIn: false, uid: ''});
  Object.assign(f.nativeAuth, {signedIn: true, uid: 'yashika'}); f.context.onUsAuthState({signedIn: true, uid: 'yashika'});
  f.context.onUsSyncState({paired: true, coupleId: 'our-space'}); assert.deepEqual(f.navigated, []);
});
check('re-pairing discards a pending route from the previous couple', () => {
  const f = fixture(); f.open(); f.context.onUsSyncState({paired: true, coupleId: 'new-space'});
  f.context.onUsSyncState({paired: true, coupleId: 'our-space'}); assert.deepEqual(f.navigated, []);
});
check('only supported shared routes and the current recipient are accepted', () => {
  const f = fixture(); f.context.onUsSyncState({paired: true, coupleId: 'our-space'});
  for (const route of ['health', 'cycle', 'comfort', 'javascript:alert(1)']) f.open({route});
  f.open({recipientUid: 'other-user'}); assert.deepEqual(f.navigated, []);
  f.open({route: 'home', category: 'calendar'}); assert.deepEqual(f.navigated, ['home']);
});
check('buffered taps expire instead of navigating after an unrelated later connection', () => {
  const f = fixture(); f.open(); Array.from(f.timers.values()).forEach(fn => fn());
  f.context.onUsSyncState({paired: true, coupleId: 'our-space'}); assert.deepEqual(f.navigated, []);
});
check('existing Settings behaviour is retained and push status makes server setup explicit', () => {
  const f = fixture(); f.context.openSettings(); assert.equal(f.settingsOpened(), 1);
  f.context.onUsNotificationState({signedIn: true, enabled: true, permissionGranted: true, paired: true, registered: true});
  assert.match(f.notice.textContent, /private notification server/); assert.equal(f.context.NAV_GROUP['work-schedule'], 'life');
});
console.log(JSON.stringify({v014_integration_checks: checks, status: 'passed'}));
