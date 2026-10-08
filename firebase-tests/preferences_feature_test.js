'use strict';
const assert = require('node:assert/strict');
const P = require('../app/src/main/assets/preferences.js');
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
function fixture(account, theme, systemDark) {
  let current = { uid: account, signedIn: !!account, preferences: P.apply(P.defaults('UTC'), { theme: theme || 'system' }), syncState: 'synced' };
  if (typeof systemDark === 'boolean') current.systemDark = systemDark;
  const writes = [], attrs = {}, meta = {}, callbacks = {};
  const media = { matches: false, addEventListener(name, fn) { callbacks[name] = fn; } };
  const bridge = { status: () => JSON.stringify(current), refresh() {}, update(json) { const patch = JSON.parse(json); writes.push({ uid: current.uid, patch }); current.preferences = P.apply(current.preferences, patch); } };
  const storage = new Map();
  const document = { documentElement: { setAttribute(key, value) { attrs[key] = value; }, style: {} }, querySelector(selector) { return selector.startsWith('meta') ? { setAttribute(key, value) { meta[key] = value; } } : null; }, getElementById() { return null; } };
  const app = P.create({ bridge, document, window: { matchMedia() { return media; } }, storage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } });
  app.bootstrap();
  return { app, writes, attrs, meta, media, callbacks, current: () => current, switchTo(uid, nextTheme) { current = { uid, signedIn: !!uid, preferences: P.apply(P.defaults('UTC'), { theme: nextTheme || 'system' }), syncState: 'synced' }; return current; } };
}

