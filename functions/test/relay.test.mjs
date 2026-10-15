import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DB} from './fake-db.mjs';
import {makeOutboxRelay} from '../src/relay.mjs';
import {CATEGORIES} from '../src/policy.mjs';
import {OUTBOX_SOURCES, sameTimestamp, typedIntents, validOutbox} from '../src/outbox-policy.mjs';
const projectId = 'usspace-c859e', at = new Date('2026-10-15T12:00:00.000Z');
const stamp = {seconds: at.getTime() / 1000, nanoseconds: 123000};
const preferences = () => ({notifications: {enabled: true, categories: Object.fromEntries(CATEGORIES.map(category => [category, true])),
  quietHours: {enabled: false, start: '22:00', end: '07:00', timeZone: 'UTC'}}});
function fixture({kind = 'ping', categories, after, receipt, now = () => at} = {}) {
  const db = new DB(), sent = [], authCalls = [], logs = [];
  const actor = 'al', sourceId = ['profile', 'work'].includes(kind) ? actor : kind === 'common' ? 'common' : kind === 'letter' ? 'sad' : 'item-1';
  const source = OUTBOX_SOURCES[kind], sourcePath = `couples/space/${source.collection}/${sourceId}`;
  const payloads = {
    ping: {senderUid: actor, createdAt: stamp}, common: {updatedBy: actor, updatedAt: stamp, payload: {notes: [], goals: [], memories: [], duties: []}},
    profile: {updatedBy: actor, updatedAt: stamp, payload: {status: 'PRIVATE_STATUS'}},
    jar: {authorUid: actor, text: 'PRIVATE_JAR_NOTE'}, bucket: {updatedBy: actor, title: 'PRIVATE_BUCKET_TITLE'},
    letter: {authorUid: actor, recipientUid: 'yashika', publishedAt: '2026-10-15T12:00:00Z', body: 'PRIVATE_LETTER'},
    work: {uid: actor, coupleId: 'space', enabled: true, updatedAt: stamp, start: '08:00', end: '17:00', date: '2026-10-15', timeZone: 'Europe/London'},
  };
  const event = {id: 'event-1', actorUid: actor, sourceKind: kind, sourceId,
    categories: categories || [Object.keys(source.routes)[0]], createdAt: stamp};
  if (source.receipt) event.receiptId = 'space_operation-1';
  db.seed('couples/space', {memberCount: 2}).seed('couples/space/members/al', {uid: actor}).seed('couples/space/members/yashika', {uid: 'yashika'})
    .seed('users/al', {coupleId: 'space'}).seed('users/yashika', {coupleId: 'space'}).seed('users/yashika/preferences/v014', preferences())
    .seed('users/yashika/devices/phone-0001', {uid: 'yashika', installationId: 'phone-0001', token: 'fcm-test-token-000000000001', platform: 'android', enabled: true})
    .seed('couples/space/usRoles/identity', {alUid: actor, yashikaUid: 'yashika'})
    .seed(sourcePath, after || payloads[kind]).seed('couples/space/pushOutbox/event-1', event);
  db.updateTimes.set(sourcePath, stamp); db.updateTimes.set('couples/space/pushOutbox/event-1', stamp);
  if (source.receipt) db.seed('users/al/usReceipts/space_operation-1', receipt || {operationId: 'operation-1', coupleId: 'space', kind, itemId: sourceId, at: stamp});
  const auth = {verifyIdToken: async (token, checkRevoked) => {authCalls.push({token, checkRevoked}); return {uid: actor, aud: projectId, iss: `https://securetoken.google.com/${projectId}`};}};
  const messaging = {send: async envelope => {sent.push(envelope); return 'FCM-ACCEPTED';}};
  const run = makeOutboxRelay({db, auth, messaging, projectId, now, logger: {warn: (...parts) => logs.push(parts)}, serverTimestamp: () => 'SERVER', sleep: async () => {}});
  const request = {method: 'POST', authorization: 'Bearer private-test-id-token', body: {coupleId: 'space', eventId: 'event-1'}};
  return {db, sent, authCalls, auth, messaging, run, request, event, sourcePath, logs,
    saveEvent: update => {Object.assign(event, update); db.seed('couples/space/pushOutbox/event-1', event);}};
}
test('relay authenticates with revocation check then sends the persisted generic ping once', async () => {
  const f = fixture(); const result = await f.run.handle(f.request); await f.run.handle(f.request);
  assert.deepEqual(result, {status: 200, body: {consumed: true, outcome: 'processed'}});
  assert.equal(f.authCalls[0].checkRevoked, true); assert.equal(f.sent.length, 1); assert.equal(f.sent[0].android.priority, 'high');
  assert.equal(f.sent[0].data.recipientUid, 'yashika'); assert.equal(f.sent[0].data.category, 'pings'); assert.equal(f.sent[0].data.route, 'home');
  assert.doesNotMatch(JSON.stringify(f.sent), /PRIVATE|private-test-id-token/);
});
test('relay accepts only POST and bounded persisted couple/event IDs, not category/token/message/recipient input', async () => {
  const f = fixture();
  assert.equal((await f.run.handle({...f.request, method: 'GET'})).status, 405);
  for (const body of [null, [], {coupleId: 'space'}, {...f.request.body, category: 'pings'}, {...f.request.body, recipientUid: 'other'},
    {...f.request.body, token: 'secret'}, {...f.request.body, body: 'arbitrary message'}, {coupleId: '../private', eventId: 'event-1'},
    {coupleId: 'space', eventId: 'x'.repeat(141)}]) assert.equal((await f.run.handle({...f.request, body})).status, 400);
  assert.equal(f.authCalls.length, 0); assert.equal(f.sent.length, 0);
});
test('missing, expired/revoked and cross-project ID tokens cannot invoke relay', async () => {
  const f = fixture();
  for (const authorization of ['', 'Basic token', 'Bearer token with spaces', 'Bearer ' + 'a'.repeat(16384)])
    assert.equal((await f.run.handle({...f.request, authorization})).status, 401);
  f.auth.verifyIdToken = async () => {throw {code: 'auth/id-token-revoked'};};
  assert.equal((await f.run.handle(f.request)).status, 401);
  f.auth.verifyIdToken = async () => ({uid: 'al', aud: 'other-project', iss: `https://securetoken.google.com/${projectId}`});
  assert.equal((await f.run.handle(f.request)).status, 401);
  f.auth.verifyIdToken = async () => ({uid: 'al', aud: projectId, iss: 'https://other.example'});
  assert.equal((await f.run.handle(f.request)).status, 401); assert.equal(f.sent.length, 0);
});
test('authentication service outage returns a bounded retriable response rather than claiming delivery', async () => {
  const f = fixture(); f.auth.verifyIdToken = async () => {throw {code: 'auth/internal-error'};};
  const result = await f.run.handle(f.request); assert.equal(result.status, 503); assert.equal(result.body.retryable, true); assert.equal(result.body.consumed, false);
});
test('current exact two-person membership and both canonical accounts are mandatory', async () => {
  for (const mutate of [db => db.data.delete('couples/space/members/al'), db => db.seed('couples/space', {memberCount: 1}),
    db => db.seed('couples/space/members/third', {uid: 'third'}), db => db.seed('users/al', {coupleId: 'new-space'}),
    db => db.seed('users/yashika', {coupleId: 'new-space'})]) {
    const f = fixture(); mutate(f.db); assert.equal((await f.run.handle(f.request)).status, 403); assert.equal(f.sent.length, 0);
  }
});
test('a caller cannot relay another actor event or a missing event', async () => {
  const f = fixture(); f.saveEvent({actorUid: 'yashika'}); assert.equal((await f.run.handle(f.request)).status, 403);
  f.db.data.delete('couples/space/pushOutbox/event-1'); assert.equal((await f.run.handle(f.request)).status, 404); assert.equal(f.sent.length, 0);
});
test('outbox validates exact fields and source-specific categories instead of trusting arbitrary metadata', async () => {
  for (const change of [{sourceKind: 'health'}, {sourceKind: 'cycle'}, {sourceKind: '__proto__'}, {sourceKind: 'constructor'},
    {sourceId: '../private'}, {categories: ['notes']}, {categories: ['pings', 'pings']}, {categories: []}, {recipientUid: 'other'},
    {body: 'SECRET'}, {receiptId: 'made-up'}, {id: 'different-event'}]) {
    const f = fixture(); f.saveEvent(change); assert.equal((await f.run.handle(f.request)).status, 403); assert.equal(f.sent.length, 0);
  }
});
test('old events are acknowledged silently, impossible future timestamps are rejected', async () => {
  const old = fixture({now: () => new Date(at.getTime() + 900001)});
  assert.deepEqual(await old.run.handle(old.request), {status: 200, body: {consumed: true, outcome: 'suppressed'}}); assert.equal(old.sent.length, 0);
  const future = fixture({now: () => new Date(at.getTime() - 60001)});
  assert.equal((await future.run.handle(future.request)).status, 403); assert.equal(future.sent.length, 0);
});
test('source and event must be the exact atomic Firestore commit, not just equal millisecond times', async () => {
  for (const path of ['source', 'event']) {
    const f = fixture(); f.db.updateTimes.set(path === 'source' ? f.sourcePath : 'couples/space/pushOutbox/event-1', {...stamp, nanoseconds: stamp.nanoseconds + 1});
    const result = await f.run.handle(f.request); assert.equal(result.status, path === 'source' ? 200 : 403); assert.equal(f.sent.length, 0);
  }
  assert.equal(sameTimestamp(stamp, {...stamp, nanoseconds: stamp.nanoseconds + 1}), false);
});
test('atomic common/profile/work server timestamps and actors cannot be substituted', async () => {
  for (const kind of ['common', 'profile', 'work']) {
    const f = fixture({kind}); const original = f.db.data.get(f.sourcePath);
    for (const patch of [{updatedAt: {...stamp, nanoseconds: 0}}, kind === 'work' ? {uid: 'yashika'} : {updatedBy: 'yashika'}]) {
      f.db.seed(f.sourcePath, {...original, ...patch}); const result = await f.run.handle(f.request);
      assert.equal(result.body.outcome, 'suppressed'); assert.equal(f.sent.length, 0);
    }
  }
});
test('private health/cycle payloads never become a typed common/profile push source', async () => {
  for (const kind of ['common', 'profile']) for (const key of ['health', 'healthHistory', 'cycle']) {
    const f = fixture({kind}); const original = f.db.data.get(f.sourcePath);
    f.db.seed(f.sourcePath, {...original, payload: {...original.payload, [key]: {secret: 'PRIVATE'}}});
    assert.equal((await f.run.handle(f.request)).body.outcome, 'suppressed'); assert.equal(f.sent.length, 0);
  }
});
test('extras require the exact actor-private immutable native operation receipt and matching commit', async () => {
  for (const kind of ['jar', 'letter', 'bucket']) for (const change of [{kind: 'draft'}, {itemId: 'other'}, {coupleId: 'new-space'},
    {operationId: 'other-op'}, {at: {...stamp, nanoseconds: 0}}]) {
    const f = fixture({kind}); const path = 'users/al/usReceipts/space_operation-1'; f.db.seed(path, {...f.db.data.get(path), ...change});
    assert.equal((await f.run.handle(f.request)).body.outcome, 'suppressed'); assert.equal(f.sent.length, 0);
  }
  const f = fixture({kind: 'jar'}); f.db.data.delete('users/al/usReceipts/space_operation-1');
  assert.equal((await f.run.handle(f.request)).body.outcome, 'suppressed'); assert.equal(f.sent.length, 0);
});
test('released letters still require role-bound author and only the intended current partner', async () => {
  for (const mutate of [db => db.data.delete('couples/space/usRoles/identity'), db => db.seed('couples/space/usRoles/identity', {alUid: 'yashika', yashikaUid: 'al'})]) {
    const f = fixture({kind: 'letter'}); mutate(f.db); assert.equal((await f.run.handle(f.request)).status, 200); assert.equal(f.sent.length, 0);
  }
  const f = fixture({kind: 'letter'}); await f.run.handle(f.request); assert.equal(f.sent.length, 1); assert.equal(f.sent[0].data.route, 'letters');
  assert.doesNotMatch(JSON.stringify(f.sent), /PRIVATE_LETTER|sad/);
});
test('preferences, category, quiet hours and disabled devices suppress a processed relay event', async () => {
  for (const mutate of [db => {const p = preferences(); p.notifications.enabled = false; db.seed('users/yashika/preferences/v014', p);},
    db => {const p = preferences(); p.notifications.categories.pings = false; db.seed('users/yashika/preferences/v014', p);},
    db => {const p = preferences(); p.notifications.quietHours = {enabled: true, start: '12:00', end: '13:00', timeZone: 'UTC'}; db.seed('users/yashika/preferences/v014', p);},
    db => db.seed('users/yashika/devices/phone-0001', {enabled: false})]) {
    const f = fixture(); mutate(f.db); assert.equal((await f.run.handle(f.request)).status, 200); assert.equal(f.sent.length, 0);
  }
});
test('all persisted source kinds route only fixed generic messages with high priority limited to pings/notes', async () => {
  for (const [kind, source] of Object.entries(OUTBOX_SOURCES)) for (const category of Object.keys(source.routes)) {
    const f = fixture({kind, categories: [category]}); assert.equal((await f.run.handle(f.request)).status, 200);
    assert.equal(f.sent.length, 1, kind + ':' + category); assert.equal(f.sent[0].data.route, source.routes[category]);
    assert.equal(f.sent[0].android.priority, ['pings', 'notes'].includes(category) ? 'high' : 'normal');
    assert.doesNotMatch(JSON.stringify(f.sent), /PRIVATE|08:00|17:00|Europe/);
  }
});
test('transient Firestore failures return retriable 503 without source data or credential logs', async () => {
  const f = fixture(); f.db.readHook = () => {throw Object.assign(new Error('SECRET_TOKEN'), {code: 'unavailable'});};
  const result = await f.run.handle(f.request); assert.equal(result.status, 503); assert.equal(result.body.retryable, true);
  assert.doesNotMatch(JSON.stringify([result, f.logs]), /SECRET_TOKEN|private-test-id-token/); assert.equal(f.sent.length, 0);
});
test('typed-intent validation rejects arbitrary route/category and cannot notify a same-account letter', () => {
  assert.deepEqual(typedIntents('health', ['pings'], 'al', {}), []);
  assert.deepEqual(typedIntents('common', ['https://example'], 'al', {}), []);
  assert.deepEqual(typedIntents('letter', ['notes'], 'al', {recipientUid: 'al'}), []);
  const f = fixture(); assert.equal(validOutbox(f.event, 'event-1', 'al'), true);
  assert.throws(() => makeOutboxRelay({projectId: 'not a project'}));
});
test('relay retries a known rejected FCM send only after 30 seconds and preserves one stable event ID', async () => {
  let time = at.getTime(), calls = 0;
  const f = fixture({now: () => new Date(time)});
  f.messaging.send = async envelope => {f.sent.push(envelope); if (++calls === 1) throw {code: 'messaging/server-unavailable'}; return 'accepted';};
  const first = await f.run.handle(f.request); assert.equal(first.status, 503); assert.equal(first.body.retryAfterSeconds, 30);
  const early = await f.run.handle(f.request); assert.equal(early.status, 503); assert.equal(calls, 1);
  time += 30000;
  assert.equal((await f.run.handle(f.request)).status, 200); assert.equal(calls, 2);
  assert.equal(f.sent[0].data.eventId, f.sent[1].data.eventId);
  await f.run.handle(f.request); assert.equal(calls, 2);
});
test('relay has at most three rejected FCM claims per source/device before terminal acknowledgement', async () => {
  let time = at.getTime(), calls = 0;
  const f = fixture({now: () => new Date(time)}); f.messaging.send = async () => {calls++; throw {code: 'messaging/quota-exceeded'};};
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await f.run.handle(f.request); assert.equal(result.status, attempt < 3 ? 503 : 200); time += 30000;
  }
  await f.run.handle(f.request); assert.equal(calls, 3);
  const receipt = [...f.db.data].find(([path]) => path.startsWith('_pushDeliveries/'))[1]; assert.equal(receipt.status, 'send-failed'); assert.equal(receipt.claimCount, 3);
});
test('retryable relay receipts recheck current preferences, token, source and letter roles before another send', async () => {
  for (const mutate of [db => {const p = preferences(); p.notifications.enabled = false; db.seed('users/yashika/preferences/v014', p);},
    db => db.data.delete('users/yashika/devices/phone-0001'), db => db.seed('couples/space/usRoles/identity', {alUid: 'yashika', yashikaUid: 'al'}),
    db => db.updateTimes.set('couples/space/usLetters/sad', {...stamp, nanoseconds: stamp.nanoseconds + 1})]) {
    let time = at.getTime(), calls = 0; const f = fixture({kind: 'letter', now: () => new Date(time)});
    f.messaging.send = async () => {calls++; throw {code: 'messaging/server-unavailable'};};
    assert.equal((await f.run.handle(f.request)).status, 503); time += 30000; mutate(f.db);
    assert.equal((await f.run.handle(f.request)).status, 200); assert.equal(calls, 1);
  }
});
test('unknown FCM outcomes and permanent-token errors are consumed without unsafe retransmission', async () => {
  for (const code of ['network-timeout', 'messaging/registration-token-not-registered']) {
    const f = fixture(); let calls = 0; f.messaging.send = async () => {calls++; throw {code};};
    assert.equal((await f.run.handle(f.request)).status, 200); await f.run.handle(f.request); assert.equal(calls, 1);
  }
});
test('concurrent relay requests share a transactional claim instead of both sending', async () => {
  const f = fixture(); const results = await Promise.all([f.run.handle(f.request), f.run.handle(f.request)]);
  assert.ok(results.every(result => [200, 503].includes(result.status))); assert.ok(results.some(result => result.status === 200)); assert.equal(f.sent.length, 1);
});
