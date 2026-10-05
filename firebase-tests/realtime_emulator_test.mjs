import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {after, before, beforeEach, test} from 'node:test';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {collection, deleteField, doc, getDoc, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch} from 'firebase/firestore';

const require = createRequire(import.meta.url);
const Sync = require('../app/src/main/assets/realtime-sync.js');
const Learning = require('../app/src/main/assets/learning.js');
const Courses = require('../app/src/main/assets/learning-content.js');
const projectId = 'demo-usspace';
let environment;

before(async () => {
  // A demo project plus localhost prevents these tests from touching production.
  assert.equal(process.env.GCLOUD_PROJECT || projectId, projectId);
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')},
  });
});
beforeEach(async () => environment.clearFirestore());
after(async () => environment?.cleanup());

const client = uid => environment.authenticatedContext(uid, {email: `${uid}@example.test`}).firestore();
const member = uid => ({uid, name: uid, email: `${uid}@example.test`, joinedAt: serverTimestamp()});
const progress = learner => Learning.normalizeProgress(Courses[learner], null);
const common = () => ({visit: '2026-10-20', duties: [], goals: [], notes: [], memories: [], learn: {progress: {al: progress('al'), yashika: progress('yashika')}}});
const profile = name => ({name, status: 'Available', life: {watchTitle: 'Shared show'}, checkins: [], updated: new Date().toISOString()});
const sharedRef = db => doc(db, 'couples/test-space/shared/common');

async function createSpace(db, uid = 'al', code = '123456') {
  const batch = writeBatch(db);
  batch.set(doc(db, 'couples/test-space'), {ownerUid: uid, memberCount: 1, createdAt: serverTimestamp()});
  batch.set(doc(db, `couples/test-space/members/${uid}`), {...member(uid), role: 'creator'});
  batch.set(doc(db, `pairInvites/${code}`), {
    coupleId: 'test-space', creatorUid: uid, createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000), used: false,
  });
  batch.set(doc(db, `users/${uid}`), {coupleId: 'test-space', pairedAt: serverTimestamp()}, {merge: true});
  await assertSucceeds(batch.commit());
}

async function joinSpace(db, uid = 'yashika', code = '123456') {
  return assertSucceeds(runTransaction(db, async transaction => {
    const inviteRef = doc(db, `pairInvites/${code}`);
    const invite = await transaction.get(inviteRef);
    assert.ok(invite.exists());
    assert.equal(invite.data().used, false);
    const coupleRef = doc(db, `couples/${invite.data().coupleId}`);
    const couple = await transaction.get(coupleRef);
    assert.equal(couple.data().memberCount, 1);
    transaction.update(inviteRef, {used: true, usedByUid: uid, usedAt: serverTimestamp()});
    transaction.update(coupleRef, {memberCount: 2, lastJoinCode: code, lastJoinUid: uid});
    transaction.set(doc(db, `couples/test-space/members/${uid}`), {...member(uid), role: 'member', inviteCode: code});
    transaction.set(doc(db, `users/${uid}`), {coupleId: 'test-space', pairedAt: serverTimestamp()}, {merge: true});
  }));
}

async function paired() {
  const al = client('al');
  const yashika = client('yashika');
  await createSpace(al);
  await joinSpace(yashika);
  await setDoc(sharedRef(al), {payload: common(), updatedBy: 'al', updatedAt: serverTimestamp(), syncClients: {}});
  return {al, yashika};
}

function waitForServerSnapshot(reference, predicate) {
  let stop;
  let timer;
  const promise = new Promise((resolve, reject) => {
    timer = setTimeout(() => {stop?.(); reject(new Error('Realtime server snapshot was not delivered within 15 seconds'));}, 15000);
    stop = onSnapshot(reference, {includeMetadataChanges: true}, snapshot => {
      if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites && predicate(snapshot)) {
        clearTimeout(timer); stop?.(); resolve(snapshot);
      }
    }, error => {clearTimeout(timer); stop?.(); reject(error);});
  });
  return {promise, cancel: () => {clearTimeout(timer); stop?.();}};
}

