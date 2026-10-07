'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createController, renderMarkup, categories} = require('../app/src/main/assets/us-letters.js');
const {Store} = require('../app/src/main/assets/us-extras.js');

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) || null; }
  setItem(key, value) { this.data.set(key, value); }
}
const clone = x => JSON.parse(JSON.stringify(x));
const paired = (uid = 'al-account', coupleId = 'our-space') => ({
  uid, coupleId, partnerUid: uid === 'al-account' ? 'yashika-account' : 'al-account', ready: true, error: '', pending: 0,
  members: [{uid: 'al-account', name: 'Al Ameen'}, {uid: 'yashika-account', name: 'Yashika Shivanna'}],
  roles: {alUid: 'al-account', yashikaUid: 'yashika-account'}, drafts: [], letters: [],
});
function harness(initial = paired(), storage = new MemoryStorage()) {
  let snapshot = clone(initial), sequence = 0, accepted = true;
  const calls = [];
  const controller = createController({
    readSnapshot: () => snapshot, storage, now: () => '2026-10-07T16:40:' + String(sequence++).padStart(2, '0') + '.000Z',
    mutate: (kind, id, fields) => { calls.push({kind, id, fields: clone(fields)}); return accepted; },
  });
  return {controller, calls, storage, setSnapshot: value => { snapshot = clone(value); }, getSnapshot: () => snapshot, accept: value => { accepted = value; }};
}
const published = (category = 'sad', overrides = {}) => Object.assign({id: category, category, title: 'A letter just for you', body: 'Private released words ♥', authorUid: 'al-account', recipientUid: 'yashika-account', publishedAt: '2026-10-07T16:41:00.000Z'}, overrides);
const draft = (category = 'sad', overrides = {}) => Object.assign({id: 'our-space_' + category, coupleId: 'our-space', category, title: 'Private draft', body: 'Never sent secret text', updatedAt: '2026-10-07T17:00:00.000Z'}, overrides);

test('all eight envelopes exist without auto-publishing or presenting starters as real letters', () => {
  const h = harness();
  assert.deepEqual(categories.map(x => x.id), ['miss', 'sad', 'anxious', 'sleep', 'reassurance', 'proud', 'laugh', 'argument']);
  const view = h.controller.getView();
  assert.equal(view.cards.length, 8);
  assert.equal(view.cards.some(x => x.released), false);
  assert.equal(view.draft, null);
  assert.equal(h.calls.length, 0);
  assert.match(renderMarkup(view), /Write in your own words/);
  for (const item of categories) {
    assert.equal(h.controller.edit(item.id), true);
    const edited = h.controller.getView();
    assert.equal(edited.draft.starter, true);
    assert.match(renderMarkup(edited), /suggested starting point, not a letter Al has already written/);
    assert.equal(edited.draft.category, item.id);
    assert.ok(edited.draft.body.length > 60);
  }
  assert.equal(h.calls.length, 0, 'opening starter drafts must never send anything');
});

test('signed-out and unpaired accounts cannot expose or edit any letters', () => {
  for (const snapshot of [{uid: '', coupleId: '', members: [], ready: false}, {...paired(), members: [{uid: 'al-account', name: 'Al'}]}]) {
    snapshot.letters = [published()]; snapshot.drafts = [draft()];
    const h = harness(snapshot);
    assert.equal(h.controller.getView().paired, false);
    assert.equal(h.controller.edit('sad'), false);
    assert.equal(h.controller.openLetter('sad'), false);
    const html = renderMarkup(h.controller.getView());
    assert.match(html, /Pair your two accounts first/);
    assert.doesNotMatch(html, /Private released words|Never sent secret text|letter-body|letter-writing/);
    assert.equal(h.calls.length, 0);
  }
});

