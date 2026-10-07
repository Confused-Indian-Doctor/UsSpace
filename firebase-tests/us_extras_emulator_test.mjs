import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {after, before, beforeEach, test} from 'node:test';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch} from 'firebase/firestore';

const projectId = 'demo-usspace';
const cid = 'extras-space';
const time = '2026-10-07T12:00:00Z';
let environment;
before(async () => {
  assert.equal(process.env.GCLOUD_PROJECT || projectId, projectId);
  environment = await initializeTestEnvironment({projectId, firestore: {
    host: '127.0.0.1', port: 8080, rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  }});
});
beforeEach(async () => environment.clearFirestore());
after(async () => environment?.cleanup());
const client = uid => environment.authenticatedContext(uid, {email: `${uid}@example.test`}).firestore();
const ref = (db, kind, id) => doc(db, `couples/${cid}/${kind}/${id}`);
const roleRef = db => ref(db, 'usRoles', 'identity');
const draftRef = (db, uid = 'al', category = 'sad') => doc(db, `users/${uid}/usLetterDrafts/${cid}_${category}`);
const receiptRef = (db, uid = 'al', op = 'op-1') => doc(db, `users/${uid}/usReceipts/${cid}_${op}`);
const bucket = (id = 'dream-1') => ({id, title: 'Watch a sunset together', category: 'Date', location: 'By the sea',
  targetDate: '', suggestedBy: 'al', suggestedName: 'Al', priority: 'Normal', notes: 'Bring tea', photoId: '',
  state: 'Dreaming', completedDate: '', completedPhotoId: '', createdAt: time, updatedAt: time, updatedBy: 'al'});
const jar = (id = 'note-1') => ({id, text: 'Thank you for making ordinary days warmer.', authorUid: 'al', authorName: 'Al', createdAt: time});
const photo = (id = 'photo-1') => ({id, ownerUid: 'al', data: 'data:image/jpeg;base64,/9j/AAAA', createdAt: time});
const draft = (category = 'sad') => ({id: `${cid}_${category}`, coupleId: cid, category, title: 'Open when you feel sad', body: 'DRAFT_SECRET: rest with me for a while.', updatedAt: time});
const letter = (category = 'sad') => ({id: category, category, title: 'Open when you feel sad', body: 'You are loved on your low days.', authorUid: 'al', recipientUid: 'yashika', publishedAt: time});
const receipt = (op = 'op-1', kind = 'bucket', itemId = 'dream-1') => ({operationId: op, coupleId: cid, kind, itemId, at: serverTimestamp()});

async function createSpace() {
  const al = client('al');
  const batch = writeBatch(al);
  batch.set(doc(al, `couples/${cid}`), {ownerUid: 'al', memberCount: 1});
  batch.set(doc(al, `couples/${cid}/members/al`), {uid: 'al', name: 'Al'});
  batch.set(doc(al, 'pairInvites/579246'), {coupleId: cid, creatorUid: 'al', expiresAt: Timestamp.fromMillis(Date.now() + 900000), used: false});
  batch.set(doc(al, 'users/al'), {coupleId: cid});
  await assertSucceeds(batch.commit());
  return al;
}
async function paired({roles = true} = {}) {
  const al = await createSpace();
  const yashika = client('yashika');
  await assertSucceeds(runTransaction(yashika, async transaction => {
    const invite = doc(yashika, 'pairInvites/579246');
    await transaction.get(invite);
    await transaction.get(doc(yashika, `couples/${cid}`));
    transaction.update(invite, {used: true, usedByUid: 'yashika', usedAt: serverTimestamp()});
    transaction.update(doc(yashika, `couples/${cid}`), {memberCount: 2, lastJoinUid: 'yashika', lastJoinCode: '579246'});
    transaction.set(doc(yashika, `couples/${cid}/members/yashika`), {uid: 'yashika', name: 'Yashika', inviteCode: '579246'});
    transaction.set(doc(yashika, 'users/yashika'), {coupleId: cid});
  }));
  if (roles) await assertSucceeds(setDoc(roleRef(al), {alUid: 'al', yashikaUid: 'yashika'}));
  return {al, yashika};
}
async function leave(db, uid) {
  await assertSucceeds(runTransaction(db, async transaction => {
    const coupleRef = doc(db, `couples/${cid}`);
    const room = await transaction.get(coupleRef);
    transaction.delete(doc(db, `couples/${cid}/members/${uid}`));
    transaction.update(coupleRef, {memberCount: room.data().memberCount - 1, lastLeaveUid: uid, lastLeaveAt: serverTimestamp()});
  }));
}
function serverUpdate(reference, predicate) {
  let stop;
  let timer;
  const promise = new Promise((resolve, reject) => {
    timer = setTimeout(() => {stop?.(); reject(new Error('Us feature server update timed out'));}, 15000);
    stop = onSnapshot(reference, {includeMetadataChanges: true}, snapshot => {
      if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites && predicate(snapshot)) {
        clearTimeout(timer); stop?.(); resolve(snapshot);
      }
    }, error => {clearTimeout(timer); stop?.(); reject(error);});
  });
  return {promise, cancel: () => {clearTimeout(timer); stop?.();}};
}

