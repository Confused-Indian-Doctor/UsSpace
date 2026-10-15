import {delay, messagingRetryable, retryDatabase, retryDelay} from './delivery-retry.mjs';
import {typedIntents} from './outbox-policy.mjs';
import {detectChanges, messageData, notificationAllowed, permanentTokenError, recipientFor, safeId, sourceDigest, stableId, validDevice} from './policy.mjs';

const DOCUMENTS = Object.freeze({common: ['shared', 'common'], profile: ['profiles'], jar: ['usJar'],
  letter: ['usLetters'], bucket: ['usBucket'], ping: ['usPings'], work: ['workSummaries']});
const existsData = snapshot => snapshot?.exists ? snapshot.data() : null;
const serverOnlyCollection = '_pushDeliveries';

export function makeDispatcher({db, messaging, logger, serverTimestamp, now = () => new Date(), sendAttempts = 1, sleep = delay, urgentCategories = [], retryFailedDeliveries = false}) {
  async function dispatch({kind, coupleId, itemId, eventId, before, after, authId = ''}, persisted = null) {
    const report = {sent: 0, failed: 0, retryable: 0};
    if (!safeId(coupleId) || !safeId(itemId) || !DOCUMENTS[kind] || !eventId) return report;
    const maximumAttempts = Math.max(1, Math.min(3, Number.isInteger(sendAttempts) ? sendAttempts : 1));
    const createdAt = now(), capturedDigest = sourceDigest(after);
    const intents = persisted || detectChanges(kind, before, after, createdAt);
    if (!intents.length) return report;
    const roomRef = db.doc(`couples/${coupleId}`);
    const sourceRef = roomRef.collection(DOCUMENTS[kind][0]).doc(itemId);
    const [room, membersSnapshot] = await Promise.all([roomRef.get(), roomRef.collection('members').limit(3).get()]);
    const members = membersSnapshot.docs.map(snapshot => ({uid: snapshot.id}));
    if (!room.exists || members.length !== 2 || room.data().memberCount !== 2) return report;
    for (const intent of intents) {
      if (authId && authId !== intent.actorUid) continue;
      if (kind === 'profile' && itemId !== intent.actorUid) continue;
      if (kind === 'work' && (itemId !== intent.actorUid || after.coupleId !== coupleId)) continue;
      const accounts = Object.fromEntries(await Promise.all(members.map(async member => [member.uid, existsData(await db.doc(`users/${member.uid}`).get())])));
      const recipientUid = recipientFor(intent, coupleId, room.data(), members, accounts);
      if (!recipientUid) continue;
      const recipientRef = db.doc(`users/${recipientUid}`);
      const preferenceRef = recipientRef.collection('preferences').doc('v014');
      const preferences = existsData(await preferenceRef.get());
      if (!notificationAllowed(preferences, intent.category, now())) continue;
      const devices = await recipientRef.collection('devices').where('enabled', '==', true).limit(20).get();
      for (const snapshot of devices.docs) {
        if (!validDevice(snapshot.data(), recipientUid, snapshot.id)) continue;
        const deliveryId = stableId(coupleId, kind, itemId, capturedDigest, intent.category, recipientUid, snapshot.id);
        const deliveryRef = db.collection(serverOnlyCollection).doc(deliveryId);
        const actorRef = db.doc(`users/${intent.actorUid}`), deviceRef = snapshot.ref;
        const actorMemberRef = roomRef.collection('members').doc(intent.actorUid);
        const recipientMemberRef = roomRef.collection('members').doc(recipientUid);
        const roleRef = roomRef.collection('usRoles').doc('identity');
        // Claim before FCM so concurrent requests never both send. Only an explicit
        // known-rejected relay receipt can be reclaimed; ambiguous outcomes remain
        // at-most-once (FCM itself provides no exactly-once send).
        const claim = await db.runTransaction(async transaction => {
          const references = [deliveryRef, sourceRef, roomRef, actorMemberRef, recipientMemberRef,
            actorRef, recipientRef, preferenceRef, deviceRef];
          if (kind === 'letter') references.push(roleRef);
          const reads = await Promise.all(references.map(reference => transaction.get(reference)));
          const previous = existsData(reads[0]);
          if (previous) {
            if (!retryFailedDeliveries || !['retryable', 'claimed'].includes(previous.status)) return {state: 'done'};
            if (previous.status === 'claimed' || previous.retryAfter > now().getTime()) return {state: 'pending'};
            if (!Number.isInteger(previous.claimCount) || previous.claimCount >= 3) return {state: 'done'};
          }
          if (!reads[1].exists || sourceDigest(reads[1].data()) !== capturedDigest
            || !reads[2].exists || !reads[3].exists || !reads[4].exists) return {state: 'revoked'};
          const currentAccounts = {[intent.actorUid]: existsData(reads[5]), [recipientUid]: existsData(reads[6])};
          if (recipientFor(intent, coupleId, reads[2].data(), members, currentAccounts) !== recipientUid
            || !notificationAllowed(existsData(reads[7]), intent.category, now())
            || !validDevice(existsData(reads[8]), recipientUid, snapshot.id)) return {state: 'revoked'};
          if (kind === 'letter') {
            const roles = existsData(reads[9]);
            if (!roles || roles.alUid !== intent.actorUid || roles.yashikaUid !== recipientUid) return {state: 'revoked'};
          }
          const claimCount = previous ? previous.claimCount + 1 : 1;
          const receipt = {eventId: deliveryId, recipientUid, coupleId, category: intent.category,
            installationId: snapshot.id, status: 'claimed', claimCount, at: serverTimestamp()};
          if (previous) transaction.update(deliveryRef, receipt); else transaction.create(deliveryRef, receipt);
          return {state: 'claimed', token: reads[8].data().token, claimCount};
        });
        if (claim.state === 'pending') {report.retryable++; continue;}
        if (claim.state !== 'claimed') continue;
        const token = claim.token;
        // A preference or membership can be revoked during retry backoff. Read the
        // same live privacy guards before every attempt, not just the first send.
        const envelopeEvent = stableId(coupleId, kind, itemId, capturedDigest, intent.category, recipientUid);
        for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
          const current = await retryDatabase(() => Promise.all([
            deviceRef.get(), recipientRef.get(), preferenceRef.get(), sourceRef.get(), recipientMemberRef.get(), actorMemberRef.get(),
            actorRef.get(), roomRef.get(), kind === 'letter' ? roleRef.get() : Promise.resolve(null)]), {sleep});
          const [deviceNow, userNow, preferenceNow, sourceNow, recipientMemberNow, actorMemberNow, actorNow, roomNow, rolesNow] = current;
          const currentRoles = existsData(rolesNow);
          if (!validDevice(existsData(deviceNow), recipientUid, snapshot.id) || deviceNow.data().token !== token
            || existsData(userNow)?.coupleId !== coupleId || existsData(actorNow)?.coupleId !== coupleId
            || existsData(roomNow)?.memberCount !== 2 || !recipientMemberNow.exists || !actorMemberNow.exists
            || (kind === 'letter' && (currentRoles?.alUid !== intent.actorUid || currentRoles?.yashikaUid !== recipientUid))
            || !notificationAllowed(existsData(preferenceNow), intent.category, now())
            || !sourceNow.exists || sourceDigest(sourceNow.data()) !== capturedDigest) {
            await deliveryRef.update({status: 'revoked'}); break;
          }
          try {
            await messaging.send({token, data: messageData(intent, coupleId, recipientUid, envelopeEvent, now()),
              android: {priority: urgentCategories.includes(intent.category) && ['pings', 'notes'].includes(intent.category) ? 'high' : 'normal', ttl: 15 * 60 * 1000, collapseKey: `usspace_${intent.category}`}});
          } catch (error) {
            const invalid = permanentTokenError(error?.code);
            if (!invalid && messagingRetryable(error) && attempt < maximumAttempts) {
              // A deterministic event ID also lets Android suppress a transport duplicate.
              await sleep(retryDelay(attempt, /quota|rate/.test(error.code)));
              continue;
            }
            // Token values and source contents never enter logs or receipts.
            if (invalid) await db.runTransaction(async transaction => {
              const current = await transaction.get(deviceRef);
              if (current.exists && current.data().token === token && current.data().uid === recipientUid) transaction.delete(deviceRef);
            });
            const retryLater = retryFailedDeliveries && !invalid && messagingRetryable(error) && claim.claimCount < 3;
            await deliveryRef.update({status: invalid ? 'invalid-token' : retryLater ? 'retryable' : 'send-failed',
              ...(retryLater ? {retryAfter: now().getTime() + 30000} : {})});
            if (retryLater) report.retryable++; else report.failed++;
            logger?.warn('UsSpace generic push was not sent', {category: intent.category, permanent: invalid});
            break;
          }
          // Receipt persistence is separate from FCM send. A failed receipt write
          // must never run messaging.send again after it already returned success.
          await retryDatabase(() => deliveryRef.update({status: 'sent', sentAt: serverTimestamp()}), {sleep});
          report.sent++;
          break;
        }
      }
    }
    return report;
  }
  return {
    deliver: event => dispatch(event),
    // Only a server adapter that verified an immutable, atomic outbox calls this.
    // Categories resolve to fixed routes; no arbitrary message or recipient input.
    deliverPersisted: event => {
      const intents = typedIntents(event.kind, event.categories, event.authId, event.after);
      return intents.length ? dispatch(event, intents) : Promise.resolve({sent: 0, failed: 0, retryable: 0});
    },
  };
}