test('one-time roles use explicit account identity rather than the display name', () => {
  const snapshot = paired('yashika-account'); snapshot.roles = null;
  snapshot.members[0].name = 'Yashika'; snapshot.members[1].name = 'Al';
  const h = harness(snapshot);
  assert.equal(h.controller.edit('sad'), false);
  assert.equal(h.controller.chooseRole('yashika'), true);
  let html = renderMarkup(h.controller.getView());
  assert.match(html, /Check before saving/);
  assert.match(html, /Roles cannot be changed in the app/);
  assert.match(html, /al-account/); assert.match(html, /yashika-account/);
  assert.equal(h.calls.length, 0, 'selecting a role is not confirmation');
  assert.equal(h.controller.confirmRole(), true);
  assert.deepEqual(h.calls[0], {kind: 'roles', id: 'identity', fields: {alUid: 'al-account', yashikaUid: 'yashika-account'}});
  assert.equal(h.controller.confirmRole(), false, 'cannot double queue role setup');
  snapshot.roles = {alUid: 'al-account', yashikaUid: 'yashika-account'};
  h.setSnapshot(snapshot);
  assert.equal(h.controller.chooseRole('al'), false, 'confirmed roles are immutable');
  assert.equal(h.controller.getView().recipient, true);
});

test('role setup rejects duplicate or unknown members and waits for an active connection', () => {
  const h = harness({...paired(), roles: null, ready: false});
  assert.equal(h.controller.chooseRole('al'), true);
  assert.equal(h.controller.confirmRole(), false);
  assert.equal(h.calls.length, 0);
  h.setSnapshot({...paired(), roles: null, members: [{uid: 'al-account'}, {uid: 'al-account'}]});
  assert.equal(h.controller.chooseRole('al'), false);
  h.setSnapshot({...paired(), roles: {alUid: 'outsider', yashikaUid: 'yashika-account'}});
  assert.equal(h.controller.getView().author, false);
  assert.equal(h.controller.edit('sad'), false);
});

test('typing saves locally under the account and couple and never mutates shared documents', () => {
  const h = harness();
  assert.equal(h.controller.edit('sad'), true);
  assert.equal(h.controller.update('body', 'My very private words'), true);
  assert.equal(h.controller.update('title', 'Only my draft title'), true);
  assert.equal(h.calls.length, 0);
  const stored = [...h.storage.data.entries()];
  assert.equal(stored.length, 1);
  assert.equal(stored[0][0], 'usspace:open-when:v1:al-account:our-space');
  const value = JSON.parse(stored[0][1]);
  assert.equal(value.uid, 'al-account'); assert.equal(value.coupleId, 'our-space');
  assert.equal(value.drafts.sad.body, 'My very private words');
  assert.equal(h.controller.getView().draft.starter, false);
});

test('private backup sends only a draft operation using the strict real Store allowlist', () => {
  const storage = new MemoryStorage(), transmitted = [];
  const store = new Store(storage, op => transmitted.push(op), () => {}, () => 1, () => {}, () => 'operation_one');
  store.configure({signedIn: true, paired: true, uid: 'al-account', coupleId: 'our-space'});
  store.snapshot(paired());
  const c = createController({readSnapshot: () => store.get(), mutate: (kind, id, fields) => store.mutate(kind, id, fields), storage});
  assert.equal(c.edit('sad'), true); c.update('body', 'Draft backup, not a released letter');
  assert.equal(c.saveDraft(), true);
  assert.equal(transmitted.length, 1);
  assert.equal(transmitted[0].kind, 'draft'); assert.equal(transmitted[0].id, 'our-space_sad');
  assert.deepEqual(Object.keys(transmitted[0].fields).sort(), ['body', 'category', 'title']);
  assert.equal(store.get().letters.length, 0);
  assert.equal(store.get().drafts[0].body, 'Draft backup, not a released letter');
});

test('private draft restores only for its exact owner and couple, including after account switches', () => {
  const h = harness(); h.controller.edit('sad'); h.controller.update('body', 'Al’s private local text');
  const resumed = harness(paired(), h.storage);
  resumed.controller.edit('sad'); assert.equal(resumed.controller.getView().draft.body, 'Al’s private local text');
  h.setSnapshot(paired('yashika-account'));
  assert.equal(h.controller.getView().draft, null);
  assert.equal(h.controller.edit('sad'), false);
  assert.doesNotMatch(renderMarkup(h.controller.getView()), /Al’s private local text/);
  h.setSnapshot(paired('al-account', 'another-space'));
  h.controller.edit('sad'); assert.notEqual(h.controller.getView().draft.body, 'Al’s private local text');
  h.setSnapshot(paired()); h.controller.edit('sad');
  assert.equal(h.controller.getView().draft.body, 'Al’s private local text');
});

