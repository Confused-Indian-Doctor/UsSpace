import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CATEGORIES, detectChanges, messageData, notificationAllowed, quietNow, recipientFor, sourceDigest, stableId, validDevice} from '../functions/src/policy.mjs';
import {makeDispatcher} from '../functions/src/dispatch.mjs';

const at = new Date('2026-10-08T20:30:00Z');
const prefs = (overrides = {}) => ({theme: 'system', notifications: {enabled: true,
  categories: Object.fromEntries(CATEGORIES.map(category => [category, true])),
  quietHours: {enabled: false, start: '22:00', end: '07:00', timeZone: 'Europe/London'}, ...overrides}});
const common = payload => ({updatedBy: 'al', payload});
const categories = changes => changes.map(change => change.category);
const device = () => ({uid: 'yashika', installationId: 'phone-0001', token: 'test-token-valid-00000000001', enabled: true, platform: 'android'});

class FakeDB {
  constructor() {this.data = new Map(); this.lock = Promise.resolve(); this.afterClaim = null;}
  seed(path, value) {this.data.set(path, structuredClone(value)); return this;}
  doc(path) {return new FakeReference(this, path);}
  collection(path) {return new FakeCollection(this, path);}
  async runTransaction(callback) {
    const prior = this.lock; let release; this.lock = new Promise(resolve => {release = resolve;}); await prior;
    const writes = [];
    try {
      const result = await callback({get: reference => reference.get(),
        create: (reference, value) => writes.push(() => {assert.equal(this.data.has(reference.path), false); this.data.set(reference.path, structuredClone(value));}),
        delete: reference => writes.push(() => this.data.delete(reference.path))});
      for (const write of writes) write();
      if (writes.length && this.afterClaim) {const hook = this.afterClaim; this.afterClaim = null; hook(this);}
      return result;
    } finally {release();}
  }
}
class FakeReference {
  constructor(db, path) {this.db = db; this.path = path; this.id = path.split('/').at(-1);}
  collection(name) {return new FakeCollection(this.db, `${this.path}/${name}`);}
  async get() {const value = this.db.data.get(this.path); return {exists: value !== undefined, id: this.id, ref: this, data: () => structuredClone(value)};}
  async update(fields) {assert.ok(this.db.data.has(this.path)); this.db.seed(this.path, {...this.db.data.get(this.path), ...fields});}
}
class FakeCollection {
  constructor(db, path, filter = null, maximum = Infinity) {this.db = db; this.path = path; this.filter = filter; this.maximum = maximum;}
  doc(id) {return this.db.doc(`${this.path}/${id}`);}
  where(key, op, value) {assert.equal(op, '=='); return new FakeCollection(this.db, this.path, {key, value}, this.maximum);}
  limit(maximum) {return new FakeCollection(this.db, this.path, this.filter, maximum);}
  async get() {
    const paths = [...this.db.data.keys()].filter(path => path.startsWith(this.path + '/') && path.slice(this.path.length + 1).indexOf('/') === -1)
      .filter(path => !this.filter || this.db.data.get(path)[this.filter.key] === this.filter.value).slice(0, this.maximum);
    return {docs: await Promise.all(paths.map(path => this.db.doc(path).get()))};
  }
}
function fixture({kind = 'jar', itemId = 'note-1', before = null, after = {id: 'note-1', authorUid: 'al', text: 'PRIVATE_BODY_DO_NOT_PREVIEW'}} = {}) {
  const db = new FakeDB(), sent = [];
  db.seed('couples/space', {memberCount: 2}).seed('couples/space/members/al', {uid: 'al'})
    .seed('couples/space/members/yashika', {uid: 'yashika'}).seed('users/al', {coupleId: 'space'})
    .seed('users/yashika', {coupleId: 'space'}).seed('users/yashika/preferences/v014', prefs())
    .seed('users/yashika/devices/phone-0001', device());
  const paths = {jar: 'usJar', letter: 'usLetters', ping: 'usPings', common: 'shared', profile: 'profiles', bucket: 'usBucket', work: 'workSummaries'};
  const sourcePath = `couples/space/${paths[kind]}/${itemId}`;
  db.seed(sourcePath, after);
  const messaging = {send: async envelope => {sent.push(envelope); return 'message-id';}};
  const run = makeDispatcher({db, messaging, now: () => at, serverTimestamp: () => 'SERVER_TIME'});
  const event = {kind, coupleId: 'space', itemId, eventId: 'cloud-event-1', before, after};
  return {db, sent, messaging, run, event, sourcePath};
}

