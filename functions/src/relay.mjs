/* HTTPS transport adapter for Spark: no daemon, billing upgrade or scheduled job.
 * The host supplies Firebase Admin dependencies/credentials privately. */
import {makeDispatcher} from './dispatch.mjs';
import {databaseRetryable} from './delivery-retry.mjs';
import {OUTBOX_SOURCES, currentOutboxSource, sameTimestamp, timestampMillis, validOutbox} from './outbox-policy.mjs';
import {safeId} from './policy.mjs';
const consumed = outcome => ({status: 200, body: {consumed: true, outcome}});
const failure = (status, code, retryable = false) => ({status, body: {consumed: false, error: code, retryable}});
const data = snapshot => snapshot?.exists ? snapshot.data() : null;
export function makeOutboxRelay({db, auth, messaging, projectId, logger, serverTimestamp, now = () => new Date(), sleep}) {
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId || '')) throw new Error('A trusted Firebase project ID is required');
  const dispatcher = makeDispatcher({db, messaging, logger, serverTimestamp, now, sleep,
    sendAttempts: 1, retryFailedDeliveries: true, urgentCategories: ['pings', 'notes']});
  async function handle({method, authorization, body} = {}) {
    if (method !== 'POST') return failure(405, 'method-not-allowed');
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2
      || !Object.hasOwn(body, 'coupleId') || !Object.hasOwn(body, 'eventId')
      || !safeId(body.coupleId) || !safeId(body.eventId) || body.eventId.length > 140) return failure(400, 'invalid-request');
    const token = typeof authorization === 'string' && authorization.length <= 16384 ? /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization)?.[1] : '';
    if (!token) return failure(401, 'authentication-required');
    let decoded;
    try {decoded = await auth.verifyIdToken(token, true);} catch (error) {
      return ['auth/internal-error', 'app/network-error', 'app/network-timeout'].includes(error?.code)
        ? failure(503, 'authentication-unavailable', true) : failure(401, 'invalid-authentication');
    }
    if (!safeId(decoded?.uid) || decoded.aud !== projectId || decoded.iss !== `https://securetoken.google.com/${projectId}`)
      return failure(401, 'invalid-authentication');
    const {coupleId, eventId} = body, uid = decoded.uid;
    try {
      const roomRef = db.doc(`couples/${coupleId}`), actorRef = db.doc(`users/${uid}`);
      const [room, actor, membership, eventSnapshot, memberList] = await Promise.all([roomRef.get(), actorRef.get(),
        roomRef.collection('members').doc(uid).get(), roomRef.collection('pushOutbox').doc(eventId).get(),
        roomRef.collection('members').limit(3).get()]);
      if (!room.exists || data(room)?.memberCount !== 2 || data(actor)?.coupleId !== coupleId || !membership.exists
        || memberList.docs.length !== 2 || !memberList.docs.some(member => member.id === uid)) return failure(403, 'pairing-required');
      if (!eventSnapshot.exists) return failure(404, 'event-not-found');
      const event = eventSnapshot.data();
      if (!validOutbox(event, eventId, uid) || !sameTimestamp(eventSnapshot.updateTime, event.createdAt)) return failure(403, 'invalid-event');
      // Linearizable reads of both canonical users prevent an old/left pair from
      // becoming a recipient, even while its membership document is being removed.
      const members = await Promise.all(memberList.docs.map(member => db.doc(`users/${member.id}`).get()));
      if (!members.every(account => account.exists && account.data().coupleId === coupleId)) return failure(403, 'pairing-required');
      const age = now().getTime() - timestampMillis(event.createdAt);
      if (!Number.isFinite(age) || age < -60000) return failure(403, 'invalid-event-time');
      if (age > 15 * 60 * 1000) return consumed('suppressed');
      const source = OUTBOX_SOURCES[event.sourceKind], sourceRef = roomRef.collection(source.collection).doc(event.sourceId);
      const [sourceSnapshot, receiptSnapshot] = await Promise.all([sourceRef.get(), source.receipt
        ? actorRef.collection('usReceipts').doc(event.receiptId).get() : Promise.resolve(null)]);
      if (!currentOutboxSource(event, sourceSnapshot, data(receiptSnapshot), coupleId)) return consumed('suppressed');
      const result = await dispatcher.deliverPersisted({kind: event.sourceKind, coupleId, itemId: event.sourceId,
        eventId: `outbox:${coupleId}:${eventId}`, after: sourceSnapshot.data(), authId: uid, categories: event.categories});
      if (result.retryable) {
        const retry = failure(503, 'delivery-retry', true);
        retry.body.retryAfterSeconds = 30;
        return retry;
      }
      // "processed" means guards/dispatch ran, not a claim of device delivery.
      // Disabled preferences, retries and duplicate receipts can produce no alert.
      return consumed('processed');
    } catch (error) {
      logger?.warn('UsSpace push relay could not process an event; no personal data was logged.');
      return failure(databaseRetryable(error) ? 503 : 500, 'relay-unavailable', databaseRetryable(error));
    }
  }
  return {handle};
}
