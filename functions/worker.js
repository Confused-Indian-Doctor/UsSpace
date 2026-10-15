/* Optional Spark-compatible host. Server ADC credentials only; never run in Android. */
import {randomUUID} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {FieldValue, getFirestore, Timestamp} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';
import {makeDispatcher} from './src/dispatch.mjs';
import {createServer} from 'node:http';
import {makeWorkerChangeHandler} from './src/worker-handler.mjs';
import {retryDatabase} from './src/delivery-retry.mjs';

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
const dispatcher = makeDispatcher({db, messaging: getMessaging(), logger, sendAttempts: 3, urgentCategories: ['pings', 'notes'], serverTimestamp: () => FieldValue.serverTimestamp()});
let active = false, ending = false, leaseExpires = 0, queue = Promise.resolve();
const readyListeners = new Set();
let healthServer = null;

async function renewLease() {
  const currentTime = Date.now();
  const owned = await db.runTransaction(async transaction => {
    const current = await transaction.get(leaseRef), value = current.exists ? current.data() : null;
    if (value && value.owner !== owner && value.expiresAt?.toMillis() > currentTime) return false;
    transaction.set(leaseRef, {owner, expiresAt: Timestamp.fromMillis(currentTime + 60000), updatedAt: FieldValue.serverTimestamp()});
    return true;
  });
  if (owned) leaseExpires = currentTime + 60000;
  return owned;
}
const handleChange = makeWorkerChangeHandler({db, dispatcher, serverTimestamp: () => FieldValue.serverTimestamp(),
  isActive: () => active && !ending, renewLease, leaseLost: () => setImmediate(() => shutdown(8))});
function watch(collection, kind) {
  let first = true;
  const cache = new Map();
  const stop = db.collectionGroup(collection).onSnapshot(snapshot => {
    const initial = first; first = false; readyListeners.add(collection);
    for (const change of snapshot.docChanges()) {
      const path = change.doc.ref.path, previous = cache.get(path) || null;
      if (change.type === 'removed') cache.delete(path); else cache.set(path, change.doc.data());
      queue = queue.then(() => retryDatabase(() => handleChange(kind, change, previous, initial), {
        attempts: Infinity, stopped: () => ending,
        onRetry: () => logger.warn('UsSpace push worker database temporarily unavailable; retrying without logging personal content.')
      })).catch(() => {
        logger.warn('UsSpace push worker cannot process shared changes. Check server permissions and restart the trusted worker.');
        setImmediate(() => shutdown(8));
      });
    }
  }, () => {logger.warn('UsSpace push worker listener failed. Restart the trusted worker.'); shutdown(8);});
  stopListeners.push(stop);
}
async function shutdown(code = 0) {
  if (ending) return; ending = true;
  for (const stop of stopListeners) stop();
  clearInterval(renewal);
  healthServer?.close();
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
// Optional unauthenticated health probe returns no project, account or content.
// It accepts no send requests. A sleeping/free web host is not continuous delivery.
if (process.env.PORT) {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  healthServer = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/healthz') {response.writeHead(404); response.end(); return;}
    const healthy = active && !ending && readyListeners.size === 7 && leaseExpires > Date.now();
    response.writeHead(healthy ? 200 : 503, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    response.end(JSON.stringify({status: healthy ? 'ready' : 'not-ready'}));
  });
  healthServer.listen(port, '0.0.0.0');
}
process.on('SIGINT' , () => shutdown()); process.on('SIGTERM', () => shutdown());
console.info('UsSpace trusted push worker active. Initial data is a quiet baseline.');