// Use the APK's reducer inside actual client Firestore transactions. The
// sequence guard matches native pushPatch, including retries after reconnect.
async function pushPatch(db, uid, envelope) {
  envelope = {protocol: 1, ...envelope};
  return runTransaction(db, async transaction => {
    const reference = sharedRef(db);
    const snapshot = await transaction.get(reference);
    const current = snapshot.exists() ? snapshot.data() : {payload: common(), syncClients: {}};
    const syncClients = {...(current.syncClients || {})};
    if ((syncClients[envelope.clientId] || 0) >= envelope.sequence) return;
    const payload = Sync.applyPatch(current.payload || {}, envelope);
    syncClients[envelope.clientId] = envelope.sequence;
    transaction.set(reference, {payload, syncClients, updatedBy: uid, updatedAt: serverTimestamp()});
  });
}

test('pairing atomically creates exactly two authenticated members and consumes the invite', async () => {
  const {al, yashika} = await paired();
  assert.equal((await getDoc(doc(al, 'couples/test-space'))).data().memberCount, 2);
  assert.equal((await getDoc(doc(yashika, 'pairInvites/123456'))).data().usedByUid, 'yashika');
  assert.deepEqual((await getDocs(collection(al, 'couples/test-space/members'))).docs.map(x => x.id).sort(), ['al', 'yashika']);
  await assertFails(updateDoc(doc(client('third'), 'couples/test-space'), {memberCount: 3, lastJoinCode: '123456', lastJoinUid: 'third'}));
  await assertFails(updateDoc(doc(client('third'), 'pairInvites/123456'), {used: true, usedByUid: 'third', usedAt: serverTimestamp()}));
});

test('a listener on the second authenticated device receives a committed shared update', async () => {
  const {al, yashika} = await paired();
  const waiting = waitForServerSnapshot(sharedRef(yashika), s => s.exists() && s.data().payload.notes.some(n => n.text === 'Arrived safely'));
  try {
    await pushPatch(al, 'al', {clientId: 'al-device', sequence: 1, changes: [{kind: 'entity', path: ['notes'], id: 'note-1', fields: {text: 'Arrived safely', date: '2026-10-05'}}]});
    const delivered = await waiting.promise;
    assert.equal(delivered.data().updatedBy, 'al');
    assert.equal(delivered.data().payload.notes[0].text, 'Arrived safely');
  } finally {waiting.cancel();}
});

test('concurrent learner edits merge without overwriting either learner and retries do not double XP', async () => {
  const {al, yashika} = await paired();
  const first = {clientId: 'al-device', sequence: 1, changes: [
    {kind: 'increment', path: ['learn', 'progress', 'al', 'xp'], value: 5},
    {kind: 'union', path: ['learn', 'progress', 'al', 'known'], value: ['kn01']},
  ]};
  const second = {clientId: 'yashika-device', sequence: 1, changes: [
    {kind: 'increment', path: ['learn', 'progress', 'yashika', 'xp'], value: 7},
    {kind: 'union', path: ['learn', 'progress', 'yashika', 'known'], value: ['ml01']},
  ]};
  await Promise.all([pushPatch(al, 'al', first), pushPatch(yashika, 'yashika', second)]);
  await pushPatch(al, 'al', first); // An acknowledged operation may be retried after an interrupted connection.
  const stored = (await getDoc(sharedRef(yashika))).data();
  assert.equal(stored.payload.learn.progress.al.xp, 5);
  assert.equal(stored.payload.learn.progress.yashika.xp, 7);
  assert.deepEqual(stored.payload.learn.progress.al.known, ['kn01']);
  assert.deepEqual(stored.payload.learn.progress.yashika.known, ['ml01']);
  assert.deepEqual(stored.syncClients, {'al-device': 1, 'yashika-device': 1});
});