test('shared change detection emits only relevant categories and suppresses pairing imports', () => {
  const before = common({notes: [], goals: [], memories: [], duties: [], visit: ''});
  const after = common({notes: [{id: 'n', text: 'Private affectionate words'}], goals: [{id: 'g', title: 'Walk', value: 1, level: 'Visible'}],
    memories: [{id: 'm', title: 'A private place'}], duties: [{id: 'd', date: '2026-10-09', title: 'A future plan'}], visit: ''});
  assert.deepEqual(categories(detectChanges('common', before, after, at)), ['notes', 'goals', 'memories', 'calendar']);
  assert.deepEqual(detectChanges('common', null, after, at), []);
  assert.deepEqual(detectChanges('common', before, before, at), []);
});
test('private goals, feelings, Health, Cycle and language progress never cause notifications', () => {
  const before = common({goals: [], duties: [], notes: []});
  const after = common({goals: [{id: 'g', title: 'secret', level: 'Private'}], health: {hr: 91}, cycle: {note: 'secret'},
    mood: 'sad', learn: {xp: 12}, duties: [], notes: []});
  assert.deepEqual(detectChanges('common', before, after, at), []);
  assert.deepEqual(detectChanges('profile', {payload: {status: 'Free', checkins: []}}, {updatedBy: 'al', payload: {status: 'Free', checkins: [{mood: 'Sad'}]}}, at), []);
  for (const kind of ['draft', 'photo', 'heart', 'health', 'cycle']) assert.deepEqual(detectChanges(kind, null, {authorUid: 'al', body: 'secret'}, at), []);
});
test('calendar ignores old rows and unchanged plans, but catches upcoming edits and cancellation', () => {
  const row = {id: 'd', date: '2026-10-07', title: 'Old shift'};
  assert.deepEqual(detectChanges('common', common({duties: []}), common({duties: [row]}), at), []);
  const future = {...row, date: '2026-10-09'};
  assert.deepEqual(categories(detectChanges('common', common({duties: [future]}), common({duties: []}), at)), ['calendar']);
  assert.deepEqual(categories(detectChanges('common', common({duties: [future]}), common({duties: [{...future, time: '08:00'}]}), at)), ['calendar']);
});
test('new pings, published letters and jar entries are distinguished without guessing note text', () => {
  assert.deepEqual(detectChanges('ping', null, {senderUid: 'al'}, at), [{category: 'pings', actorUid: 'al', route: 'home'}]);
  assert.deepEqual(categories(detectChanges('jar', null, {authorUid: 'al', text: 'new'}, at)), ['notes']);
  assert.deepEqual(detectChanges('jar', {text: 'old'}, {authorUid: 'al', text: 'edited'}, at), []);
  assert.deepEqual(detectChanges('letter', null, {authorUid: 'al', recipientUid: 'yashika', body: 'secret', publishedAt: 'now'}, at),
    [{category: 'notes', actorUid: 'al', route: 'letters', onlyRecipient: 'yashika'}]);
  assert.deepEqual(detectChanges('letter', null, {authorUid: 'al', recipientUid: 'al', body: 'secret'}, at), []);
});
test('notification defaults are off and category toggles act independently', () => {
  assert.equal(notificationAllowed(null, 'notes', at), false);
  assert.equal(notificationAllowed(prefs({enabled: false}), 'notes', at), false);
  const p = prefs(); p.notifications.categories.notes = false;
  assert.equal(notificationAllowed(p, 'notes', at), false); assert.equal(notificationAllowed(p, 'pings', at), true);
  assert.equal(notificationAllowed(p, 'health', at), false);
});
test('quiet hours use the recipient zone, cross midnight, include start and exclude end', () => {
  const q = {enabled: true, start: '22:00', end: '07:00', timeZone: 'Asia/Kolkata'};
  assert.equal(quietNow(q, new Date('2026-10-08T16:29:00Z')), false);
  assert.equal(quietNow(q, new Date('2026-10-08T16:30:00Z')), true);
  assert.equal(quietNow(q, new Date('2026-10-09T01:29:00Z')), true);
  assert.equal(quietNow(q, new Date('2026-10-09T01:30:00Z')), false);
  assert.equal(quietNow({...q, start: '09:00', end: '17:00'}, new Date('2026-10-09T06:00:00Z')), true);
  assert.equal(quietNow({...q, start: '22:00', end: '22:00'}, at), true);
});
test('quiet hours honor daylight saving and fail closed for invalid time zones or clocks', () => {
  const q = {enabled: true, start: '01:00', end: '02:00', timeZone: 'Europe/London'};
  assert.equal(quietNow(q, new Date('2026-07-01T00:30:00Z')), true);
  assert.equal(quietNow(q, new Date('2026-12-01T00:30:00Z')), false);
  assert.equal(quietNow({...q, timeZone: 'invalid/zone'}, at), true);
  assert.equal(quietNow({...q, start: '99:99'}, at), true);
});
test('recipient selection requires exactly two current members and matching canonical accounts', () => {
  const intent = {actorUid: 'al'}, members = [{uid: 'al'}, {uid: 'yashika'}], accounts = {al: {coupleId: 'space'}, yashika: {coupleId: 'space'}};
  assert.equal(recipientFor(intent, 'space', {memberCount: 2}, members, accounts), 'yashika');
  for (const [room, list, users, change] of [[{memberCount: 1}, members, accounts, intent], [{memberCount: 2}, members.slice(0, 1), accounts, intent],
    [{memberCount: 2}, members, {...accounts, yashika: {coupleId: 'new-space'}}, intent], [{memberCount: 2}, members, accounts, {actorUid: 'outsider'}],
    [{memberCount: 2}, members, accounts, {actorUid: 'al', onlyRecipient: 'outsider'}]]) assert.equal(recipientFor(change, 'space', room, list, users), '');
});
test('generic data-only payload cannot disclose supplied text, arbitrary title, status, location or route', () => {
  const payload = messageData({category: 'notes', route: 'letters', body: 'SECRET', title: 'SECRET'}, 'space', 'yashika', stableId('event'), at);
  assert.equal(payload.title, 'UsSpace'); assert.equal(payload.body, 'There’s a new note in your space.');
  assert.doesNotMatch(JSON.stringify(payload), /SECRET|photo|mood|health|cycle/);
  assert.ok(Object.values(payload).every(value => typeof value === 'string'));
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) < 1024);
  assert.throws(() => messageData({category: 'notes', route: 'https://attacker'}, 'space', 'yashika', stableId('e'), at));
  assert.equal(sourceDigest({b: 1, a: {d: 2, c: 1}}), sourceDigest({a: {c: 1, d: 2}, b: 1}));
});
test('device binding rejects wrong account, installation, platform, disabled and whitespace tokens', () => {
  assert.equal(validDevice(device(), 'yashika', 'phone-0001'), true);
  for (const patch of [{uid: 'al'}, {installationId: 'other'}, {platform: 'web'}, {enabled: false}, {token: 'bad token with spaces'}, {token: 'x'.repeat(4097)}])
    assert.equal(validDevice({...device(), ...patch}, 'yashika', 'phone-0001'), false);
});
test('dispatcher sends one generic partner message and handles concurrent event retry idempotently', async () => {
  const f = fixture(); await Promise.all([f.run.deliver(f.event), f.run.deliver(f.event)]);
  await f.run.deliver({...f.event, eventId: 'different-provider-same-source-version'});
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].notification, undefined);
  assert.equal(f.sent[0].data.recipientUid, 'yashika'); assert.equal(f.sent[0].data.route, 'jar');
  assert.doesNotMatch(JSON.stringify(f.sent[0]), /PRIVATE_BODY/);
  assert.equal(f.sent[0].android.priority, 'normal'); assert.equal(f.sent[0].android.ttl, 900000);
  const receipts = [...f.db.data].filter(([path]) => path.startsWith('_pushDeliveries/'));
  assert.equal(receipts.length, 1); assert.equal(receipts[0][1].status, 'sent');
  assert.doesNotMatch(JSON.stringify(receipts), /PRIVATE_BODY|test-token/);
});
test('dispatcher rechecks live account, membership, master, category and quiet hours', async () => {
  for (const mutate of [db => db.seed('users/yashika', {coupleId: 'different'}), db => db.data.delete('couples/space/members/yashika'),
    db => db.seed('couples/space', {memberCount: 1}), db => db.seed('users/yashika/preferences/v014', prefs({enabled: false})),
    db => db.seed('users/yashika/preferences/v014', prefs({categories: {...prefs().notifications.categories, notes: false}})),
    db => db.seed('users/yashika/preferences/v014', prefs({quietHours: {enabled: true, start: '21:00', end: '07:00', timeZone: 'Europe/London'}}))]) {
    const f = fixture(); mutate(f.db); await f.run.deliver(f.event); assert.equal(f.sent.length, 0);
  }
});
test('stale source snapshots and a revoked preference after atomic claim suppress delivery', async () => {
  const stale = fixture(); stale.db.seed(stale.sourcePath, {...stale.event.after, text: 'edited after event'});
  await stale.run.deliver(stale.event); assert.equal(stale.sent.length, 0);
  for (const mutate of [db => db.seed('users/yashika/preferences/v014', prefs({enabled: false})),
    db => db.seed('users/yashika/devices/phone-0001', {...device(), token: 'rotated-token-valid-00000000001'}),
    db => db.data.delete('couples/space/members/al'),
    db => db.seed('users/al', {coupleId: 'new-space'}),
    db => db.seed('couples/space', {memberCount: 1})]) {
    const f = fixture(); f.db.afterClaim = mutate; await f.run.deliver(f.event); assert.equal(f.sent.length, 0);
    assert.equal([...f.db.data].find(([path]) => path.startsWith('_pushDeliveries/'))[1].status, 'revoked');
  }
});
test('released letter notification requires current role-bound author and actual intended partner', async () => {
  const after = {id: 'sad', authorUid: 'al', recipientUid: 'yashika', body: 'PRIVATE_LETTER', publishedAt: 'now'};
  const f = fixture({kind: 'letter', itemId: 'sad', after});
  await f.run.deliver(f.event); assert.equal(f.sent.length, 0);
  f.db.seed('couples/space/usRoles/identity', {alUid: 'al', yashikaUid: 'yashika'});
  await f.run.deliver(f.event); assert.equal(f.sent.length, 1); assert.equal(f.sent[0].data.route, 'letters');
  assert.doesNotMatch(JSON.stringify(f.sent), /PRIVATE_LETTER|sad/);
});
test('invalid-token deletion cannot remove a replacement token registered during send', async () => {
  const f = fixture(); f.messaging.send = async () => {
    f.db.seed('users/yashika/devices/phone-0001', {...device(), token: 'new-token-valid-00000000001'});
    throw Object.assign(new Error('invalid'), {code: 'messaging/registration-token-not-registered'});
  };
  await f.run.deliver(f.event);
  assert.equal(f.db.data.get('users/yashika/devices/phone-0001').token, 'new-token-valid-00000000001');
  const g = fixture(); g.messaging.send = async () => {throw Object.assign(new Error('invalid'), {code: 'messaging/registration-token-not-registered'});};
  await g.run.deliver(g.event); assert.equal(g.db.data.has('users/yashika/devices/phone-0001'), false);
});
test('generic send failures never replay the same event and do not delete valid tokens', async () => {
  const f = fixture(); let attempts = 0;
  f.messaging.send = async () => {attempts++; throw Object.assign(new Error('transient'), {code: 'messaging/server-unavailable'});};
  await f.run.deliver(f.event); await f.run.deliver(f.event);
  assert.equal(attempts, 1); assert.equal(f.db.data.has('users/yashika/devices/phone-0001'), true);
  assert.equal([...f.db.data].find(([path]) => path.startsWith('_pushDeliveries/'))[1].status, 'send-failed');
});

