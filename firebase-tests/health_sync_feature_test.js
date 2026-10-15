const assert = require('node:assert/strict');
const {test} = require('node:test');
const health = require('../app/src/main/assets/health-sync.js');
const old = {date: '2026-10-15', steps: 5123, sleep: 7.2, hr: 62, weight: 70.5, note: 'Keep my note', source: 'Manual', fieldTimes: {hr: '2026-10-14T08:00:00Z'}};
test('a partial Samsung import preserves unread and failed measurements and the manual note', () => {
  const result = health.mergeSnapshot(old, {date: old.date, steps: 6000, availableFields: ['steps'], fieldStates: {hr: 'permission_denied', sleep: 'error'}});
  assert.equal(result.entry.steps, 6000); assert.equal(result.entry.hr, 62); assert.equal(result.entry.sleep, 7.2);
  assert.equal(result.entry.note, 'Keep my note'); assert.equal(result.entry.fieldTimes.hr, old.fieldTimes.hr);
  assert.equal(old.steps, 5123);
});
test('an explicitly available zero is real data while absent permissions never turn old values into zero', () => {
  assert.equal(health.mergeSnapshot(old, {date: old.date, availableFields: ['steps'], steps: 0}).entry.steps, 0);
  const unavailable = health.mergeSnapshot(old, {date: old.date, availableFields: [], steps: 0, sleep: 0, hr: 0, weight: 0});
  assert.equal(unavailable.changed, false); assert.strictEqual(unavailable.entry, old);
});
test('no-data first connection creates no empty health day or fabricated success', () => {
  const result = health.mergeSnapshot(null, {date: old.date, availableFields: []});
  assert.equal(result.changed, false); assert.equal(result.entry, null);
});
test('invalid calendar dates cannot change a saved day', () => {
  for (const date of ['2023-02-29', '2026-02-30', '2026-13-01', '15/10/2026', '2026-10-15T12:00:00Z', null])
    assert.equal(health.mergeSnapshot(old, {date, availableFields: ['steps'], steps: 9}).changed, false);
  assert.equal(health.validDay('2024-02-29'), true);
});
test('invalid source values cannot corrupt saved measurements', () => {
  for (const [key, value] of [['steps', -1], ['steps', Infinity], ['sleep', 90], ['hr', 0], ['weight', 0], ['spo2', 120], ['kcal', '500'], ['workout', {}]]) {
    assert.equal(health.mergeSnapshot(old, {date: old.date, availableFields: [key], [key]: value}).changed, false);
  }
});
test('recent heart rate and total calories retain their actual meaning', () => {
  const result = health.mergeSnapshot(old, {date: old.date, availableFields: ['hr', 'kcal'], hr: 80, kcal: 2300, hrType: 'recent', kcalType: 'total', fieldTimes: {hr: '2026-10-15T08:00:00Z'}});
  assert.equal(result.entry.hrType, 'recent'); assert.equal(result.entry.kcalType, 'total'); assert.equal(result.entry.fieldTimes.hr, '2026-10-15T08:00:00Z');
});
function phone() {
  const s = {sync: {uid: 'al'}, health: {share: false, lastSync: '2026-10-14T20:00:00Z'}, healthHistory: [{...old}]};
  const elements = new Map(); for (const id of ['hcStatusText','hcDot','hcSyncBtn','hcConnectBtn','hcDetails','healthStats','healthHistory','healthSourceLine']) elements.set(id, {textContent:'',innerHTML:''});
  const counts = {save: 0, render: 0, messages: [], calls: []};
  const bridge = {status: () => JSON.stringify({uid: 'al', state: 'connected', supported: true, connected: true, grantedCount: 1, totalPermissions: 9}), refresh() {counts.calls.push('refresh');}, sync() {counts.calls.push('sync');}, openHealthConnectSettings() {counts.calls.push('settings');}};
  const controller = health.createController({getState: () => s, bridge: () => bridge, document: {getElementById: id => elements.get(id)}, save() {counts.save++;}, render() {counts.render++; controller.render();}, toast(x) {counts.messages.push(x);}});
  return {s, elements, counts, controller};
}
test('an in-flight import from another signed-in account is discarded', () => {
  const p = phone(); p.controller.receiveSnapshot({uid:'yashika', date: old.date, availableFields:['steps'],steps:9});
  assert.equal(p.s.healthHistory[0].steps, 5123); assert.equal(p.counts.save, 0);
});
test('signed-in apps reject unscoped legacy native readings', () => {
  const p = phone(); p.controller.receiveSnapshot({date:old.date, availableFields:['steps'],steps:9}); assert.equal(p.counts.save, 0);
});
test('a native no-data result keeps history and last successful sync unchanged', () => {
  const p = phone(); p.controller.receiveSnapshot({uid:'al', date: old.date, state:'no_data', availableFields:[]});
  assert.equal(p.s.healthHistory.length, 1); assert.equal(p.s.healthHistory[0].steps, 5123);
  assert.equal(p.s.health.lastSync, '2026-10-14T20:00:00Z'); assert.match(p.counts.messages[0], /No Samsung Health readings/);
});
test('partial permissions allow Sync while revocation disables reads without deleting old values', () => {
  const p = phone(); p.controller.init(); assert.equal(p.elements.get('hcSyncBtn').disabled, false);
  p.controller.sync(); assert.ok(p.counts.calls.includes('sync'));
  p.controller.receiveStatus({uid:'al',connected:false,state:'permission_denied',grantedCount:0,totalPermissions:9});
  assert.equal(p.elements.get('hcSyncBtn').disabled, true); assert.equal(p.s.healthHistory[0].steps,5123);
});
test('readings and error states stay local with sharing forced off', () => {
  const p = phone(); p.s.health.share = true; p.controller.receiveSnapshot({uid:'al',date:old.date,state:'partial',availableFields:['hr'],hr:75,hrType:'recent'});
  assert.equal(p.s.health.share,false); assert.equal(p.s.healthHistory[0].hr,75); assert.equal(p.s.healthHistory[0].sleep,7.2);
  assert.equal(p.s.sync.uid,'al'); assert.equal(p.counts.save,1);
});
test('rendered source labels and user notes cannot inject HTML', () => {
  const p = phone(); p.s.healthHistory[0].note='<img src=x onerror=alert(1)>';
  p.controller.receiveSnapshot({uid:'al',date:old.date,state:'ready',availableFields:['hr','kcal'],hr:85,kcal:2300,hrType:'recent',kcalType:'total'});
  assert.match(p.elements.get('healthStats').innerHTML,/Heart rate/); assert.match(p.elements.get('healthStats').innerHTML,/Calories burned/);
  assert.ok(!p.elements.get('healthHistory').innerHTML.includes('<img')); assert.match(p.elements.get('healthHistory').innerHTML,/&lt;img/);
});
