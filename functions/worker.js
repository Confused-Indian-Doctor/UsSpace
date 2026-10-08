/* Optional Spark-compatible host. Server ADC credentials only; never run in Android. */
import {randomUUID} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {FieldValue, getFirestore, Timestamp} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';
import {makeDispatcher} from './src/dispatch.mjs';
import {sourceDigest, stableId} from './src/policy.mjs';
import {timestampVersion, workerDecision} from './src/worker-policy.mjs';

const projectId = process.env.USSPACE_FIREBASE_PROJECT_ID || '';
if (process.env.USSPACE_PUSH_WORKER_ENABLE !== '1' || !/^[a-z][a-z0-9-]{4,62}$/.test(projectId)) {
  throw new Error('Set USSPACE_PUSH_WORKER_ENABLE=1 and USSPACE_FIREBASE_PROJECT_ID on the trusted server. No push worker was started.');
}
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('The live messaging worker must not connect demo/emulator identities to FCM.');
}
initializeApp({projectId}); // ADC from host identity or a host-only GOOGLE_APPLICATION_CREDENTIALS path.
const db = getFirestore(), owner = randomUUID(), stopListeners = [];
const leaseRef = db.doc('_pushWorkerLeases/v014');
const logger = {warn: (message, details) => console.warn(message, details || '')};
const dispatcher = makeDispatcher({db, messaging: getMessaging(), logger, serverTimestamp: () => FieldValue.serverTimestamp()});
let active = false, ending = false, queue = Promise.resolve();

async function renewLease() {
  const currentTime = Date.now();
  return db.runTransaction(async transaction => {
    const current = await transaction.get(leaseRef), value = current.exists ? current.data() : null;
    if (value && value.owner !== owner && value.expiresAt?.toMillis() > currentTime) return false;
    transaction.set(leaseRef, {owner, expiresAt: Timestamp.fromMillis(currentTime + 60000), updatedAt: FieldValue.serverTimestamp()});
    return true;
  });
}
async function saveCursor(reference, data, initial) {
  const version = timestampVersion(reference.updateTime);
  const cursor = db.doc(`_pushWorkerCursors/${stableId(reference.ref.path)}`);
  return db.runTransaction(async transaction => {
    const previous = await transaction.get(cursor);
    const decision = workerDecision({initial, version, previousVersion: previous.exists ? previous.data().version : ''});
    if (decision === 'drop') return decision;
    transaction.set(cursor, {version, digest: sourceDigest(data), seenAt: FieldValue.serverTimestamp()});
    return decision;
  });
}
async function handleChange(kind, change, before, initial) {
  if (!active || ending) return;
  const snapshot = change.doc, path = snapshot.ref.path.split('/');
  if (path.length !== 4 || path[0] !== 'couples') return;
  if (kind === 'common' && path[3] !== 'common') return;
  if (change.type === 'removed') return;
  const after = snapshot.data();
  if (await saveCursor(snapshot, after, initial) !== 'deliver') return;
  if (!active || ending) return;
  if (!await renewLease()) {setImmediate(() => shutdown(8)); return;}
  await dispatcher.deliver({kind, coupleId: path[1], itemId: path[3], before, after,
    eventId: `worker:${snapshot.ref.path}:${timestampVersion(snapshot.updateTime)}`});
}
function watch(collection, kind) {
  let first = true;
  const cache = new Map();
  const stop = db.collectionGroup(collection).onSnapshot(snapshot => {
    const initial = first; first = false;
    for (const change of snapshot.docChanges()) {
      const path = change.doc.ref.path, previous = cache.get(path) || null;
      if (change.type === 'removed') cache.delete(path); else cache.set(path, change.doc.data());
      queue = queue.then(() => handleChange(kind, change, previous, initial)).catch(() => {
        logger.warn('UsSpace push worker change failed; no personal content was logged.');
      });
    }
  }, () => {logger.warn('UsSpace push worker listener failed. Restart the trusted worker.'); shutdown(8);});
  stopListeners.push(stop);
}
async function shutdown(code = 0) {
  if (ending) return; ending = true;
  for (const stop of stopListeners) stop();
  clearInterval(renewal);
  await queue.catch(() => {});
  await db.runTransaction(async transaction => {
    const current = await transaction.get(leaseRef);
    if (current.exists && current.data().owner === owner) transaction.delete(leaseRef);
  }).catch(() => {});
  active = false; process.exitCode = code;
  await db.terminate();
}
active = await renewLease();
if (!active) throw new Error('Another trusted UsSpace worker already holds the dispatch lease.');
const renewal = setInterval(() => {
  if (!ending) renewLease().then(owned => {if (!owned) shutdown(8);}).catch(() => shutdown(8));
}, 20000);
for (const [collection, kind] of [['shared', 'common'], ['profiles', 'profile'], ['usJar', 'jar'],
  ['usLetters', 'letter'], ['usBucket', 'bucket'], ['usPings', 'ping'], ['workSummaries', 'work']]) watch(collection, kind);
process.on('SIGINT', () => shutdown()); process.on('SIGTERM', () => shutdown());
console.info('UsSpace trusted push worker active. Initial data is a quiet baseline.');