test('roles bind distinct current members once and cannot be reassigned or forged', async () => {
  const al = await createSpace();
  await assertFails(setDoc(roleRef(al), {alUid: 'al', yashikaUid: 'al'}));
  await assertFails(setDoc(roleRef(al), {alUid: 'al', yashikaUid: 'third'}));
  // Clean fixture using the same authenticated creator/invite/join sequence.
  await environment.clearFirestore();
  const p = await paired({roles: false});
  await assertFails(setDoc(roleRef(p.al), {alUid: 'al', yashikaUid: 'al'}));
  await assertFails(setDoc(roleRef(p.al), {alUid: 'al', yashikaUid: 'third'}));
  await assertFails(setDoc(roleRef(client('third')), {alUid: 'al', yashikaUid: 'yashika'}));
  await assertFails(setDoc(roleRef(p.al), {alUid: 'al', yashikaUid: 'yashika', mood: 'private'}));
  await assertSucceeds(setDoc(roleRef(p.yashika), {alUid: 'al', yashikaUid: 'yashika'}));
  await assertFails(updateDoc(roleRef(p.al), {alUid: 'yashika', yashikaUid: 'al'}));
  await assertFails(deleteDoc(roleRef(p.al)));
  assert.equal((await getDoc(roleRef(p.yashika))).data().yashikaUid, 'yashika');
});

test('anonymous, unpaired and third accounts cannot read or write shared Us feature collections', async () => {
  const {al} = await paired();
  await setDoc(ref(al, 'usBucket', 'dream-1'), bucket());
  await setDoc(ref(al, 'usJar', 'note-1'), jar());
  await setDoc(ref(al, 'usPhotos', 'photo-1'), photo());
  await setDoc(ref(al, 'usLetters', 'sad'), letter());
  for (const outsider of [environment.unauthenticatedContext().firestore(), client('unpaired'), client('third')]) {
    for (const [kind, id] of [['usRoles', 'identity'], ['usBucket', 'dream-1'], ['usJar', 'note-1'], ['usPhotos', 'photo-1'], ['usLetters', 'sad']]) {
      await assertFails(getDoc(ref(outsider, kind, id)));
      await assertFails(getDocs(collection(outsider, `couples/${cid}/${kind}`)));
    }
    await assertFails(setDoc(ref(outsider, 'usBucket', 'intruder'), {...bucket('intruder'), suggestedBy: 'third', updatedBy: 'third'}));
    await assertFails(setDoc(ref(outsider, 'usJar', 'intruder'), {...jar('intruder'), authorUid: 'third'}));
    await assertFails(setDoc(ref(outsider, 'usLetters', 'sad'), letter()));
    await assertFails(setDoc(ref(outsider, 'usPhotos', 'intruder'), {...photo('intruder'), ownerUid: 'third'}));
  }
});

