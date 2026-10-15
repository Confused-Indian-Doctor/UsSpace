import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DB} from './fake-db.mjs';
import {makeDispatcher} from '../src/dispatch.mjs';
import {makeWorkerChangeHandler} from '../src/worker-handler.mjs';
import {CATEGORIES} from '../src/policy.mjs';
import {databaseRetryable, messagingRetryable, retryDatabase, retryDelay} from '../src/delivery-retry.mjs';

const at = new Date('2026-10-15T12:00:00Z');
const transient = () => Object.assign(new Error('no private contents'), {code: 'unavailable'});
const rejected = () => Object.assign(new Error('no private contents'), {code: 'messaging/server-unavailable'});
const settings = () => ({notifications: {enabled: true, categories: Object.fromEntries(CATEGORIES.map(category => [category, true])),
  quietHours: {enabled: false, start: '22:00', end: '07:00', timeZone: 'UTC'}}});
const device = () => ({uid: 'yashika', installationId: 'phone-0001', token: 'test-token-valid-00000000001', enabled: true, platform: 'android'});
function fixture({kind = 'jar', itemId = 'note-1', before = null, after = {id: 'note-1', authorUid: 'al', text: 'PRIVATE_JAR_NOTE'}, sleep} = {}) {
  const db = new DB(), sent = [], pauses = [];
  db.seed('couples/space', {memberCount: 2}).seed('couples/space/members/al', {uid: 'al'}).seed('couples/space/members/yashika', {uid: 'yashika'})
    .seed('users/al', {coupleId: 'space'}).seed('users/yashika', {coupleId: 'space'}).seed('users/yashika/preferences/v014', settings())
    .seed('users/yashika/devices/phone-0001', device()).seed('couples/space/usRoles/identity', {alUid: 'al', yashikaUid: 'yashika'});
  const paths = {jar: 'usJar', letter: 'usLetters', ping: 'usPings', common: 'shared', profile: 'profiles', bucket: 'usBucket', work: 'workSummaries'};
  const sourcePath = `couples/space/${paths[kind]}/${itemId}`; db.seed(sourcePath, after);
  const messaging = {send: async envelope => {sent.push(envelope); return 'accepted';}};
  const run = makeDispatcher({db, messaging, sendAttempts: 3, now: () => at, serverTimestamp: () => 'SERVER',
    sleep: async milliseconds => {pauses.push(milliseconds); if (sleep) await sleep(db, milliseconds);}});
  return {db, sent, pauses, messaging, run, sourcePath, event: {kind, coupleId: 'space', itemId, eventId: 'provider-event', before, after}};
}
const receipts = db => [...db.data].filter(([path]) => path.startsWith('_pushDeliveries/')).map(([, value]) => value);
function worker(f, {dispatcher = f.run, renewLease = async () => true, leaseLost = () => {}} = {}) {
  const handle = makeWorkerChangeHandler({db: f.db, dispatcher, serverTimestamp: () => 'SERVER', isActive: () => true,
    renewLease, leaseLost, now: () => at.getTime()});
  const change = {type: 'added', doc: {ref: {path: f.sourcePath}, updateTime: {seconds: at.getTime() / 1000, nanoseconds: 1}, data: () => f.event.after}};
  return {handle, change};
}