test('simultaneous edits of the same learner preserve both earned increments', async () => {
  const {al, yashika} = await paired();
  await Promise.all([
    pushPatch(al, 'al', {clientId: 'tablet-device', sequence: 1, changes: [{kind: 'increment', path: ['learn', 'progress', 'al', 'xp'], value: 5}]}),
    pushPatch(yashika, 'yashika', {clientId: 'phone-device', sequence: 1, changes: [{kind: 'increment', path: ['learn', 'progress', 'al', 'xp'], value: 9}]}),
  ]);
  assert.equal((await getDoc(sharedRef(al))).data().payload.learn.progress.al.xp, 14);
});

test('two devices completing the same unit award its bonus once while retaining both practice XP gains', async () => {
  const {al, yashika} = await paired();
  const before = common();
  const one = structuredClone(before);
  const two = structuredClone(before);
  const course = Courses.al;
  const unit = course.units[0];
  const reviewedOne = Learning.review(course, before.learn.progress.al, unit.phrases[0].id, 1, 1791230400000, 'tablet-review');
  const reviewedTwo = Learning.review(course, Learning.review(course, before.learn.progress.al, unit.phrases[1].id, 1, 1791230400000, 'phone-review1'), unit.phrases[2].id, 1, 1791230401000, 'phone-review2');
  const answersOne = Object.fromEntries(unit.phrases.map((phrase, index) => [phrase.id, index >= 2]));
  const answersTwo = Object.fromEntries(unit.phrases.map(phrase => [phrase.id, true]));
  one.learn.progress.al = Learning.completeUnit(course, reviewedOne, unit.id, answersOne, 1791230402000).progress;
  two.learn.progress.al = Learning.completeUnit(course, reviewedTwo, unit.id, answersTwo, 1791230403000).progress;
  assert.equal(one.learn.progress.al.xp, 32);
  assert.equal(two.learn.progress.al.xp, 34);
  const first = {clientId: 'tablet-device', sequence: 1, changes: Sync.diffCommon(before, one)};
  const second = {clientId: 'phone-device', sequence: 1, changes: Sync.diffCommon(before, two)};
  await Promise.all([pushPatch(al, 'al', first), pushPatch(yashika, 'yashika', second)]);
  await pushPatch(al, 'al', first);
  const saved = (await getDoc(sharedRef(al))).data().payload.learn.progress.al;
  assert.equal(saved.xp, 36, 'thirty bonus XP plus both practice gains must survive concurrent completion and retry');
  assert.equal(saved.units[unit.id].score, 100);
  assert.equal(Object.keys(saved.units).length, 1);
});

test('persisted learning changes survive restart and reach the partner after reconnect', async () => {
  const {al, yashika} = await paired();
  const entries = new Map();
  const storage = {getItem: key => entries.get(key) || null, setItem: (key, value) => entries.set(key, value)};
  const local = common();
  const controller = new Sync.Controller(storage, 'test-space:al', local);
  controller.hydrate((await getDoc(sharedRef(al))).data().payload, {exists: true});
  local.learn.progress.al.xp = 50;
  local.learn.progress.al.known = ['kn01'];
  local.learn.progress.al.units = {greetings: {completedAt: 1791230400000, score: 100}};
  controller.capture(local);
  assert.equal(controller.pendingCount(), 1);
  const restored = new Sync.Controller(storage, 'test-space:al', local);
  const rebased = restored.hydrate((await getDoc(sharedRef(al))).data().payload, {exists: true});
  assert.equal(rebased.learn.progress.al.xp, 50);
  const pending = restored.next();
  assert.ok(pending, 'restarted app must retain the pending operation');
  const waiting = waitForServerSnapshot(sharedRef(yashika), s => s.exists() && s.data().payload.learn.progress.al.units.greetings?.score === 100);
  try {
    await pushPatch(al, 'al', pending);
    restored.ack(pending.clientId, pending.sequence);
    const delivered = await waiting.promise;
    assert.equal(delivered.data().payload.learn.progress.al.xp, 50);
    assert.deepEqual(delivered.data().payload.learn.progress.al.known, ['kn01']);
    assert.equal(restored.pendingCount(), 0);
  } finally {waiting.cancel();}
});