test('draft bodies remain account-private, are editable and never publish on save', async () => {
  const {al, yashika} = await paired();
  await assertSucceeds(getDoc(draftRef(al)));
  await assertSucceeds(setDoc(draftRef(al), draft()));
  await assertSucceeds(updateDoc(draftRef(al), {body: 'DRAFT_SECRET: revised lovingly.'}));
  assert.match((await getDoc(draftRef(al))).data().body, /DRAFT_SECRET/);
  await assertFails(getDoc(draftRef(yashika)));
  await assertFails(getDocs(collection(yashika, 'users/al/usLetterDrafts')));
  await assertFails(setDoc(draftRef(yashika), draft()));
  await assertFails(getDoc(draftRef(environment.unauthenticatedContext().firestore())));
  assert.equal((await getDoc(ref(al, 'usLetters', 'sad'))).exists(), false);
  const own = await getDocs(collection(al, 'users/al/usLetterDrafts'));
  assert.equal(own.size, 1);
  await leave(al, 'al');
  await assertSucceeds(getDoc(draftRef(al)));
  await assertSucceeds(updateDoc(draftRef(al), {body: 'Still private after disconnect.'}));
});

test('draft schema rejects oversized, mismatched and nested private-field additions', async () => {
  const {al} = await paired();
  for (const invalid of [{...draft(), body: 'x'.repeat(12001)}, {...draft(), title: 'x'.repeat(201)},
    {...draft(), category: 'unknown'}, {...draft(), coupleId: 'other-space'}, {...draft(), id: 'wrong'},
    {...draft(), mood: 'Sad'}, {...draft(), extra: {health: {note: 'PRIVATE'}}}, {...draft(), body: {text: 'PRIVATE'}}]) {
    await assertFails(setDoc(draftRef(al), invalid));
  }
  await assertSucceeds(setDoc(draftRef(al), draft()));
});

test('only role-bound Al explicitly publishes to role-bound Yashika; author can revise', async () => {
  const {al, yashika} = await paired();
  await assertSucceeds(getDoc(ref(al, 'usLetters', 'sad'))); // native publication transaction's missing read
  await assertFails(getDoc(ref(yashika, 'usLetters', 'sad')));
  await assertFails(setDoc(ref(yashika, 'usLetters', 'sad'), {...letter(), authorUid: 'yashika', recipientUid: 'al'}));
  await assertFails(setDoc(ref(al, 'usLetters', 'sad'), {...letter(), recipientUid: 'al'}));
  await assertFails(setDoc(ref(al, 'usLetters', 'sad'), {...letter(), recipientUid: 'third'}));
  await assertSucceeds(runTransaction(al, async transaction => {
    await transaction.get(receiptRef(al, 'al', 'publish-1'));
    await transaction.get(ref(al, 'usLetters', 'sad'));
    transaction.set(ref(al, 'usLetters', 'sad'), letter());
    transaction.set(receiptRef(al, 'al', 'publish-1'), receipt('publish-1', 'letter', 'sad'));
  }));
  assert.equal((await getDoc(ref(yashika, 'usLetters', 'sad'))).data().body, letter().body);
  await assertSucceeds(updateDoc(ref(al, 'usLetters', 'sad'), {body: 'Rest first; we can figure the rest out later.'}));
  await assertFails(updateDoc(ref(yashika, 'usLetters', 'sad'), {body: 'Replacing the author.'}));
  await assertFails(deleteDoc(ref(al, 'usLetters', 'sad')));
});

test('letters require scoped author or recipient queries; broad and wrong-identity queries fail', async () => {
  const {al, yashika} = await paired();
  await setDoc(ref(al, 'usLetters', 'sad'), letter());
  await setDoc(ref(al, 'usLetters', 'miss'), letter('miss'));
  const letters = db => collection(db, `couples/${cid}/usLetters`);
  assert.equal((await assertSucceeds(getDocs(query(letters(al), where('authorUid', '==', 'al'))))).size, 2);
  assert.equal((await assertSucceeds(getDocs(query(letters(yashika), where('recipientUid', '==', 'yashika'))))).size, 2);
  await assertFails(getDocs(letters(al)));
  await assertFails(getDocs(letters(yashika)));
  await assertFails(getDocs(query(letters(yashika), where('authorUid', '==', 'al'))));
  await assertFails(getDocs(query(letters(al), where('recipientUid', '==', 'yashika'))));
  await assertFails(getDocs(query(letters(client('third')), where('recipientUid', '==', 'yashika'))));
});

