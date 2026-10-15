/* Dependency-injected so the real Admin cursor ordering can be fault-tested. */
import {sourceDigest, stableId} from './policy.mjs';
import {timestampVersion, workerDecision} from './worker-policy.mjs';

export function makeWorkerChangeHandler({db, dispatcher, serverTimestamp, isActive,
  renewLease, leaseLost, now = () => Date.now()}) {
  async function cursorDecision(snapshot, after, initial, commit = false) {
    const version = timestampVersion(snapshot.updateTime);
    const cursor = db.doc(`_pushWorkerCursors/${stableId(snapshot.ref.path)}`);
    return db.runTransaction(async transaction => {
      const previous = await transaction.get(cursor);
      const decision = workerDecision({initial, version, now: now(), previousVersion: previous.exists ? previous.data().version : ''});
      if (decision !== 'drop' && (decision === 'baseline' || commit)) {
        transaction.set(cursor, {version, digest: sourceDigest(after), seenAt: serverTimestamp()});
      }
      return decision;
    });
  }
  return async function handleChange(kind, change, before, initial) {
    if (!isActive() || change.type === 'removed') return;
    const snapshot = change.doc, path = snapshot.ref.path.split('/');
    if (path.length !== 4 || path[0] !== 'couples' || (kind === 'common' && path[3] !== 'common')) return;
    const after = snapshot.data();
    if (await cursorDecision(snapshot, after, initial) !== 'deliver' || !isActive()) return;
    if (!await renewLease()) {leaseLost(); return;}
    await dispatcher.deliver({kind, coupleId: path[1], itemId: path[3], before, after,
      eventId: `worker:${snapshot.ref.path}:${timestampVersion(snapshot.updateTime)}`});
    // A failed Firestore read/claim must not consume the source cursor. Receipts
    // still deduplicate any devices already sent before a partial retry.
    await cursorDecision(snapshot, after, initial, true);
  };
}