test('remote draft recovery rejects other couples and preserves unsaved local edits during sync', () => {
  const h = harness({...paired(), drafts: [draft('sad'), draft('anxious', {coupleId: 'another-space', id: 'another-space_anxious'}), draft('sleep', {id: 'forged'})]});
  h.controller.edit('sad'); assert.equal(h.controller.getView().draft.body, 'Never sent secret text');
  h.controller.update('body', 'Local edit wins while writing');
  h.setSnapshot({...paired(), drafts: [draft('sad', {body: 'Remote concurrent change', updatedAt: '2026-10-08T01:00:00.000Z'})]});
  assert.equal(h.controller.getView().draft.body, 'Local edit wins while writing');
  h.controller.edit('anxious'); assert.notEqual(h.controller.getView().draft.body, 'Never sent secret text');
  h.controller.edit('sleep'); assert.notEqual(h.controller.getView().draft.body, 'Never sent secret text');
});

test('publication needs separate confirmation and an explicit checked review', () => {
  const h = harness(); h.controller.edit('sad'); h.controller.update('title', '  My letter  '); h.controller.update('body', '  My reviewed personal words  ');
  assert.equal(h.controller.confirmPublish(true), false, 'no request exists');
  assert.equal(h.controller.requestPublish(), true);
  assert.equal(h.calls.length, 0);
  const html = renderMarkup(h.controller.getView());
  assert.match(html, /I have reviewed these words/); assert.match(html, /Keep it private/);
  assert.equal(h.controller.confirmPublish(false), false);
  assert.equal(h.controller.confirmPublish('true'), false, 'a truthy string must not count as explicit review');
  assert.equal(h.calls.length, 0);
  assert.equal(h.controller.confirmPublish(true), true);
  assert.deepEqual(h.calls[0], {kind: 'letter', id: 'sad', fields: {category: 'sad', title: 'My letter', body: 'My reviewed personal words'}});
  assert.equal(h.controller.confirmPublish(true), false, 'confirmation is single-use');
  assert.equal(h.controller.getView().cards.find(x => x.id === 'sad').released, false, 'this module does not fake remote publication');
});

test('editing or changing account after requesting publication invalidates the confirmation', () => {
  const h = harness(); h.controller.edit('sad'); h.controller.requestPublish();
  h.controller.update('body', 'New text still private');
  assert.equal(h.controller.confirmPublish(true), false);
  assert.equal(h.calls.length, 0);
  h.controller.requestPublish(); h.setSnapshot(paired('yashika-account'));
  assert.equal(h.controller.confirmPublish(true), false);
  assert.equal(h.controller.getView().confirmation, null);
  assert.equal(h.calls.length, 0);
  h.setSnapshot(paired()); h.controller.edit('sad'); h.controller.requestPublish();
  h.setSnapshot(paired('al-account', 'another-space'));
  assert.equal(h.controller.confirmPublish(true), false);
  assert.equal(h.calls.length, 0);
});

test('recipient reveals only a released letter and opening sends no mood or read receipt', () => {
  const h = harness({...paired('yashika-account'), drafts: [draft()], letters: [published(), published('anxious', {authorUid: 'outsider'}), published('sleep', {recipientUid: 'outsider'})]});
  const before = renderMarkup(h.controller.getView());
  assert.doesNotMatch(before, /Private released words|Never sent secret text/);
  assert.equal(h.controller.edit('sad'), false);
  assert.equal(h.controller.openLetter('anxious'), false);
  assert.equal(h.controller.openLetter('sleep'), false);
  assert.equal(h.controller.openLetter('sad'), true);
  const after = renderMarkup(h.controller.getView());
  assert.match(after, /Private released words/); assert.match(after, /From Al ❤️/);
  assert.match(after, /Al does not receive a read receipt/);
  assert.doesNotMatch(after, /Never sent secret text|letter-writing|Publish for Yashika/);
  assert.equal(h.calls.length, 0);
  h.controller.closeLetter(); assert.doesNotMatch(renderMarkup(h.controller.getView()), /Private released words/);
});