test('the shipped projection keeps private goals and health values out of a real shared document', async () => {
  const {al, yashika} = await paired();
  const local = {...common(), health: {note: 'HEALTH_SECRET'}, healthHistory: [{note: 'HISTORY_SECRET'}], cycle: {note: 'CYCLE_SECRET'}};
  local.goals = [{id: 'private-1', title: 'PRIVATE_GOAL_SECRET', level: 'Private'}, {id: 'shared-1', title: 'Read together', level: 'Visible', value: 1, target: 10}];
  local.learn.progress.al.health = {note: 'NESTED_HEALTH_SECRET'};
  const projected = Sync.projectCommon(local);
  await setDoc(sharedRef(al), {payload: projected, updatedBy: 'al', updatedAt: serverTimestamp()});
  const delivered = (await getDoc(sharedRef(yashika))).data().payload;
  assert.deepEqual(delivered.goals.map(goal => goal.id), ['shared-1']);
  assert.doesNotMatch(JSON.stringify(delivered), /HEALTH_SECRET|HISTORY_SECRET|CYCLE_SECRET|PRIVATE_GOAL_SECRET|NESTED_HEALTH_SECRET/);
});

test('unauthenticated users and nonmembers cannot access shared data or profiles', async () => {
  const {al} = await paired();
  await setDoc(doc(al, 'couples/test-space/profiles/al'), {payload: profile('Al'), updatedBy: 'al', updatedAt: serverTimestamp()});
  for (const outsider of [client('outsider'), environment.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(sharedRef(outsider)));
    await assertFails(setDoc(sharedRef(outsider), {payload: common()}));
    await assertFails(getDoc(doc(outsider, 'couples/test-space/profiles/al')));
    await assertFails(getDocs(collection(outsider, 'couples/test-space/members')));
  }
  await assertFails(getDocs(collection(client('outsider'), 'pairInvites')));
});

test('each member can publish their own profile and cannot replace their partner profile', async () => {
  const {al, yashika} = await paired();
  await assertSucceeds(setDoc(doc(al, 'couples/test-space/profiles/al'), {payload: profile('Al'), updatedBy: 'al', updatedAt: serverTimestamp()}));
  await assertSucceeds(setDoc(doc(yashika, 'couples/test-space/profiles/yashika'), {payload: profile('Yashika'), updatedBy: 'yashika', updatedAt: serverTimestamp()}));
  await assertFails(setDoc(doc(al, 'couples/test-space/profiles/yashika'), {payload: profile('Impersonation'), updatedBy: 'al'}));
});

test('Health and Cycle are blocked by Firestore rules even for authenticated members', async () => {
  const {al} = await paired();
  for (const forbidden of ['health', 'healthHistory', 'cycle']) {
    await assertFails(setDoc(sharedRef(al), {payload: {...common(), [forbidden]: {private: true}}, updatedBy: 'al'}));
    await assertFails(setDoc(doc(al, 'couples/test-space/profiles/al'), {payload: {...profile('Al'), [forbidden]: {private: true}}, updatedBy: 'al'}));
    const nestedCommon = common();
    nestedCommon.learn.progress.al[forbidden] = {private: true};
    await assertFails(setDoc(sharedRef(al), {payload: nestedCommon, updatedBy: 'al'}));
    const nestedProfile = profile('Al');
    nestedProfile.life[forbidden] = {private: true};
    await assertFails(setDoc(doc(al, 'couples/test-space/profiles/al'), {payload: nestedProfile, updatedBy: 'al'}));
  }
});