test('unconfigured roles and unknown, oversized or nested letter fields prevent publication', async () => {
  const {al} = await paired({roles: false});
  await assertFails(setDoc(ref(al, 'usLetters', 'sad'), letter()));
  await setDoc(roleRef(al), {alUid: 'al', yashikaUid: 'yashika'});
  for (const invalid of [{...letter(), id: 'miss'}, {...letter(), category: 'miss'}, {...letter(), title: 'x'.repeat(201)},
    {...letter(), body: 'x'.repeat(12001)}, {...letter(), body: ''}, {...letter(), mood: 'Sad'},
    {...letter(), nested: {cycle: 'PRIVATE'}}, {...letter(), body: {text: 'PRIVATE'}}]) {
    await assertFails(setDoc(ref(al, 'usLetters', 'sad'), invalid));
  }
  await assertFails(setDoc(ref(al, 'usLetters', 'other'), letter('other')));
});

test('a shared appreciation reaches the other client without sharing private drafts or mood', async () => {
  const {al, yashika} = await paired();
  await setDoc(draftRef(al), draft());
  const waiting = serverUpdate(ref(yashika, 'usJar', 'note-1'), snapshot => snapshot.exists());
  try {
    await assertSucceeds(setDoc(ref(al, 'usJar', 'note-1'), jar()));
    const delivered = (await waiting.promise).data();
    assert.deepEqual(delivered, jar());
    assert.doesNotMatch(JSON.stringify(delivered), /DRAFT_SECRET|mood|health|cycle/);
  } finally {waiting.cancel();}
});

test('jar author can revise their note; partner cannot impersonate, edit or delete it', async () => {
  const {al, yashika} = await paired();
  await assertSucceeds(setDoc(ref(al, 'usJar', 'note-1'), jar()));
  await assertSucceeds(updateDoc(ref(al, 'usJar', 'note-1'), {text: 'I appreciate your patience.'}));
  await assertFails(setDoc(ref(yashika, 'usJar', 'forged'), jar('forged')));
  await assertFails(updateDoc(ref(yashika, 'usJar', 'note-1'), {text: 'Changed by the wrong account.'}));
  await assertFails(updateDoc(ref(al, 'usJar', 'note-1'), {createdAt: '2026-10-08T12:00:00Z'}));
  await assertFails(updateDoc(ref(al, 'usJar', 'note-1'), {authorUid: 'yashika'}));
  await assertFails(deleteDoc(ref(yashika, 'usJar', 'note-1')));
  await assertSucceeds(setDoc(ref(yashika, 'usJar', 'her-note'), {...jar('her-note'), authorUid: 'yashika', authorName: 'Yashika'}));
  await assertSucceeds(deleteDoc(ref(al, 'usJar', 'note-1')));
});

test('each heart belongs to its authenticated account and cannot be written for the partner', async () => {
  const {al, yashika} = await paired();
  await setDoc(ref(al, 'usJar', 'note-1'), jar());
  const heart = (db, uid) => doc(db, `couples/${cid}/usJar/note-1/hearts/${uid}`);
  await assertSucceeds(setDoc(heart(yashika, 'yashika'), {uid: 'yashika', active: true, at: time}));
  assert.equal((await getDoc(heart(al, 'yashika'))).data().active, true);
  await assertSucceeds(updateDoc(heart(yashika, 'yashika'), {active: false}));
  await assertFails(setDoc(heart(al, 'yashika'), {uid: 'yashika', active: true, at: time}));
  await assertFails(setDoc(heart(al, 'al'), {uid: 'yashika', active: true, at: time}));
  await assertFails(setDoc(heart(al, 'al'), {uid: 'al', active: 'yes', at: time}));
  await assertFails(setDoc(heart(al, 'al'), {uid: 'al', active: true, at: time, mood: 'Sad'}));
  await assertFails(setDoc(doc(al, `couples/${cid}/usJar/missing/hearts/al`), {uid: 'al', active: true, at: time}));
  await assertFails(getDoc(heart(client('third'), 'yashika')));
});

