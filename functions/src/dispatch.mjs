import {detectChanges, messageData, notificationAllowed, permanentTokenError, recipientFor, safeId, sourceDigest, stableId, validDevice} from './policy.mjs';

const DOCUMENTS = Object.freeze({common: ['shared', 'common'], profile: ['profiles'], jar: ['usJar'],
  letter: ['usLetters'], bucket: ['usBucket'], ping: ['usPings'], work: ['workSummaries']});
const existsData = snapshot => snapshot?.exists ? snapshot.data() : null;
const serverOnlyCollection = '_pushDeliveries';

export function makeDispatcher({db, messaging, logger, serverTimestamp, now = () => new Date()}) {
  async function deliver({kind, coupleId, itemId, eventId, before, after, authId = ''}) {
    if (!safeId(coupleId) || !safeId(itemId) || !DOCUMENTS[kind] || !eventId) return;
    const createdAt = now(), capturedDigest = sourceDigest(after);
    const intents = detectChanges(kind, before, after, createdAt);
    if (!intents.length) return;
    const roomRef = db.doc(`couples/${coupleId}`);
    const sourceRef = roomRef.collection(DOCUMENTS[kind][0]).doc(itemId);
    const [room, membersSnapshot] = await Promise.all([roomRef.get(), roomRef.collection('members').limit(3).get()]);
    const members = membersSnapshot.docs.map(snapshot => ({uid: snapshot.id}));
    if (!room.exists || members.length !== 2 || room.data().memberCount !== 2) return;
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
        // Claim once before calling FCM. Retry redeliveries do not produce duplicate sends.
        // This is intentionally at-most-once (FCM itself provides no exactly-once send).
        const token = await db.runTransaction(async transaction => {
          const references = [deliveryRef, sourceRef, roomRef, actorMemberRef, recipientMemberRef,
            actorRef, recipientRef, preferenceRef, deviceRef];
          if (kind === 'letter') references.push(roleRef);
          const reads = await Promise.all(references.map(reference => transaction.get(reference)));
          if (reads[0].exists || !reads[1].exists || sourceDigest(reads[1].data()) !== capturedDigest
            || !reads[2].exists || !reads[3].exists || !reads[4].exists) return '';
          const currentAccounts = {[intent.actorUid]: existsData(reads[5]), [recipientUid]: existsData(reads[6])};
          if (recipientFor(intent, coupleId, reads[2].data(), members, currentAccounts) !== recipientUid
            || !notificationAllowed(existsData(reads[7]), intent.category, now())
            || !validDevice(existsData(reads[8]), recipientUid, snapshot.id)) return '';
          if (kind === 'letter') {
            const roles = existsData(reads[9]);
            if (!roles || roles.alUid !== intent.actorUid || roles.yashikaUid !== recipientUid) return '';
          }
          transaction.create(deliveryRef, {eventId: deliveryId, recipientUid, coupleId, category: intent.category,
            installationId: snapshot.id, status: 'claimed', at: serverTimestamp()});
          return reads[8].data().token;
        });
        if (!token) continue;
        // A token may be re-bound or a preference revoked while the claim commits.
        // Re-check the current binding immediately before send; Android checks it again.
        const [deviceNow, userNow, preferenceNow, sourceNow, recipientMemberNow, actorMemberNow, actorNow, roomNow, rolesNow] = await Promise.all([
          deviceRef.get(), recipientRef.get(), preferenceRef.get(), sourceRef.get(), recipientMemberRef.get(), actorMemberRef.get(),
          actorRef.get(), roomRef.get(), kind === 'letter' ? roleRef.get() : Promise.resolve(null)]);
        const currentRoles = existsData(rolesNow);
        if (!validDevice(existsData(deviceNow), recipientUid, snapshot.id) || deviceNow.data().token !== token
          || existsData(userNow)?.coupleId !== coupleId || existsData(actorNow)?.coupleId !== coupleId
          || existsData(roomNow)?.memberCount !== 2 || !recipientMemberNow.exists || !actorMemberNow.exists
          || (kind === 'letter' && (currentRoles?.alUid !== intent.actorUid || currentRoles?.yashikaUid !== recipientUid))
          || !notificationAllowed(existsData(preferenceNow), intent.category, now())
          || !sourceNow.exists || sourceDigest(sourceNow.data()) !== capturedDigest) {
          await deliveryRef.update({status: 'revoked'}); continue;
        }
        const envelopeEvent = stableId(coupleId, kind, itemId, capturedDigest, intent.category, recipientUid);
        try {
          await messaging.send({token, data: messageData(intent, coupleId, recipientUid, envelopeEvent, now()),
            android: {priority: 'normal', ttl: 15 * 60 * 1000, collapseKey: `usspace_${intent.category}`}});
          await deliveryRef.update({status: 'sent', sentAt: serverTimestamp()});
        } catch (error) {
          // Token values and user content must never be logged or put in a receipt.
          const invalid = permanentTokenError(error?.code);
          if (invalid) await db.runTransaction(async transaction => {
            const current = await transaction.get(deviceRef);
            if (current.exists && current.data().token === token && current.data().uid === recipientUid) transaction.delete(deviceRef);
          });
          await deliveryRef.update({status: invalid ? 'invalid-token' : 'send-failed'});
          logger?.warn('UsSpace generic push was not sent', {category: intent.category, permanent: invalid});
        }
      }
    }
  }
  return {deliver};
}