test('trusted worker startup/restart establishes a quiet baseline and never replays historical alerts', async () => {
  const {timestampVersion, workerDecision} = await import('../functions/src/worker-policy.mjs');
  const version = timestampVersion({seconds: at.getTime() / 1000, nanoseconds: 123});
  assert.equal(workerDecision({initial: true, version, now: at.getTime()}), 'baseline');
  assert.equal(workerDecision({initial: true, previousVersion: version, version, now: at.getTime()}), 'drop');
  assert.equal(workerDecision({initial: false, version, now: at.getTime()}), 'deliver');
  assert.equal(workerDecision({initial: false, version, previousVersion: version, now: at.getTime()}), 'drop');
  assert.equal(workerDecision({initial: false, version, now: at.getTime() + 900001}), 'baseline');
  assert.equal(workerDecision({initial: false, version, previousVersion: `${at.getTime() / 1000 + 1}:000000000`, now: at.getTime()}), 'drop');
  assert.equal(workerDecision({initial: false, version: 'malformed', now: at.getTime()}), 'drop');
});

test('typed love pings preserve note history and produce only pings; untyped old notes remain notes', () => {
  const before = common({notes: [{id: 'old', text: 'Same team, always.'}]});
  const ping = {id: 'new', text: 'Al sent you a little love. ♥', kind: 'ping'};
  const changes = detectChanges('common', before, common({notes: [ping, ...before.payload.notes]}), at);
  assert.deepEqual(changes, [{category: 'pings', actorUid: 'al', route: 'home'}]);
  assert.deepEqual(categories(detectChanges('common', before, common({notes: [{...ping, kind: undefined}]}), at)), ['notes']);
  assert.deepEqual(categories(detectChanges('common', before, common({notes: [ping, {id: 'second', text: 'An actual note'}]}), at)), ['pings', 'notes']);
  assert.deepEqual(categories(detectChanges('common', common({visit: '2026-10-10'}), common({visit: ''}), at)), ['calendar']);
});

