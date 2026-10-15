import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {after, before, beforeEach, test} from 'node:test';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {collection, deleteDoc, disableNetwork, doc, enableNetwork, getDoc, getDocFromCache, getDocs,
  onSnapshot, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch} from 'firebase/firestore';

const projectId = 'demo-usspace', cid = 'v015-relationship-space';
let environment;
before(async () => {
  environment = await initializeTestEnvironment({projectId, firestore: {host: '127.0.0.1', port: 8080,
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')}});
});
beforeEach(async () => environment.clearFirestore());
after(async () => environment?.cleanup());
const client = uid => environment.authenticatedContext(uid, {email: `${uid}@example.test`}).firestore();
const ref = (db, space = cid, id = 'profile') => doc(db, `couples/${space}/relationship/${id}`);
const profile = (uid = 'al', startDate = '2023-03-25') => ({startDate, updatedBy: uid, updatedAt: serverTimestamp()});

async function pair() {
  const al = client('al'), yashika = client('yashika');
  const batch = writeBatch(al);
  batch.set(doc(al, `couples/${cid}`), {ownerUid: 'al', memberCount: 1});
  batch.set(doc(al, `couples/${cid}/members/al`), {uid: 'al', name: 'Al'});
  batch.set(doc(al, 'users/al'), {coupleId: cid});
  batch.set(doc(al, 'pairInvites/381627'), {creatorUid: 'al', coupleId: cid, expiresAt: Timestamp.fromMillis(Date.now() + 900000), used: false});
  await assertSucceeds(batch.commit());
  await assertSucceeds(runTransaction(yashika, async transaction => {
    const invite = doc(yashika, 'pairInvites/381627');
    await transaction.get(invite);
    await transaction.get(doc(yashika, `couples/${cid}`));
    transaction.update(invite, {used: true, usedByUid: 'yashika', usedAt: serverTimestamp()});
    transaction.update(doc(yashika, `couples/${cid}`), {memberCount: 2, lastJoinUid: 'yashika', lastJoinCode: '381627'});
    transaction.set(doc(yashika, `couples/${cid}/members/yashika`), {uid: 'yashika', inviteCode: '381627'});
    transaction.set(doc(yashika, 'users/yashika'), {coupleId: cid});
  }));
  return {al, yashika};
}

async function leave(db, uid) {
  await assertSucceeds(runTransaction(db, async transaction => {
    const room = doc(db, `couples/${cid}`), snapshot = await transaction.get(room);
    transaction.delete(doc(db, `couples/${cid}/members/${uid}`));
    transaction.update(room, {memberCount: snapshot.data().memberCount - 1, lastLeaveUid: uid, lastLeaveAt: serverTimestamp()});
    transaction.set(doc(db, `users/${uid}`), {coupleId: ''}, {merge: true});
  }));
}

function watchDate(db, baseline, expected) {
  let unsubscribe = () => {}, timer, readyResolve, changeResolve, readyReject, changeReject;
  let listening = false;
  const ready = new Promise((resolve, reject) => {readyResolve = resolve; readyReject = reject;});
  const changed = new Promise((resolve, reject) => {changeResolve = resolve; changeReject = reject;});
  // Attach handlers immediately so setup/write failures cannot leave an unhandled promise.
  ready.catch(() => {}); changed.catch(() => {});
  const fail = error => {clearTimeout(timer); unsubscribe(); readyReject(error); changeReject(error);};
  timer = setTimeout(() => fail(new Error(`No server listener baseline ${baseline}`)), 10000);
  unsubscribe = onSnapshot(ref(db), {includeMetadataChanges: true}, snapshot => {
    if (!snapshot.exists() || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    const value = snapshot.data();
    if (!listening && value.startDate === baseline) {
      listening = true; clearTimeout(timer); readyResolve(value);
      timer = setTimeout(() => fail(new Error(`No acknowledged partner date ${expected}`)), 10000);
    } else if (listening && value.startDate === expected) {
      clearTimeout(timer); unsubscribe(); changeResolve(value);
    }
  }, fail);
  return {ready, changed, close(){clearTimeout(timer); unsubscribe();}};
}

test('missing relationship document is readable and remains absent until an explicit save', async () => {
  const {al, yashika} = await pair();
  assert.equal((await assertSucceeds(getDoc(ref(al)))).exists(), false);
  assert.equal((await assertSucceeds(getDoc(ref(yashika)))).exists(), false);
  await assertSucceeds(setDoc(ref(al), profile()));
  assert.equal((await getDoc(ref(yashika))).data().startDate, '2023-03-25');
});

test('either current partner can edit the date and the other receives a server-acknowledged realtime update', async () => {
  const {al, yashika} = await pair();
  await assertSucceeds(setDoc(ref(al), profile()));
  const observed = watchDate(yashika, '2023-03-25', '2024-02-29');
  try {
    await observed.ready;
    await assertSucceeds(setDoc(ref(al), profile('al', '2024-02-29')));
    assert.equal((await observed.changed).updatedBy, 'al');
  } finally {observed.close();}
  const reverse = watchDate(al, '2024-02-29', '2022-12-31');
  try {
    await reverse.ready;
    await assertSucceeds(setDoc(ref(yashika), profile('yashika', '2022-12-31')));
    assert.equal((await reverse.changed).updatedBy, 'yashika');
  } finally {reverse.close();}
});

test('relationship date cannot be read or changed by guests, third accounts, or another couple', async () => {
  const {al} = await pair();
  await assertSucceeds(setDoc(ref(al), profile()));
  for (const outsider of [client('third'), environment.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(ref(outsider)));
    await assertFails(setDoc(ref(outsider), profile('third')));
    await assertFails(deleteDoc(ref(outsider)));
  }
  await assertFails(getDoc(ref(al, 'other-space')));
  await assertFails(setDoc(ref(al, 'other-space'), profile()));
});

test('strict Gregorian validation accepts leap years and bounded future dates', async () => {
  const {al} = await pair();
  for (const value of ['1900-01-01', '1900-02-28', '1996-02-29', '2000-02-29', '2024-02-29', '2096-02-29', '2100-03-01', '2200-12-31']) {
    await assertSucceeds(setDoc(ref(al), profile('al', value)));
    assert.equal((await getDoc(ref(al))).data().startDate, value);
  }
});

test('impossible dates, non-leap centuries, unsupported years and alternate formats are rejected', async () => {
  const {al} = await pair();
  for (const value of ['', '1899-12-31', '2201-01-01', '1900-02-29', '2100-02-29', '2200-02-29', '2023-02-29', '2024-02-30',
    '2026-04-31', '2026-06-31', '2026-09-31', '2026-11-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32',
    '25/03/2023', '2023-3-25', '2023-03-25T00:00:00Z', ' 2023-03-25', '2023-03-25 ', null, 20230325])
    await assertFails(setDoc(ref(al), profile('al', value)));
});

test('date writes reject actor impersonation, client timestamps, missing metadata and extra fields', async () => {
  const {al} = await pair();
  for (const patch of [{updatedBy: 'yashika'}, {updatedAt: Timestamp.fromMillis(0)}, {startDate: {value: '2023-03-25'}},
    {notes: 'PRIVATE'}, {payload: {}}, {health: {}}, {healthHistory: []}, {cycle: {}}, {mood: 'sad'}, {recipientUid: 'third'}])
    await assertFails(setDoc(ref(al), {...profile(), ...patch}));
  for (const missing of ['startDate', 'updatedBy', 'updatedAt']) {
    const data = profile(); delete data[missing]; await assertFails(setDoc(ref(al), data));
  }
  await assertSucceeds(setDoc(ref(al), profile()));
});

test('only the fixed profile document is writable and collection listing/deletion stays unavailable', async () => {
  const {al} = await pair();
  await assertSucceeds(setDoc(ref(al), profile()));
  await assertFails(getDocs(collection(al, `couples/${cid}/relationship`)));
  await assertFails(getDoc(ref(al, cid, 'other')));
  await assertFails(setDoc(ref(al, cid, 'other'), profile()));
  await assertFails(deleteDoc(ref(al)));
});

test('concurrent relationship and unrelated common edits do not overwrite each other', async () => {
  const {al, yashika} = await pair();
  const common = doc(al, `couples/${cid}/shared/common`);
  await assertSucceeds(setDoc(common, {payload: {notes: [{id: 'note-1', text: 'Keep this note'}], memories: [], goals: []}, updatedBy: 'al'}));
  await Promise.all([
    assertSucceeds(setDoc(ref(yashika), profile('yashika', '2020-02-29'))),
    assertSucceeds(updateDoc(common, {'payload.visit': '2026-12-25', updatedBy: 'al'}))
  ]);
  assert.equal((await getDoc(ref(al))).data().startDate, '2020-02-29');
  const data = (await getDoc(common)).data();
  assert.equal(data.payload.notes[0].text, 'Keep this note');
  assert.equal(data.payload.visit, '2026-12-25');
  assert.equal('startDate' in data.payload, false);
});

test('transactions can update a hydrated shared relationship without rewriting any unrelated document', async () => {
  const {al} = await pair();
  await assertSucceeds(setDoc(ref(al), profile()));
  await assertSucceeds(runTransaction(al, async transaction => {
    const current = await transaction.get(ref(al));
    assert.equal(current.data().startDate, '2023-03-25');
    transaction.set(ref(al), profile('al', '2023-04-01'));
  }));
  assert.equal((await getDoc(ref(al))).data().startDate, '2023-04-01');
});

test('a hydrated client retains offline date edits without server acknowledgement until reconnection', async () => {
  const {al} = await pair();
  await assertSucceeds(setDoc(ref(al), profile('al', '2024-02-29')));
  await getDoc(ref(al));
  await disableNetwork(al);
  let pendingWrite, acknowledged = false;
  try {
    const cached = await getDocFromCache(ref(al));
    assert.equal(cached.data().startDate, '2024-02-29');
    assert.equal(cached.metadata.fromCache, true);
    // Node transactions use a direct RPC even with streaming disabled. Exercise
    // the actual SDK offline write queue, not an assumed transaction rejection.
    pendingWrite = setDoc(ref(al), profile('al', '2025-03-25'));
    pendingWrite.then(() => { acknowledged = true; }, () => { acknowledged = true; });
    const queued = await getDocFromCache(ref(al));
    assert.equal(queued.data().startDate, '2025-03-25');
    assert.equal(queued.metadata.fromCache, true);
    assert.equal(queued.metadata.hasPendingWrites, true);
    await environment.withSecurityRulesDisabled(async context => {
      assert.equal((await getDoc(ref(context.firestore()))).data().startDate, '2024-02-29');
    });
    assert.equal(acknowledged, false, 'local cache must not claim server acknowledgement');
  } finally { await enableNetwork(al); }
  await assertSucceeds(pendingWrite);
  assert.equal((await getDoc(ref(al))).data().startDate, '2025-03-25');
  assert.equal(acknowledged, true);
});

test('unpairing revokes the date for both previous partners and denies delayed writes', async () => {
  const {al, yashika} = await pair();
  await assertSucceeds(setDoc(ref(al), profile()));
  await leave(yashika, 'yashika');
  for (const db of [al, yashika]) {
    await assertFails(getDoc(ref(db)));
    await assertFails(setDoc(ref(db), profile(db === al ? 'al' : 'yashika', '2025-03-25')));
  }
});

test('a leftover membership does not authorize a date after the account points to another couple', async () => {
  const {al} = await pair();
  await assertSucceeds(setDoc(ref(al), profile()));
  await assertSucceeds(updateDoc(doc(al, 'users/al'), {coupleId: 'new-space'}));
  await assertFails(getDoc(ref(al)));
  await assertFails(setDoc(ref(al), profile('al', '2025-03-25')));
});

test('the relationship document does not weaken private Health/Cycle or shared common allowlists', async () => {
  const {al} = await pair();
  await assertSucceeds(setDoc(ref(al), profile()));
  for (const sensitive of ['health', 'healthHistory', 'cycle']) {
    await assertFails(setDoc(doc(al, `couples/${cid}/shared/common`), {payload: {[sensitive]: {private: true}}, updatedBy: 'al'}));
    await assertFails(setDoc(ref(al), {...profile(), [sensitive]: {private: true}}));
  }
  await assertFails(setDoc(doc(al, `couples/${cid}/shared/common`), {payload: {startDate: '2023-03-25'}, updatedBy: 'al'}));
});
