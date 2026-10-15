// @ts-nocheck
// Generated from functions/src/outbox-policy.mjs; do not edit policy here.
import {usspacePushPolicy} from "./usspacePushPolicy";
import {usspacePushWorkerPolicy} from "./usspacePushWorkerPolicy";
export const usspacePushOutboxPolicy = (() => {
/* A typed outbox contains routing metadata only; contents stay in Firestore. */
const {safeId} = usspacePushPolicy;
const {timestampVersion} = usspacePushWorkerPolicy;
const OUTBOX_SOURCES = Object.freeze({
  common: {collection: 'shared', routes: {pings: 'home', notes: 'notes', goals: 'goals', memories: 'memories', calendar: 'calendar'}},
  profile: {collection: 'profiles', routes: {status: 'home'}},
  jar: {collection: 'usJar', routes: {notes: 'jar'}, receipt: true},
  letter: {collection: 'usLetters', routes: {notes: 'letters'}, receipt: true},
  bucket: {collection: 'usBucket', routes: {bucket: 'bucket'}, receipt: true},
  ping: {collection: 'usPings', routes: {pings: 'home'}},
  work: {collection: 'workSummaries', routes: {calendar: 'home'}},
});
function sameTimestamp(a, b) {return !!timestampVersion(a) && timestampVersion(a) === timestampVersion(b);}
function timestampMillis(value) {
  return timestampVersion(value) ? value.seconds * 1000 + value.nanoseconds / 1000000 : NaN;
}
function typedIntents(kind, categories, actorUid, after) {
  const source = Object.hasOwn(OUTBOX_SOURCES, kind) ? OUTBOX_SOURCES[kind] : null;
  if (!source || !safeId(actorUid) || !Array.isArray(categories) || !categories.length || categories.length > 5
    || new Set(categories).size !== categories.length || !categories.every(category => Object.hasOwn(source.routes, category))) return [];
  if (kind === 'letter' && (!safeId(after?.recipientUid) || after.recipientUid === actorUid)) return [];
  return categories.map(category => ({category, actorUid, route: source.routes[category],
    ...(kind === 'letter' ? {onlyRecipient: after.recipientUid} : {})}));
}
function validOutbox(event, eventId, actorUid) {
  const required = ['id', 'actorUid', 'sourceKind', 'sourceId', 'categories', 'createdAt'];
  if (!event || typeof event !== 'object' || Array.isArray(event) || !safeId(eventId) || eventId.length > 140
    || event.id !== eventId || event.actorUid !== actorUid || !safeId(actorUid) || !safeId(event.sourceId)
    || !required.every(key => Object.hasOwn(event, key))
    || !Object.keys(event).every(key => required.includes(key) || key === 'receiptId')
    || !timestampVersion(event.createdAt) || !Object.hasOwn(OUTBOX_SOURCES, event.sourceKind)) return false;
  const source = OUTBOX_SOURCES[event.sourceKind];
  if (!Array.isArray(event.categories) || !event.categories.length || event.categories.length > 5 || new Set(event.categories).size !== event.categories.length
    || !event.categories.every(category => Object.hasOwn(source.routes, category))) return false;
  if (event.sourceKind === 'common' && event.sourceId !== 'common') return false;
  if (['profile', 'work'].includes(event.sourceKind) && event.sourceId !== actorUid) return false;
  if (source.receipt) return typeof event.receiptId === 'string' && /^[A-Za-z0-9_-]{1,321}$/.test(event.receiptId);
  return !Object.hasOwn(event, 'receiptId');
}
function currentOutboxSource(event, snapshot, receipt, coupleId) {
  if (!snapshot?.exists || !sameTimestamp(snapshot.updateTime, event.createdAt)) return false;
  const after = snapshot.data(), actor = event.actorUid, kind = event.sourceKind;
  if (!after || typeof after !== 'object') return false;
  if (OUTBOX_SOURCES[kind]?.receipt) {
    if (!receipt || receipt.coupleId !== coupleId || receipt.kind !== kind || receipt.itemId !== event.sourceId
      || !safeId(receipt.operationId) || event.receiptId !== `${coupleId}_${receipt.operationId}`
      || !sameTimestamp(receipt.at, event.createdAt)) return false;
  }
  if (['common', 'profile'].includes(kind)) return after.updatedBy === actor && sameTimestamp(after.updatedAt, event.createdAt)
    && !!after.payload && typeof after.payload === 'object' && !Array.isArray(after.payload)
    && !['health', 'healthHistory', 'cycle'].some(key => Object.hasOwn(after.payload, key));
  if (kind === 'work') return after.uid === actor && after.coupleId === coupleId && after.enabled === true && sameTimestamp(after.updatedAt, event.createdAt);
  if (kind === 'ping') return after.senderUid === actor && sameTimestamp(after.createdAt, event.createdAt);
  if (kind === 'jar') return after.authorUid === actor && typeof after.text === 'string' && !!after.text.trim();
  if (kind === 'bucket') return after.updatedBy === actor;
  if (kind === 'letter') return after.authorUid === actor && safeId(after.recipientUid) && after.recipientUid !== actor
    && typeof after.body === 'string' && !!after.body.trim() && typeof after.publishedAt === 'string';
  return false;
}

return {OUTBOX_SOURCES, sameTimestamp, timestampMillis, typedIntents, validOutbox, currentOutboxSource};
})();