test('a shared rota-time notification is generic and an unshared/changed-owner source cannot notify', async () => {
  const after = {uid: 'al', coupleId: 'space', enabled: true, date: '2026-10-08', start: '08:00', end: '17:00',
    timeZone: 'Europe/London', updatedAt: 'now'};
  const f = fixture({kind: 'work', itemId: 'al', after});
  await f.run.deliver(f.event); assert.equal(f.sent.length, 1); assert.equal(f.sent[0].data.category, 'calendar');
  assert.equal(f.sent[0].data.route, 'home'); assert.doesNotMatch(JSON.stringify(f.sent), /08:00|17:00|Europe|London/);
  const off = fixture({kind: 'work', itemId: 'al', after: {...after, enabled: false}});
  await off.run.deliver(off.event); assert.equal(off.sent.length, 0);
  const spoofed = fixture({kind: 'work', itemId: 'yashika', after});
  await spoofed.run.deliver(spoofed.event); assert.equal(spoofed.sent.length, 0);
});

test('missing or malformed quiet-hour configuration never falls back to the server time zone', () => {
  assert.equal(quietNow(undefined, at), true);
  assert.equal(quietNow({enabled: true, start: '22:00', end: '07:00'}, at), true);
  assert.equal(quietNow({enabled: 'yes', start: '22:00', end: '07:00', timeZone: 'UTC'}, at), true);
  const incomplete = prefs(); delete incomplete.notifications.quietHours;
  assert.equal(notificationAllowed(incomplete, 'notes', at), false);
});