test('notification opt-in defaults off with seven independent categories', () => {
  const value = P.defaults('Europe/London');
  assert.equal(value.notifications.enabled, false);
  assert.deepEqual(Object.keys(value.notifications.categories), P.categories);
  assert.ok(Object.values(value.notifications.categories).every(v => v === true));
  assert.equal(value.notifications.quietHours.enabled, false);
});
test('normalization removes private payloads and malformed preference values', () => {
  const value = P.normalize({ theme: 'dark', health: { steps: 7 }, cycle: { day: 4 }, uid: 'other', notifications: { enabled: 'true', categories: { notes: false, cycle: true }, quietHours: { enabled: true, start: '99:00', timeZone: 'Invalid/Location' } } }, 'UTC');
  assert.equal(value.theme, 'dark'); assert.equal(value.notifications.enabled, false); assert.equal(value.notifications.categories.notes, false);
  assert.equal(value.notifications.quietHours.start, '22:00'); assert.equal(value.notifications.quietHours.timeZone, 'UTC');
  assert.deepEqual(Object.keys(value), ['theme', 'notifications']); assert.ok(!Object.hasOwn(value.notifications.categories, 'cycle'));
});
test('strict patch validation rejects unknown keys, account IDs, and string booleans', () => {
  for (const patch of [{ uid: 'alice' }, { 'notifications.categories.health': true }, { 'notifications.categories.notes': 'false' }, { 'notifications.quietHours.start': '24:00' }, { 'notifications.quietHours.timeZone': 'https://evil.test' }, { theme: 'sepia' }, { '__proto__.theme': 'dark' }]) assert.throws(() => P.validatePatch(patch));
});
test('one changed leaf preserves all independent preferences', () => {
  const initial = P.apply(P.defaults('UTC'), { theme: 'dark', 'notifications.enabled': true, 'notifications.categories.goals': false });
  const next = P.apply(initial, { 'notifications.categories.notes': false });
  assert.equal(next.theme, 'dark'); assert.equal(next.notifications.enabled, true); assert.equal(next.notifications.categories.goals, false); assert.equal(next.notifications.categories.pings, true);
});
test('quiet hours cross midnight with inclusive start and exclusive end', () => {
  const prefs = P.apply(P.defaults('UTC'), { 'notifications.enabled': true, 'notifications.quietHours.enabled': true });
  for (const [time, quiet] of [['21:59', false], ['22:00', true], ['23:59', true], ['00:00', true], ['06:59', true], ['07:00', false]]) assert.equal(P.quietNow(prefs, new Date('2026-10-08T' + time + ':00Z')), quiet, time);
});
test('daytime quiet hours do not accidentally mute the entire night', () => {
  const prefs = P.apply(P.defaults('UTC'), { 'notifications.quietHours.enabled': true, 'notifications.quietHours.start': '08:00', 'notifications.quietHours.end': '17:00' });
  assert.equal(P.quietNow(prefs, new Date('2026-10-08T10:00:00Z')), true);
  assert.equal(P.quietNow(prefs, new Date('2026-10-08T22:00:00Z')), false);
});
test('equal quiet endpoints explicitly mean all-day quiet', () => {
  const prefs = P.apply(P.defaults('UTC'), { 'notifications.quietHours.enabled': true, 'notifications.quietHours.start': '08:00', 'notifications.quietHours.end': '08:00' });
  assert.equal(P.quietNow(prefs, new Date('2026-10-08T17:00:00Z')), true);
});
test('quiet hours use the selected IANA zone through the DST transition', () => {
  const prefs = P.apply(P.defaults('Europe/London'), { 'notifications.quietHours.enabled': true, 'notifications.quietHours.start': '01:00', 'notifications.quietHours.end': '02:00' });
  assert.equal(P.quietNow(prefs, new Date('2026-10-25T00:30:00Z')), true); // 01:30 BST
  assert.equal(P.quietNow(prefs, new Date('2026-10-25T01:30:00Z')), true); // 01:30 GMT
  assert.equal(P.quietNow(prefs, new Date('2026-10-25T02:00:00Z')), false);
});
test('master, category, quiet hours, and unknown category all gate notification delivery', () => {
  const prefs = P.apply(P.defaults('UTC'), { 'notifications.enabled': true, 'notifications.categories.notes': false });
  assert.equal(P.allows(prefs, 'notes', new Date('2026-10-08T12:00:00Z')), false);
  assert.equal(P.allows(prefs, 'pings', new Date('2026-10-08T12:00:00Z')), true);
  assert.equal(P.allows(prefs, 'health', new Date()), false); assert.equal(P.allows(P.defaults(), 'pings', new Date()), false);
});
test('native authoritative cached account theme is applied before the Settings mount exists', () => {
  const f = fixture('alice', 'dark'); assert.equal(f.attrs['data-theme'], 'dark'); assert.equal(f.meta.content, '#171c2b'); assert.equal(f.app.get().uid, 'alice');
});
test('system theme reacts to phone appearance; explicit Light remains Light', () => {
  const f = fixture('alice', 'system'); assert.equal(f.attrs['data-theme'], 'light'); f.media.matches = true; f.callbacks.change(); assert.equal(f.attrs['data-theme'], 'dark');
  f.app.update({ theme: 'light' }); assert.equal(f.attrs['data-theme'], 'light'); f.callbacks.change(); assert.equal(f.attrs['data-theme'], 'light');
});
test('theme choice writes only a native leaf patch without an account identifier', () => {
  const f = fixture('alice'); assert.equal(f.app.update({ theme: 'dark' }), true); assert.deepEqual(f.writes, [{ uid: 'alice', patch: { theme: 'dark' } }]);
});
test('stale private preferences callback from the previous account is rejected', () => {
  const f = fixture('alice', 'dark'), stale = f.current(); const bob = f.switchTo('bob', 'light');
  f.app.onIdentity({ signedIn: true, uid: 'bob' }); assert.equal(f.app.get().uid, 'bob'); assert.equal(f.attrs['data-theme'], 'light');
  assert.equal(f.app.onNativeState(stale), false); assert.equal(f.app.get().uid, 'bob'); assert.equal(f.attrs['data-theme'], 'light');
  assert.equal(f.app.onNativeState(bob), true);
});
test('account changes between rendering and interaction cannot write into the new account', () => {
  const f = fixture('alice', 'dark'); f.switchTo('bob', 'light');
  assert.equal(f.app.update({ theme: 'dark' }), false); assert.equal(f.writes.length, 0); assert.equal(f.app.get().uid, 'bob'); assert.equal(f.attrs['data-theme'], 'light');
});
test('sign-out restores guest defaults and rejects stale signed-in state', () => {
  const f = fixture('alice', 'dark'), stale = f.current(); f.app.update({ 'notifications.enabled': true }); f.switchTo('', 'system');
  f.app.onIdentity({ signedIn: false }); assert.equal(f.app.get().uid, ''); assert.equal(f.app.get().preferences.notifications.enabled, false); assert.equal(f.attrs['data-theme'], 'light');
  assert.equal(f.app.onNativeState(stale), false);
});
test('guest can choose appearance but cannot enable paired notifications', () => {
  const f = fixture('', 'system'); assert.equal(f.app.update({ theme: 'dark' }), true); assert.equal(f.attrs['data-theme'], 'dark');
  assert.equal(f.app.update({ 'notifications.enabled': true }), false); assert.equal(f.app.get().preferences.notifications.enabled, false);
});
test('web identity cannot fabricate an authenticated native account', () => {
  const f = fixture('', 'system'); f.app.onIdentity({ signedIn: true, uid: 'alice' }); assert.equal(f.app.get().uid, '');
  assert.equal(f.app.onNativeState({ signedIn: true, uid: 'alice', preferences: P.apply(P.defaults(), { theme: 'dark' }) }), false);
});
test('Android permission is requested only after an explicit master opt-in', () => {
  const f = fixture('alice'); let requests = 0; f.app.init({ onNotificationEnable() { requests++; } });
  f.app.update({ theme: 'dark' }); f.app.update({ 'notifications.categories.notes': false }); assert.equal(requests, 0);
  f.app.update({ 'notifications.enabled': true }); assert.equal(requests, 1);
  f.app.onNativeState(f.current()); assert.equal(requests, 1);
});
test('Android System theme uses native phone Dark even when WebView reports Light', () => {
  const f = fixture('alice', 'system', true);
  assert.equal(f.attrs['data-theme'], 'dark'); // head bootstrap consumes the native status JSON
  assert.equal(f.media.matches, false);
  assert.equal(f.app.onNativeState(f.current()), true);
  assert.equal(f.attrs['data-theme'], 'dark'); assert.equal(f.app.get().systemDark, true);
  f.callbacks.change(); assert.equal(f.attrs['data-theme'], 'dark');
});
test('explicit Light overrides native phone Dark and System responds to native changes', () => {
  const f = fixture('alice', 'system'); f.current().systemDark = true; f.app.onNativeState(f.current());
  f.app.update({ theme: 'light' }); assert.equal(f.attrs['data-theme'], 'light');
  f.app.update({ theme: 'system' }); assert.equal(f.attrs['data-theme'], 'dark');
  f.current().systemDark = false; f.media.matches = true;
  f.app.onNativeState(f.current()); assert.equal(f.attrs['data-theme'], 'light');
  f.callbacks.change(); assert.equal(f.attrs['data-theme'], 'light');
});
console.log(JSON.stringify({ preferences_feature_tests: passed, passed: true }));