test('author can preview a published letter while drafts remain distinct', () => {
  const h = harness({...paired(), letters: [published()], drafts: [draft()]});
  h.controller.edit('sad'); assert.match(renderMarkup(h.controller.getView()), /Never sent secret text/);
  assert.equal(h.controller.openLetter('sad'), true);
  const html = renderMarkup(h.controller.getView());
  assert.match(html, /published preview/); assert.match(html, /Private released words/);
  assert.doesNotMatch(html, /Never sent secret text/);
  assert.equal(h.calls.length, 0);
});

test('recipient caches and the open reader clear immediately on sign-out or scope change', () => {
  const h = harness({...paired('yashika-account'), letters: [published()]});
  h.controller.openLetter('sad'); assert.match(renderMarkup(h.controller.getView()), /Private released words/);
  h.setSnapshot({uid: '', coupleId: '', ready: false, members: [], letters: []});
  assert.equal(h.controller.getView().opened, null);
  assert.doesNotMatch(renderMarkup(h.controller.getView()), /Private released words/);
  h.setSnapshot(paired('yashika-account', 'another-space'));
  assert.equal(h.controller.getView().opened, null);
  assert.equal(h.calls.length, 0);
});

test('offline private edits remain local and rejected publication is never labeled as sent', () => {
  const h = harness({...paired(), ready: false});
  h.controller.edit('sad'); h.controller.update('body', 'Offline private words');
  assert.equal(h.controller.saveDraft(), true);
  assert.equal(h.controller.requestPublish(), false);
  assert.equal(h.calls.length, 0);
  assert.match(h.controller.getView().status, /active paired connection/);
  h.setSnapshot(paired()); h.accept(false); h.controller.requestPublish();
  assert.equal(h.controller.confirmPublish(true), false);
  assert.match(h.controller.getView().status, /could not be queued/);
  assert.equal(h.controller.getView().cards.find(x => x.id === 'sad').released, false);
  assert.equal(h.controller.getView().draft.body, 'Offline private words');
});

test('title and body limits apply to drafts, incoming data and publication', () => {
  const h = harness(); h.controller.edit('sad');
  assert.equal(h.controller.update('body', 'x'.repeat(12001)), false);
  assert.equal(h.controller.update('title', 'x'.repeat(201)), false);
  assert.equal(h.controller.update('mood', 'Sad'), false);
  h.controller.update('body', '   '); assert.equal(h.controller.requestPublish(), false);
  h.controller.update('body', 'A word'); h.controller.update('title', ' '); assert.equal(h.controller.requestPublish(), false);
  const reader = harness({...paired('yashika-account'), letters: [published('sad', {body: 'x'.repeat(12001)})]});
  assert.equal(reader.controller.openLetter('sad'), false);
  assert.equal(h.calls.length, 0);
});

test('letter markup escapes text instead of interpreting authored HTML or account names', () => {
  const snapshot = paired('yashika-account');
  snapshot.members[1].name = '<img src=x onerror=alert(1)>';
  snapshot.letters = [published('sad', {title: '<script>bad()</script>', body: '<img src=x onerror=bad()> & "love"'})];
  const h = harness(snapshot); h.controller.openLetter('sad');
  const html = renderMarkup(h.controller.getView());
  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;img src=x/);
  assert.match(html, /&amp; &quot;love&quot;/);
});

test('malformed or mismatched local cache cannot leak another owner’s draft', () => {
  const storage = new MemoryStorage();
  storage.setItem('usspace:open-when:v1:al-account:our-space', JSON.stringify({version: 1, uid: 'someone-else', coupleId: 'our-space', drafts: {sad: draft('sad')}}));
  const h = harness(paired(), storage); h.controller.edit('sad');
  assert.notEqual(h.controller.getView().draft.body, 'Never sent secret text');
  const failingStorage = {getItem() { throw new Error('storage unavailable'); }, setItem() { throw new Error('full'); }};
  const failing = harness(paired(), failingStorage); failing.controller.edit('sad'); failing.controller.update('body', 'Copy these words');
  assert.equal(failing.controller.getView().storageError, true);
  assert.match(renderMarkup(failing.controller.getView()), /Copy your words before leaving/);
});
