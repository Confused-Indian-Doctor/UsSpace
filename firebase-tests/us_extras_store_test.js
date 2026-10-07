const assert = require('node:assert/strict');
const {Store, validFields, imageData, browser} = require('../app/src/main/assets/us-extras.js');
let total = 0;
function test(name, run) { run(); total++; console.log('✓ ' + name); }
function fixture() {
  const memory = new Map(), sent = [], updates = [], timers = new Map(); let sequence = 0, timerId = 0;
  const storage = {getItem: k => memory.get(k), setItem: (k, v) => memory.set(k, v)};
  const make = () => new Store(storage, op => sent.push(op), x => updates.push(x), fn => { timers.set(++timerId, fn); return timerId; }, id => timers.delete(id), () => 'op_' + (++sequence));
  const s = make(); s.configure({signedIn: true, paired: true, uid: 'al_uid', coupleId: 'couple_1'});
  const snapshot = {uid: 'al_uid', coupleId: 'couple_1', ready: true, members: [{uid: 'al_uid', name: 'Al'}, {uid: 'yashika_uid', name: 'Yashika'}], roles: {alUid: 'al_uid', yashikaUid: 'yashika_uid'}, bucket: [], jar: [], hearts: {}, photos: {}, drafts: [], letters: []};
  s.snapshot(snapshot);
  return {s, snapshot, sent, memory, storage, make, timers};
}
test('private comfort, nested health and draft bodies cannot enter shared item edits', () => {
  for (const fields of [{title: 'Tea', mood: 'sad'}, {title: 'Tea', health: {hr: 80}}, {title: 'Tea', cycle: 'private'}, {body: 'secret'}]) assert.equal(validFields('bucket', fields), false);
  assert.equal(validFields('jar', {text: 'Thanks', body: 'draft'}), false);
});
test('known fields have real enum, size, scalar and photo URI boundaries', () => {
  assert.equal(validFields('bucket', {state: 'Unsafe'}), false);
  assert.equal(validFields('jar', {text: 'x'.repeat(1501)}), false);
  assert.equal(validFields('heart', {active: 'true'}), false);
  for (const uri of ['javascript:alert(1)', 'https://example.org/photo', 'data:image/svg+xml;base64,AAAA']) assert.equal(imageData(uri), false);
  assert.equal(validFields('letter', {category: 'sad', title: 'For you', body: 'a'.repeat(12001)}), false);
});
test('paired authoritative readiness is required and stale callbacks cannot initialize another account', () => {
  const f = fixture(); f.s.configure({signedIn: true, paired: true, uid: 'third_uid', coupleId: 'couple_1'});
  assert.equal(f.s.snapshot(f.snapshot), false);
  assert.equal(f.s.mutate('jar', 'note_1', {text: 'Thanks'}), false);
  assert.deepEqual(f.s.get().letters, []);
});
test('queued operations survive restart and maintain order through acknowledgement', () => {
  const f = fixture();
  assert.equal(f.s.mutate('jar', 'note_1', {text: 'First'}), true);
  assert.equal(f.s.mutate('jar', 'note_2', {text: 'Second'}), true);
  assert.equal(f.sent.length, 1);
  const restored = f.make(); restored.configure({signedIn: true, paired: true, uid: 'al_uid', coupleId: 'couple_1'});
  assert.equal(restored.get().pending, 2); restored.snapshot(f.snapshot);
  assert.equal(f.sent.at(-1).id, 'note_1');
  restored.ack({...f.sent.at(-1), success: true});
  assert.equal(f.sent.at(-1).id, 'note_2');
  restored.ack({...f.sent.at(-1), success: true});
  assert.equal(restored.get().pending, 0); assert.equal(restored.get().jar.length, 2);
});
test('failed edits persist and retry the same receipt identity rather than creating duplicates', () => {
  const f = fixture(); f.s.mutate('jar', 'note_1', {text: 'Thank you'});
  const original = f.sent[0]; f.s.ack({...original, success: false, error: 'Offline'});
  assert.equal(f.s.get().pending, 1); [...f.timers.values()][0]();
  assert.equal(f.sent.at(-1).operationId, original.operationId);
});
test('signout clears letters, queued bodies, photos and old in-flight callbacks from active memory', () => {
  const f = fixture(); f.s.mutate('letter', 'sad', {category: 'sad', title: 'Love', body: 'Private released words'});
  const op = f.sent[0]; f.s.configure({signedIn: false});
  assert.equal(f.s.get().uid, ''); assert.equal(f.s.get().pending, 0); assert.deepEqual(f.s.get().letters, []);
  assert.equal(f.s.ack({...op, success: true}), false); assert.equal(f.s.snapshot(f.snapshot), false);
  f.s.configure({signedIn: true, paired: true, uid: 'yashika_uid', coupleId: 'couple_1'});
  assert.equal(f.s.get().pending, 0); assert.deepEqual(f.s.get().letters, []);
});
test('editing a partner suggestion or appreciation never rewrites its original author', () => {
  const f = fixture(); f.snapshot.bucket = [{id: 'trip_1', title: 'Trip', state: 'Booked', priority: 'High', suggestedBy: 'yashika_uid', suggestedName: 'Yashika', createdAt: 'original'}];
  f.s.snapshot(f.snapshot); f.s.mutate('bucket', 'trip_1', {notes: 'Bring tea'});
  const item = f.s.get().bucket[0]; assert.equal(item.suggestedBy, 'yashika_uid'); assert.equal(item.suggestedName, 'Yashika'); assert.equal(item.state, 'Booked'); assert.equal(item.createdAt, 'original');
});
test('recipient cannot queue draft or publication; author uses only confirmed bound roles', () => {
  const f = fixture(); f.snapshot.roles = {alUid: 'yashika_uid', yashikaUid: 'al_uid'}; f.s.snapshot(f.snapshot);
  assert.equal(f.s.mutate('draft', 'couple_1_sad', {category: 'sad', title: '', body: 'secret'}), false);
  assert.equal(f.s.mutate('letter', 'sad', {category: 'sad', title: 'For you', body: 'secret'}), false);
});
test('private role identity cannot be guessed or assigned to a third account', () => {
  const f = fixture();
  assert.equal(f.s.mutate('roles', 'identity', {alUid: 'al_uid', yashikaUid: 'third_uid'}), false);
  assert.equal(f.s.mutate('roles', 'identity', {alUid: 'al_uid', yashikaUid: 'al_uid'}), false);
});
test('pending local heart intent survives snapshots and is isolated per account', () => {
  const f = fixture(); f.snapshot.jar = [{id: 'note_1', text: 'Thanks'}]; f.snapshot.hearts = {note_1: ['yashika_uid']}; f.s.snapshot(f.snapshot);
  f.s.mutate('heart', 'note_1', {active: true}); f.s.snapshot(f.snapshot);
  assert.deepEqual(f.s.get().hearts.note_1.sort(), ['al_uid', 'yashika_uid']);
});
test('image bytes stay outside shared common state and are available for pending Memory previews', () => {
  const f = fixture(), data = 'data:image/jpeg;base64,/9j/4P/Z'; f.s.mutate('photo', 'photo_1', {data});
  assert.equal(f.s.photo('photo_1'), data); assert.equal(f.s.get().bucket.length, 0);
  assert.equal(f.s.mutate('photo', '__proto__', {data}), false);
});
test('storage failure refuses an edit instead of falsely reporting it as saved', () => {
  const f = fixture(); f.storage.setItem = () => { throw Error('full'); };
  assert.equal(f.s.mutate('jar', 'note_1', {text: 'Thanks'}), false); assert.equal(f.s.get().pending, 0); assert.equal(f.sent.length, 0);
});
test('actual browser transport sends only the six native contract keys and handles synchronous acknowledgements', () => {
  const entries = new Map(), sent = [], scheduled = new Map(); let next = 0;
  const root = {localStorage: {getItem: k => entries.get(k), setItem: (k, v) => entries.set(k, v)}, setTimeout: fn => { scheduled.set(++next, fn); return next; }, clearTimeout: id => scheduled.delete(id)};
  root.UsSpaceExtras = {refresh() {}, mutate(raw) {
    const op = JSON.parse(raw); sent.push(op);
    root.onUsExtrasAck({...op, success: true});
  }};
  const api = browser(root); api.configure({signedIn: true, paired: true, uid: 'al_uid', coupleId: 'couple_1'});
  root.onUsExtrasSnapshot({uid: 'al_uid', coupleId: 'couple_1', ready: true});
  assert.equal(api.mutate('jar', 'note_1', {text: 'I appreciate you'}), true);
  assert.deepEqual(Object.keys(sent[0]).sort(), ['coupleId', 'fields', 'id', 'kind', 'operationId', 'uid']);
  assert.equal(api.get().pending, 0); assert.equal(scheduled.size, 0);
});
console.log(total + ' account-scoped sync checks passed.');
