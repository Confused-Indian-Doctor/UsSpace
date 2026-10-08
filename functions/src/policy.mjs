/* Deliberately never copies user text, health, mood, cycle or rota details into FCM. */
import {createHash} from 'node:crypto';
export const CATEGORIES = Object.freeze(['pings', 'notes', 'status', 'goals', 'bucket', 'memories', 'calendar']);
export const MESSAGES = Object.freeze({
  pings: 'A little love is waiting for you.', notes: 'There’s a new note in your space.',
  status: 'Your person updated their status.', goals: 'A shared goal has an update.',
  bucket: 'Your shared Bucket List has an update.', memories: 'There’s an update to your memories.',
  calendar: 'A shared plan or schedule has changed.',
});
const fields = Object.freeze({goals: ['title', 'value', 'target', 'unit', 'level'],
  memories: ['title', 'date', 'place', 'text', 'emoji', 'photoId'],
  duties: ['owner', 'date', 'type', 'time', 'title', 'place'],
  bucket: ['title', 'category', 'location', 'targetDate', 'priority', 'notes', 'photoId', 'state', 'completedDate', 'completedPhotoId'],
  work: ['date', 'start', 'end', 'timeZone']});
export const safeId = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(x);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const project = (value, keys) => Object.fromEntries(keys.map(key => [key, value?.[key] ?? null]));
const publicItem = item => item && typeof item === 'object' && !Array.isArray(item)
  && ['string', 'number'].includes(typeof item.id) && item.level !== 'Private'
  && item.private !== true && item.visibility !== 'private' && item.share !== false;
const itemMap = list => new Map((Array.isArray(list) ? list : []).filter(publicItem).slice(0, 500).map(item => [String(item.id), item]));
function changedList(before, after, keys, filter = () => true) {
  const prior = itemMap(before), next = itemMap(after);
  for (const [id, item] of next) if (filter(item) && (!prior.has(id) || !same(project(prior.get(id), keys), project(item, keys)))) return true;
  for (const [id, item] of prior) if (filter(item) && !next.has(id)) return true;
  return false;
}
function intent(category, actor, route, extra = {}) {
  return safeId(actor) ? {category, actorUid: actor, route, ...extra} : null;
}
export function detectChanges(kind, before, after, now = new Date()) {
  if (!after || typeof after !== 'object') return [];
  const result = [], add = value => {if (value) result.push(value);};
  if (kind === 'common') {
    // Initial pairing/import is not a batch of new messages; existing data stays quiet.
    if (!before?.payload || !after.payload || typeof after.payload !== 'object') return [];
    const a = before.payload, b = after.payload, actor = after.updatedBy;
    const previousNotes = itemMap(a.notes);
    const addedNotes = [...itemMap(b.notes)].filter(([id]) => !previousNotes.has(id)).map(([, item]) => item);
    if (addedNotes.some(item => item.kind === 'ping')) add(intent('pings', actor, 'home'));
    if (addedNotes.some(item => item.kind !== 'ping')) add(intent('notes', actor, 'notes'));
    if (changedList(a.goals, b.goals, fields.goals)) add(intent('goals', actor, 'goals'));
    if (changedList(a.memories, b.memories, fields.memories)) add(intent('memories', actor, 'memories'));
    const today = now.toISOString().slice(0, 10);
    const relevant = item => typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && item.date >= today;
    if (changedList(a.duties, b.duties, fields.duties, relevant) || (b.visit !== a.visit && ((typeof b.visit === 'string' && b.visit >= today) || (typeof a.visit === 'string' && a.visit >= today)))) add(intent('calendar', actor, 'calendar'));
  } else if (kind === 'profile') {
    if (before?.payload && typeof after.payload?.status === 'string' && before.payload.status !== after.payload.status) add(intent('status', after.updatedBy, 'home'));
  } else if (kind === 'jar') {
    if (!before && typeof after.text === 'string' && after.text.trim()) add(intent('notes', after.authorUid, 'jar'));
  } else if (kind === 'letter') {
    if (typeof after.body === 'string' && after.body.trim() && (!before || before.publishedAt !== after.publishedAt || before.body !== after.body)) {
      if (safeId(after.recipientUid) && after.recipientUid !== after.authorUid) add(intent('notes', after.authorUid, 'letters', {onlyRecipient: after.recipientUid}));
    }
  } else if (kind === 'bucket') {
    if (!before || !same(project(before, fields.bucket), project(after, fields.bucket))) add(intent('bucket', after.updatedBy, 'bucket'));
  } else if (kind === 'ping') {
    if (!before) add(intent('pings', after.senderUid, 'home'));
  } else if (kind === 'work') {
    if (after.enabled === true && (!before || !same(project(before, fields.work), project(after, fields.work)))) add(intent('calendar', after.uid, 'home'));
  }
  return result;
}
export function quietNow(hours, now = new Date()) {
  if (hours?.enabled === false) return false;
  if (hours?.enabled !== true || typeof hours.timeZone !== 'string' || !hours.timeZone || hours.timeZone.length > 80) return true;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.start || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.end || '')) return true;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone: hours.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(now);
    const local = Number(parts.find(x => x.type === 'hour').value) * 60 + Number(parts.find(x => x.type === 'minute').value);
    const minute = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const start = minute(hours.start), end = minute(hours.end);
    // Equal boundaries deliberately mean a full day of silence.
    return start === end || (start < end ? local >= start && local < end : local >= start || local < end);
  } catch (_) {return true;} // Malformed/unsupported time zones fail closed.
}
export function notificationAllowed(preferences, category, now = new Date()) {
  return CATEGORIES.includes(category) && preferences?.notifications?.enabled === true
    && preferences.notifications.categories?.[category] === true && !quietNow(preferences.notifications.quietHours, now);
}
export function recipientFor(intent, coupleId, couple, members, accounts) {
  if (!safeId(coupleId) || couple?.memberCount !== 2 || members?.length !== 2 || !safeId(intent?.actorUid)) return '';
  const ids = members.map(m => m.uid);
  if (new Set(ids).size !== 2 || !ids.every(safeId) || !ids.includes(intent.actorUid)
    || ids.some(uid => accounts[uid]?.coupleId !== coupleId)) return '';
  const recipient = ids.find(uid => uid !== intent.actorUid);
  return !intent.onlyRecipient || intent.onlyRecipient === recipient ? recipient : '';
}
export function validDevice(device, uid, installationId) {
  return device?.uid === uid && device?.installationId === installationId && device.platform === 'android'
    && device.enabled === true && /^[A-Za-z0-9_-]{8,100}$/.test(installationId || '')
    && typeof device.token === 'string' && device.token.length >= 20 && device.token.length <= 4096 && !/\s/.test(device.token);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function stableId(...values) {return createHash('sha256').update(JSON.stringify(canonical(values))).digest('hex');}
export function sourceDigest(data) {
  // Only a SHA-256 digest goes in private dispatch receipts; never document contents.
  return stableId(data);
}
export function messageData(intent, coupleId, recipientUid, eventId, now = new Date()) {
  if (!CATEGORIES.includes(intent?.category) || !['home', 'notes', 'jar', 'letters', 'goals', 'bucket', 'memories', 'calendar'].includes(intent.route)
    || !safeId(coupleId) || !safeId(recipientUid) || !/^[a-f0-9]{64}$/.test(eventId)) throw new Error('Unsafe push envelope');
  return {v: '14', title: 'UsSpace', body: MESSAGES[intent.category], category: intent.category,
    route: intent.route, recipientUid, coupleId, eventId, sentAt: String(now.getTime())};
}
export function permanentTokenError(code) {
  return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token';
}