test('bucket identity is immutable while either partner can plan, book and complete it', async () => {
  const {al, yashika} = await paired();
  await assertSucceeds(setDoc(ref(al, 'usBucket', 'dream-1'), bucket()));
  await assertSucceeds(updateDoc(ref(yashika, 'usBucket', 'dream-1'), {state: 'Planning', updatedBy: 'yashika'}));
  await assertSucceeds(updateDoc(ref(al, 'usBucket', 'dream-1'), {state: 'Booked', targetDate: '2026-10-20', updatedBy: 'al'}));
  await assertSucceeds(updateDoc(ref(yashika, 'usBucket', 'dream-1'), {state: 'Done', completedDate: '2026-10-20', completedPhotoId: 'sunset-1', updatedBy: 'yashika'}));
  const saved = (await getDoc(ref(al, 'usBucket', 'dream-1'))).data();
  assert.equal(saved.suggestedBy, 'al');
  assert.equal(saved.completedDate, '2026-10-20');
  await assertFails(updateDoc(ref(yashika, 'usBucket', 'dream-1'), {suggestedBy: 'yashika', updatedBy: 'yashika'}));
  await assertFails(updateDoc(ref(al, 'usBucket', 'dream-1'), {createdAt: '2026-10-08T12:00:00Z'}));
  await assertFails(updateDoc(ref(yashika, 'usBucket', 'dream-1'), {notes: 'Actor spoof', updatedBy: 'al'}));
  await assertFails(deleteDoc(ref(al, 'usBucket', 'dream-1')));
});

test('concurrent bucket merge transactions retain independent partner edits', async () => {
  const {al, yashika} = await paired();
  await setDoc(ref(al, 'usBucket', 'dream-1'), bucket());
  const merge = (db, uid, fields) => runTransaction(db, async transaction => {
    const target = ref(db, 'usBucket', 'dream-1');
    await transaction.get(target);
    transaction.update(target, {...fields, updatedBy: uid, updatedAt: time});
  });
  await Promise.all([merge(al, 'al', {location: 'Coastal cafe'}), merge(yashika, 'yashika', {priority: 'High', notes: 'Bring a camera'})]);
  const saved = (await getDoc(ref(al, 'usBucket', 'dream-1'))).data();
  assert.equal(saved.location, 'Coastal cafe');
  assert.equal(saved.priority, 'High');
  assert.equal(saved.notes, 'Bring a camera');
});

test('shared scalar schemas reject private fields, nested maps, invalid states and maximum overflows', async () => {
  const {al} = await paired();
  for (const key of ['mood', 'health', 'healthHistory', 'cycle', 'contacts', 'drafts', 'safetyHistory']) {
    await assertFails(setDoc(ref(al, 'usBucket', 'dream-1'), {...bucket(), [key]: {secret: 'PRIVATE'}}));
    await assertFails(setDoc(ref(al, 'usJar', 'note-1'), {...jar(), [key]: {secret: 'PRIVATE'}}));
    await assertFails(setDoc(ref(al, 'usPhotos', 'photo-1'), {...photo(), [key]: {secret: 'PRIVATE'}}));
  }
  for (const changes of [{title: 'x'.repeat(161)}, {notes: 'x'.repeat(4001)}, {location: 'x'.repeat(241)}, {title: {health: 'PRIVATE'}},
    {notes: {cycle: 'PRIVATE'}}, {category: 'Medical'}, {state: 'Unknown'}, {priority: 'Urgent'}, {targetDate: 'tomorrow'},
    {photoId: 'https://evil.test/a.jpg'}, {completedPhotoId: {url: 'https://evil.test'}}]) {
    await assertFails(setDoc(ref(al, 'usBucket', 'dream-1'), {...bucket(), ...changes}));
  }
  await assertFails(setDoc(ref(al, 'usJar', 'note-1'), {...jar(), text: 'x'.repeat(1501)}));
  await assertFails(setDoc(ref(al, 'usJar', 'note-1'), {...jar(), text: {body: 'PRIVATE'}}));
  await assertFails(setDoc(ref(al, 'usJar', 'note-1'), {...jar(), text: ''}));
  await assertFails(setDoc(ref(al, 'usBucket', 'dream-1'), {...bucket(), id: 'different'}));
});