test('an expired invite cannot be read or consumed and a forged join does not grant membership', async () => {
  const al = client('al');
  const outsider = client('outsider');
  await createSpace(al);
  await assertFails(setDoc(doc(outsider, 'couples/test-space/members/outsider'), {...member('outsider'), role: 'member', inviteCode: '123456'}));
  await assertFails(updateDoc(doc(outsider, 'couples/test-space'), {memberCount: 2, lastJoinCode: '123456', lastJoinUid: 'outsider'}));
  await environment.withSecurityRulesDisabled(async context => updateDoc(doc(context.firestore(), 'pairInvites/123456'), {expiresAt: Timestamp.fromMillis(Date.now() - 60000)}));
  await assertFails(getDoc(doc(outsider, 'pairInvites/123456')));
  await assertFails(updateDoc(doc(outsider, 'pairInvites/123456'), {used: true, usedByUid: 'outsider', usedAt: serverTimestamp()}));
});

test('the creator cannot consume their own invitation as the second person', async () => {
  const al = client('al');
  await createSpace(al);
  const batch = writeBatch(al);
  batch.update(doc(al, 'pairInvites/123456'), {used: true, usedByUid: 'al', usedAt: serverTimestamp()});
  batch.update(doc(al, 'couples/test-space'), {memberCount: 2, lastJoinCode: '123456', lastJoinUid: 'al'});
  batch.set(doc(al, 'couples/test-space/members/al'), {...member('al'), role: 'member', inviteCode: '123456'});
  await assertFails(batch.commit());
  assert.equal((await getDoc(doc(al, 'couples/test-space'))).data().memberCount, 1);
});

test('disconnect removes the leaving member access while preserving the other member data', async () => {
  const {al, yashika} = await paired();
  await setDoc(doc(al, 'couples/test-space/profiles/al'), {payload: profile('Al'), updatedBy: 'al'});
  await assertSucceeds(runTransaction(yashika, async transaction => {
    const coupleRef = doc(yashika, 'couples/test-space');
    const snapshot = await transaction.get(coupleRef);
    transaction.delete(doc(yashika, 'couples/test-space/members/yashika'));
    transaction.update(coupleRef, {memberCount: snapshot.data().memberCount - 1, lastLeaveUid: 'yashika', lastLeaveAt: serverTimestamp()});
    transaction.update(doc(yashika, 'users/yashika'), {coupleId: deleteField()});
  }));
  assert.equal((await getDoc(doc(al, 'couples/test-space'))).data().memberCount, 1);
  assert.equal((await getDoc(doc(al, 'couples/test-space/profiles/al'))).data().payload.name, 'Al');
  await assertSucceeds(getDoc(sharedRef(al)));
  await assertFails(getDoc(sharedRef(yashika)));
});

test('decrementing the member count without leaving cannot reopen a two-member space', async () => {
  const {al} = await paired();
  await assertFails(updateDoc(doc(al, 'couples/test-space'), {memberCount: 1, lastLeaveUid: 'al', lastLeaveAt: serverTimestamp()}));
  assert.equal((await getDoc(doc(al, 'couples/test-space'))).data().memberCount, 2);
  assert.equal((await getDocs(collection(al, 'couples/test-space/members'))).size, 2);
});

test('signed-out clients cannot probe invites and arbitrary signed-in clients cannot list couples', async () => {
  const {al} = await paired();
  const signedOut = environment.unauthenticatedContext().firestore();
  assert.equal((await getDoc(doc(al, 'pairInvites/654321'))).exists(), false);
  await assertFails(getDoc(doc(signedOut, 'pairInvites/654321')));
  await assertFails(getDoc(doc(signedOut, 'couples/test-space')));
  await assertFails(getDocs(collection(client('outsider'), 'couples')));
  await assertFails(getDocs(collection(al, 'couples')));
});
