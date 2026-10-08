import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {after, before, beforeEach, test} from 'node:test';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {collection, deleteDoc, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch} from 'firebase/firestore';

const projectId = 'demo-usspace', cid = 'v014-space';
let environment;
before(async () => {
  assert.equal(process.env.GCLOUD_PROJECT || projectId, projectId);
  environment = await initializeTestEnvironment({projectId, firestore: {host: '127.0.0.1', port: 8080,
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')}});
});
beforeEach(async () => environment.clearFirestore());
after(async () => environment?.cleanup());
const client = uid => environment.authenticatedContext(uid, {email: `${uid}@example.test`}).firestore();
const categories = {pings: true, notes: true, status: true, goals: true, bucket: true, memories: true, calendar: true};
const preferences = () => ({theme: 'system', notifications: {enabled: false, categories: {...categories},
  quietHours: {enabled: false, start: '22:00', end: '07:00', timeZone: 'Europe/London'}}, updatedAt: serverTimestamp()});
const device = () => ({uid: 'al', installationId: 'phone-0001', token: 'valid-test-token-00000000001', platform: 'android', enabled: false, updatedAt: serverTimestamp()});
const settingsRef = (db, uid = 'al') => doc(db, `users/${uid}/preferences/v014`);
const deviceRef = (db, uid = 'al', id = 'phone-0001') => doc(db, `users/${uid}/devices/${id}`);
const pingRef = (db, id = 'ping-1') => doc(db, `couples/${cid}/usPings/${id}`);
const ping = (id = 'ping-1') => ({id, senderUid: 'al', createdAt: serverTimestamp()});
const summaryRef = (db, uid = 'al') => doc(db, `couples/${cid}/workSummaries/${uid}`);
const summary = () => ({uid: 'al', coupleId: cid, date: '2026-10-08', start: '08:00', end: '17:00', timeZone: 'Europe/London', enabled: true, updatedAt: serverTimestamp()});

async function paired() {
  const al = client('al'), yashika = client('yashika');
  const batch = writeBatch(al);
  batch.set(doc(al, `couples/${cid}`), {ownerUid: 'al', memberCount: 1});
  batch.set(doc(al, `couples/${cid}/members/al`), {uid: 'al', name: 'Al'});
  batch.set(doc(al, 'pairInvites/481592'), {creatorUid: 'al', coupleId: cid, expiresAt: Timestamp.fromMillis(Date.now() + 900000), used: false});
  batch.set(doc(al, 'users/al'), {coupleId: cid});
  await assertSucceeds(batch.commit());
  await assertSucceeds(runTransaction(yashika, async transaction => {
    const invite = doc(yashika, 'pairInvites/481592'); await transaction.get(invite);
    await transaction.get(doc(yashika, `couples/${cid}`));
    transaction.update(invite, {used: true, usedByUid: 'yashika', usedAt: serverTimestamp()});
    transaction.update(doc(yashika, `couples/${cid}`), {memberCount: 2, lastJoinUid: 'yashika', lastJoinCode: '481592'});
    transaction.set(doc(yashika, `couples/${cid}/members/yashika`), {uid: 'yashika', inviteCode: '481592'});
    transaction.set(doc(yashika, 'users/yashika'), {coupleId: cid});
  }));
  return {al, yashika};
}
async function leave(db, uid) {
  await assertSucceeds(runTransaction(db, async transaction => {
    const room = doc(db, `couples/${cid}`), current = await transaction.get(room);
    transaction.delete(doc(db, `couples/${cid}/members/${uid}`));
    transaction.update(room, {memberCount: current.data().memberCount - 1, lastLeaveUid: uid, lastLeaveAt: serverTimestamp()});
  }));
}

test('FCM tokens can only be registered, read, rotated and deleted by their account owner', async () => {
  const {al, yashika} = await paired();
  await assertSucceeds(setDoc(deviceRef(al), device()));
  await assertSucceeds(updateDoc(deviceRef(al), {token: 'rotated-test-token-00000000001', updatedAt: serverTimestamp()}));
  assert.equal((await getDoc(deviceRef(al))).data().token, 'rotated-test-token-00000000001');
  for (const outsider of [yashika, client('third'), environment.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(deviceRef(outsider))); await assertFails(getDocs(collection(outsider, 'users/al/devices')));
    await assertFails(setDoc(deviceRef(outsider), device())); await assertFails(deleteDoc(deviceRef(outsider)));
  }
  await assertSucceeds(deleteDoc(deviceRef(al))); assert.equal((await getDoc(deviceRef(al))).exists(), false);
});
test('device schema rejects sender impersonation, bad tokens, wrong IDs and unknown private fields', async () => {
  const al = client('al');
  for (const patch of [{uid: 'yashika'}, {installationId: 'different'}, {token: ''}, {token: 'token with spaces that is long enough'},
    {token: 'x'.repeat(4097)}, {platform: 'web'}, {enabled: 'yes'}, {updatedAt: Timestamp.fromMillis(0)},
    {health: {hr: 100}}, {coupleId: cid}, {recipientUid: 'yashika'}]) {
    await assertFails(setDoc(deviceRef(al), {...device(), ...patch}));
  }
  await assertFails(setDoc(deviceRef(al, 'al', 'short'), {...device(), installationId: 'short'}));
  await assertSucceeds(setDoc(deviceRef(al), device()));
});
test('appearance and granular notification settings stay private per account and persist independently', async () => {
  const {al, yashika} = await paired();
  await assertSucceeds(setDoc(settingsRef(al), preferences()));
  const dark = preferences(); dark.theme = 'dark'; dark.notifications.enabled = true; dark.notifications.categories.notes = false;
  await assertSucceeds(setDoc(settingsRef(al), dark));
  const found = (await getDoc(settingsRef(al))).data();
  assert.equal(found.theme, 'dark'); assert.equal(found.notifications.categories.notes, false); assert.equal(found.notifications.categories.pings, true);
  await assertSucceeds(setDoc(settingsRef(yashika, 'yashika'), {...preferences(), theme: 'light'}));
  assert.equal((await getDoc(settingsRef(yashika, 'yashika'))).data().theme, 'light');
  for (const outsider of [yashika, client('third'), environment.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(settingsRef(outsider))); await assertFails(setDoc(settingsRef(outsider), preferences()));
    await assertFails(deleteDoc(settingsRef(outsider)));
  }
  await leave(al, 'al'); await assertSucceeds(updateDoc(settingsRef(al), {theme: 'system', updatedAt: serverTimestamp()}));
});
test('notification settings reject unsupported categories, malformed quiet hours and sensitive fields', async () => {
  const al = client('al');
  const variants = [{...preferences(), theme: 'pink'}, {...preferences(), uid: 'yashika'}, {...preferences(), updatedAt: Timestamp.fromMillis(0)}];
  for (const category of ['health', 'cycle', 'mood', 'lettersDrafts']) {
    const value = preferences(); value.notifications.categories[category] = true; variants.push(value);
  }
  for (const quiet of [{start: '25:00'}, {end: '7:00'}, {timeZone: ''}, {enabled: 'yes'}, {location: 'PRIVATE'}]) {
    const value = preferences(); Object.assign(value.notifications.quietHours, quiet); variants.push(value);
  }
  const missing = preferences(); delete missing.notifications.categories.calendar; variants.push(missing);
  const nested = preferences(); nested.notifications.secret = {health: 'PRIVATE'}; variants.push(nested);
  for (const value of variants) await assertFails(setDoc(settingsRef(al), value));
  await assertFails(setDoc(doc(al, 'users/al/preferences/other'), preferences()));
  await assertSucceeds(setDoc(settingsRef(al), preferences()));
});
test('pings are explicit immutable authenticated writes for a current pair and cannot spoof recipients', async () => {
  const {al, yashika} = await paired();
  await assertSucceeds(setDoc(pingRef(al), ping())); await assertSucceeds(getDoc(pingRef(yashika)));
  for (const patch of [{id: 'wrong'}, {senderUid: 'yashika'}, {recipientUid: 'third'}, {body: 'private words'}, {createdAt: Timestamp.fromMillis(0)}])
    await assertFails(setDoc(pingRef(al, 'ping-2'), {...ping('ping-2'), ...patch}));
  await assertFails(updateDoc(pingRef(al), {senderUid: 'yashika'})); await assertFails(deleteDoc(pingRef(al)));
  await assertFails(setDoc(pingRef(client('third'), 'intruder'), {...ping('intruder'), senderUid: 'third'}));
  await assertFails(getDoc(pingRef(environment.unauthenticatedContext().firestore())));
  await leave(yashika, 'yashika'); await assertFails(setDoc(pingRef(al, 'after-leave'), ping('after-leave')));
  await assertFails(getDoc(pingRef(al)));
});
test('common/profile actor metadata is verified while legacy metadata-free writes remain supported', async () => {
  const {al} = await paired();
  const shared = doc(al, `couples/${cid}/shared/common`), profile = doc(al, `couples/${cid}/profiles/al`);
  await assertSucceeds(setDoc(shared, {payload: {goals: [], notes: [], memories: [], duties: []}}));
  await assertSucceeds(setDoc(shared, {payload: {notes: []}, updatedBy: 'al', updatedAt: serverTimestamp()}));
  await assertFails(setDoc(shared, {payload: {notes: []}, updatedBy: 'yashika'}));
  await assertSucceeds(setDoc(profile, {payload: {status: 'At work'}, updatedBy: 'al'}));
  await assertFails(setDoc(profile, {payload: {status: 'At work'}, updatedBy: 'yashika'}));
  await assertFails(setDoc(profile, {payload: {health: {hr: 80}}, updatedBy: 'al'}));
});
test('optional work summary contains only time fields and only the current owner can publish or change it', async () => {
  const {al, yashika} = await paired();
  await assertSucceeds(setDoc(summaryRef(al), summary()));
  assert.equal((await assertSucceeds(getDoc(summaryRef(yashika)))).data().start, '08:00');
  for (const patch of [{uid: 'yashika'}, {coupleId: 'wrong'}, {enabled: false}, {date: ''}, {start: '08'}, {end: '25:00'},
    {timeZone: ''}, {location: 'private ward'}, {tutorial: 'secret'}, {simulation: 'patient scenario'}, {rows: []},
    {graphToken: 'SECRET'}, {workbookUrl: 'https://private.sharepoint.com'}, {updatedAt: Timestamp.fromMillis(0)}])
    await assertFails(setDoc(summaryRef(al), {...summary(), ...patch}));
  await assertFails(setDoc(summaryRef(yashika), summary())); await assertFails(deleteDoc(summaryRef(yashika)));
  await assertFails(getDoc(summaryRef(client('third'))));
  await assertSucceeds(updateDoc(summaryRef(al), {end: '18:00', updatedAt: serverTimestamp()}));
});
test('work summary is hidden after unpairing and its owner can revoke the old disclosure afterwards', async () => {
  const {al, yashika} = await paired(); await assertSucceeds(setDoc(summaryRef(al), summary()));
  await leave(al, 'al');
  await assertFails(getDoc(summaryRef(yashika))); await assertFails(getDoc(summaryRef(al)));
  await assertFails(setDoc(summaryRef(al), summary()));
  await assertFails(deleteDoc(summaryRef(yashika))); await assertSucceeds(deleteDoc(summaryRef(al)));
  await environment.withSecurityRulesDisabled(async context => assert.equal((await getDoc(summaryRef(context.firestore()))).exists(), false));
});
test('clients cannot manufacture dispatch receipts, worker cursors, leases or read server push records', async () => {
  const {al, yashika} = await paired();
  for (const path of ['_pushDeliveries/event-1', '_pushWorkerCursors/source-1', '_pushWorkerLeases/v014']) {
    await environment.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), path), {status: 'sent'}));
    for (const db of [al, yashika, client('third'), environment.unauthenticatedContext().firestore()]) {
      await assertFails(getDoc(doc(db, path))); await assertFails(setDoc(doc(db, path), {status: 'claimed'}));
      await assertFails(deleteDoc(doc(db, path)));
    }
  }
});