test('photos are member-readable bounded JPEG data and owner-editable without ownership transfer', async () => {
  const {al, yashika} = await paired();
  await assertSucceeds(setDoc(ref(al, 'usPhotos', 'photo-1'), photo()));
  assert.equal((await getDoc(ref(yashika, 'usPhotos', 'photo-1'))).data().data, photo().data);
  await assertSucceeds(updateDoc(ref(al, 'usPhotos', 'photo-1'), {data: 'data:image/jpeg;base64,/9j/BBBB'}));
  await assertFails(updateDoc(ref(yashika, 'usPhotos', 'photo-1'), {data: 'data:image/jpeg;base64,/9j/CCCC'}));
  await assertFails(updateDoc(ref(al, 'usPhotos', 'photo-1'), {ownerUid: 'yashika'}));
  await assertFails(updateDoc(ref(al, 'usPhotos', 'photo-1'), {createdAt: '2026-10-08T12:00:00Z'}));
  for (const data of ['https://evil.test/photo.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AAAA',
    'data:image/jpeg;base64,<script>', 'data:image/jpeg;base64,' + 'A'.repeat(140000), {url: 'https://evil.test'}]) {
    await assertFails(setDoc(ref(al, 'usPhotos', 'bad-photo'), {...photo('bad-photo'), data}));
  }
  await assertFails(getDoc(ref(client('third'), 'usPhotos', 'photo-1')));
});

test('own immutable transaction receipts support absent reads and safe retry without duplicate mutation', async () => {
  const {al, yashika} = await paired();
  await assertSucceeds(getDoc(receiptRef(al)));
  let applied = 0;
  const apply = () => runTransaction(al, async transaction => {
    const previous = await transaction.get(receiptRef(al));
    if (previous.exists()) return false;
    transaction.set(ref(al, 'usJar', 'note-1'), jar());
    transaction.set(receiptRef(al), receipt('op-1', 'jar', 'note-1'));
    return true;
  });
  if (await assertSucceeds(apply())) applied++;
  if (await assertSucceeds(apply())) applied++;
  assert.equal(applied, 1);
  assert.equal((await getDocs(collection(al, `couples/${cid}/usJar`))).size, 1);
  await assertFails(getDoc(receiptRef(yashika)));
  await assertFails(getDoc(receiptRef(environment.unauthenticatedContext().firestore())));
  await assertFails(setDoc(receiptRef(al), receipt()));
  await assertFails(updateDoc(receiptRef(al), {kind: 'photo'}));
  await assertFails(deleteDoc(receiptRef(al)));
  await assertFails(setDoc(receiptRef(al, 'al', 'invalid-kind'), {...receipt('invalid-kind'), kind: 'mood'}));
  await assertFails(setDoc(receiptRef(al, 'al', 'nested'), {...receipt('nested'), nested: {health: 'PRIVATE'}}));
  await assertFails(setDoc(receiptRef(al, 'al', 'spoof-time'), {...receipt('spoof-time'), at: time}));
  await assertFails(setDoc(receiptRef(al, 'al', 'wrong-id'), receipt('different')));
  await assertFails(setDoc(receiptRef(client('third'), 'third', 'third-op'), receipt('third-op')));
});

test('disconnect immediately revokes all shared Us reads, writes and scoped letters for the former member', async () => {
  const {al, yashika} = await paired();
  await setDoc(ref(al, 'usBucket', 'dream-1'), bucket());
  await setDoc(ref(al, 'usJar', 'note-1'), jar());
  await setDoc(ref(al, 'usPhotos', 'photo-1'), photo());
  await setDoc(ref(al, 'usLetters', 'sad'), letter());
  await leave(yashika, 'yashika');
  for (const [kind, id] of [['usRoles', 'identity'], ['usBucket', 'dream-1'], ['usJar', 'note-1'], ['usPhotos', 'photo-1'], ['usLetters', 'sad']]) {
    await assertFails(getDoc(ref(yashika, kind, id)));
  }
  await assertFails(getDocs(query(collection(yashika, `couples/${cid}/usLetters`), where('recipientUid', '==', 'yashika'))));
  await assertFails(updateDoc(ref(yashika, 'usBucket', 'dream-1'), {notes: 'Former member', updatedBy: 'yashika'}));
  await assertFails(setDoc(receiptRef(yashika, 'yashika', 'left-op'), receipt('left-op')));
  await assertSucceeds(getDoc(ref(al, 'usBucket', 'dream-1')));
  // An immutable role cannot silently retarget a secret to a replacement partner.
  await assertFails(setDoc(ref(al, 'usLetters', 'sad'), letter()));
});