test('configured dispatcher retries an explicit FCM rejection with the same private generic event', async () => {
  const f = fixture(); let attempts = 0;
  f.messaging.send = async envelope => {f.sent.push(envelope); if (++attempts === 1) throw rejected(); return 'accepted';};
  await f.run.deliver(f.event); await f.run.deliver(f.event);
  assert.equal(attempts, 2); assert.deepEqual(f.pauses, [1000]); assert.equal(receipts(f.db)[0].status, 'sent');
  assert.equal(f.sent[0].data.eventId, f.sent[1].data.eventId); assert.doesNotMatch(JSON.stringify(f.sent), /PRIVATE_JAR_NOTE/);
});
test('transient rejection retries are bounded and do not replay a terminal failed receipt', async () => {
  const f = fixture(); let attempts = 0; f.messaging.send = async () => {attempts++; throw rejected();};
  await f.run.deliver(f.event); await f.run.deliver(f.event);
  assert.equal(attempts, 3); assert.deepEqual(f.pauses, [1000, 2000]); assert.equal(receipts(f.db)[0].status, 'send-failed');
});
test('quota rejection backs off longer instead of flooding the receiving device', async () => {
  const f = fixture(); let attempts = 0; f.messaging.send = async () => {if (++attempts === 1) throw {code: 'messaging/quota-exceeded'}; return 'accepted';};
  await f.run.deliver(f.event); assert.deepEqual(f.pauses, [10000]); assert.equal(attempts, 2);
});
test('unknown timeout outcome and permanent tokens are not retried', async () => {
  for (const code of ['network-timeout', 'messaging/registration-token-not-registered', 'messaging/invalid-argument']) {
    const f = fixture(); let attempts = 0; f.messaging.send = async () => {attempts++; throw {code};};
    await f.run.deliver(f.event); assert.equal(attempts, 1); assert.deepEqual(f.pauses, []);
    assert.equal(f.db.data.has('users/yashika/devices/phone-0001'), code !== 'messaging/registration-token-not-registered');
  }
});
test('retry backoff never overrides revoked master/category/quiet-hours/account/pair/device/source controls', async () => {
  const changes = [db => db.seed('users/yashika/preferences/v014', {...settings(), notifications: {...settings().notifications, enabled: false}}),
    db => {const p = settings(); p.notifications.categories.notes = false; db.seed('users/yashika/preferences/v014', p);},
    db => {const p = settings(); p.notifications.quietHours = {enabled: true, start: '12:00', end: '13:00', timeZone: 'UTC'}; db.seed('users/yashika/preferences/v014', p);},
    db => db.seed('users/yashika', {coupleId: 'new-space'}), db => db.data.delete('couples/space/members/al'),
    db => db.seed('users/yashika/devices/phone-0001', {...device(), token: 'replacement-token-valid-00000000001'}),
    db => db.seed('couples/space/usJar/note-1', {id: 'note-1', authorUid: 'al', text: 'replaced'})];
  for (const sleep of changes) {
    const f = fixture({sleep}); let attempts = 0; f.messaging.send = async () => {attempts++; throw rejected();};
    await f.run.deliver(f.event); assert.equal(attempts, 1); assert.equal(receipts(f.db)[0].status, 'revoked');
  }
});
test('letter role revocation during retry prevents its second attempt', async () => {
  const f = fixture({kind: 'letter', itemId: 'sad', after: {authorUid: 'al', recipientUid: 'yashika', body: 'PRIVATE_LETTER', publishedAt: 'now'},
    sleep: db => db.data.delete('couples/space/usRoles/identity')});
  let attempts = 0; f.messaging.send = async () => {attempts++; throw rejected();};
  await f.run.deliver(f.event); assert.equal(attempts, 1); assert.equal(receipts(f.db)[0].status, 'revoked');
});
test('sent-receipt Firestore retry never sends accepted FCM twice', async () => {
  const f = fixture(); let writes = 0;
  f.db.writeHook = (path, value) => {if (path.startsWith('_pushDeliveries/') && value.status === 'sent' && ++writes < 3) throw transient();};
  await f.run.deliver(f.event); assert.equal(f.sent.length, 1); assert.equal(writes, 3); assert.equal(receipts(f.db)[0].status, 'sent');
});
test('transient final-guard Firestore reads retry before the single FCM send', async () => {
  const f = fixture(); let failures = 0;
  f.db.writeHook = (path, value) => {if (path.startsWith('_pushDeliveries/') && value.status === 'claimed') {
    f.db.readHook = read => {if (read === 'users/yashika' && failures++ < 2) throw transient();};
  }};
  await f.run.deliver(f.event); assert.equal(f.sent.length, 1); assert.equal(receipts(f.db)[0].status, 'sent');
});
test('worker does not consume a source cursor when dispatcher fails before processing', async () => {
  const f = fixture(); let calls = 0;
  const w = worker(f, {dispatcher: {deliver: async event => {if (++calls === 1) throw transient(); await f.run.deliver(event);}}});
  await assert.rejects(w.handle('jar', w.change, null, false), {code: 'unavailable'});
  assert.equal([...f.db.data.keys()].filter(path => path.startsWith('_pushWorkerCursors/')).length, 0);
  await w.handle('jar', w.change, null, false); await w.handle('jar', w.change, null, false);
  assert.equal(calls, 2); assert.equal(f.sent.length, 1);
});
test('worker retries cursor acknowledgement after dispatch without duplicating the recipient push', async () => {
  const f = fixture(); const w = worker(f); let writes = 0;
  f.db.writeHook = path => {if (path.startsWith('_pushWorkerCursors/') && writes++ === 0) throw transient();};
  await retryDatabase(() => w.handle('jar', w.change, null, false), {sleep: async () => {}});
  assert.equal(f.sent.length, 1); assert.equal(writes, 2); assert.equal(receipts(f.db).length, 1);
});
test('worker quiet baseline and stale versions never dispatch history', async () => {
  for (const initial of [true, false]) {
    const f = fixture(); const w = worker(f);
    if (!initial) w.change.doc.updateTime.seconds -= 901;
    await w.handle('jar', w.change, null, initial); await w.handle('jar', w.change, null, false);
    assert.equal(f.sent.length, 0); assert.equal([...f.db.data.keys()].filter(path => path.startsWith('_pushWorkerCursors/')).length, 1);
  }
});
test('lost worker lease never dispatches or advances a live source cursor', async () => {
  const f = fixture(); let losses = 0; const w = worker(f, {renewLease: async () => false, leaseLost: () => {losses++;}});
  await w.handle('jar', w.change, null, false); assert.equal(losses, 1); assert.equal(f.sent.length, 0);
  assert.equal([...f.db.data.keys()].filter(path => path.startsWith('_pushWorkerCursors/')).length, 0);
});
test('worker ignores removed and unrelated documents instead of treating them as push sources', async () => {
  const f = fixture(); const w = worker(f);
  await w.handle('jar', {...w.change, type: 'removed'}, null, false);
  await w.handle('common', w.change, null, false);
  await w.handle('jar', {...w.change, doc: {...w.change.doc, ref: {path: 'users/al/private/data'}}}, null, false);
  assert.equal(f.sent.length, 0); assert.equal([...f.db.data.keys()].filter(path => path.startsWith('_pushWorkerCursors/')).length, 0);
});
test('only explicit transient database/send codes retry and shutdown stops database backoff', async () => {
  for (const code of [4, 8, 10, 13, 14, 'unavailable', 'resource-exhausted']) assert.equal(databaseRetryable({code}), true);
  for (const code of ['permission-denied', 'unauthenticated', 'invalid-argument', 'unknown', undefined]) assert.equal(databaseRetryable({code}), false);
  assert.equal(messagingRetryable(rejected()), true); assert.equal(messagingRetryable({code: 'network-timeout'}), false);
  assert.equal(retryDelay(50), 30000); assert.equal(retryDelay(50, true), 60000);
  let stopped = false, calls = 0;
  await retryDatabase(async () => {calls++; throw transient();}, {attempts: Infinity, stopped: () => stopped, sleep: async () => {stopped = true;}});
  assert.equal(calls, 1);
  await assert.rejects(retryDatabase(async () => {throw {code: 'permission-denied'};}, {sleep: async () => assert.fail('No retry for authorization failures')}), {code: 'permission-denied'});
});
test('all seven enabled categories still resolve real sources to private generic destinations', async () => {
  const previous = {updatedBy: 'al', payload: {notes: [], goals: [], memories: [], duties: []}};
  const cases = [
    {kind: 'ping', after: {senderUid: 'al'}, category: 'pings', route: 'home'},
    {kind: 'jar', after: {authorUid: 'al', text: 'PRIVATE'}, category: 'notes', route: 'jar'},
    {kind: 'profile', itemId: 'al', before: {payload: {status: 'Free'}}, after: {updatedBy: 'al', payload: {status: 'Working'}}, category: 'status', route: 'home'},
    ...[['goals', {id: 'g', title: 'PRIVATE', value: 1, level: 'Visible'}], ['memories', {id: 'm', title: 'PRIVATE'}],
      ['duties', {id: 'd', title: 'PRIVATE', date: '2026-10-16'}]].map(([key, row]) => ({kind: 'common', itemId: 'common', before: previous,
        after: {updatedBy: 'al', payload: {...previous.payload, [key]: [row]}}, category: key === 'duties' ? 'calendar' : key, route: key === 'duties' ? 'calendar' : key})),
    {kind: 'bucket', after: {updatedBy: 'al', title: 'PRIVATE', state: 'Planning'}, category: 'bucket', route: 'bucket'}];
  for (const item of cases) {
    const f = fixture(item); await f.run.deliver(f.event); assert.equal(f.sent.length, 1, item.category);
    assert.equal(f.sent[0].data.category, item.category); assert.equal(f.sent[0].data.route, item.route); assert.doesNotMatch(JSON.stringify(f.sent), /PRIVATE|Working/);
  }
});
