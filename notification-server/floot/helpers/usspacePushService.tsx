import {cert, getApps, initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';
import {createHash, createPrivateKey} from 'node:crypto';
import {usspacePushRelayCore} from './usspacePushRelayCore';
import {usspacePushRules} from './usspacePushRules';
import {usspacePushIngress} from './usspacePushIngress';

const PROJECT = 'usspace-c859e';
// Set true only after the complete Firestore emulator suite passes this ruleset.
const APPLY_VERIFIED_RULES = false;
let cached: {at: number; result: any} | undefined;
let checking: Promise<any> | undefined;
function hash(source: string) {return createHash('sha256').update(source.replace(/\r\n/g, '\n').trim()).digest('hex');}
function configuration() {
  try {
    const raw = JSON.parse(process.env.USSPACE_FIREBASE_ADMIN_JSON || '');
    if (raw.type !== 'service_account' || raw.project_id !== PROJECT
      || typeof raw.client_email !== 'string' || !/^[^\s@]+@usspace-c859e\.iam\.gserviceaccount\.com$/.test(raw.client_email)
      || typeof raw.private_key !== 'string' || raw.private_key.length < 1200 || raw.private_key.length > 10000) return null;
    const key = createPrivateKey(raw.private_key);
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength || 0) < 2048) return null;
    const name = 'usspace-push-' + createHash('sha256').update(raw.client_email + raw.private_key).digest('hex').slice(0, 12);
    const app = getApps().find(x => x.name === name) || initializeApp({projectId: PROJECT,
      credential: cert({projectId: PROJECT, clientEmail: raw.client_email, privateKey: raw.private_key})}, name);
    return {app, db: getFirestore(app), auth: getAuth(app), messaging: getMessaging(app)};
  } catch (_) {return null;} // Never log private-key/parser errors or the supplied value.
}
async function google(app: any, url: string, init: RequestInit = {}) {
  const token = await app.options.credential.getAccessToken();
  return fetch(url, {...init, signal: AbortSignal.timeout(12000), headers: {
    Authorization: 'Bearer ' + token.access_token, 'Content-Type': 'application/json', ...init.headers}});
}
async function rulesReady(app: any) {
  const base = 'https://firebaserules.googleapis.com/v1/', releasePath = `projects/${PROJECT}/releases/cloud.firestore`;
  const releaseResponse = await google(app, base + releasePath);
  if (!releaseResponse.ok) return false;
  const release = await releaseResponse.json();
  if (typeof release.rulesetName !== 'string' || !release.rulesetName.startsWith(`projects/${PROJECT}/rulesets/`)) return false;
  const rulesResponse = await google(app, base + release.rulesetName);
  if (!rulesResponse.ok) return false;
  const current = await rulesResponse.json(), files = current.source?.files;
  if (!Array.isArray(files) || files.length !== 1 || typeof files[0]?.content !== 'string') return false;
  const currentHash = hash(files[0].content);
  if (currentHash === usspacePushRules.sha256) return true;
  // Never overwrite custom or newer production rules. The only permitted
  // transition is this repository's exact verified v0.15 to verified v0.16.
  if (!APPLY_VERIFIED_RULES || currentHash !== usspacePushRules.previousSha256) return false;
  const created = await google(app, base + `projects/${PROJECT}/rulesets`, {method: 'POST',
    body: JSON.stringify({source: {files: [{name: 'firestore.rules', content: usspacePushRules.source}]}})});
  if (!created.ok) return false;
  const rule = await created.json();
  if (typeof rule.name !== 'string' || !rule.name.startsWith(`projects/${PROJECT}/rulesets/`)) return false;
  const updated = await google(app, base + releasePath, {method: 'PATCH',
    body: JSON.stringify({name: releasePath, rulesetName: rule.name})});
  return updated.ok;
}
async function recoveryReady(app: any) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/collectionGroups/pushOutbox/indexes`;
    const response = await google(app, url);
    if (!response.ok) return false;
    const data = await response.json();
    const same = (x: any) => x.queryScope === 'COLLECTION' && x.fields?.filter((f: any) => f.fieldPath !== '__name__').length === 2
      && x.fields?.some((f: any) => f.fieldPath === 'actorUid' && f.order === 'ASCENDING')
      && x.fields?.some((f: any) => f.fieldPath === 'createdAt' && f.order === 'DESCENDING');
    const existing = (data.indexes || []).find(same);
    if (existing) return existing.state === 'READY';
    await google(app, url, {method: 'POST', body: JSON.stringify({queryScope: 'COLLECTION',
      fields: [{fieldPath: 'actorUid', order: 'ASCENDING'}, {fieldPath: 'createdAt', order: 'DESCENDING'}]})});
  } catch (_) { /* Immediate durable jobs still work while a recovery index builds. */ }
  return false;
}
function unavailable(setup: string) {return {ready: false, protocol: 1, projectId: PROJECT, firestoreRulesReady: false, setup};}
async function check() {
  const c = configuration();
  if (!c) return unavailable('complete-firebase-service-account-required');
  try {
    await c.db.doc('_pushWorkerLeases/v014').get();
    try {await c.auth.getUser('usspace_server_permission_probe_v016');}
    catch (error: any) {if (error?.code !== 'auth/user-not-found') throw new Error('auth-permission');}
    // FCM validate_only: checks send permission without contacting any device.
    await c.messaging.send({topic: 'usspace-server-configuration-check', data: {kind: 'configuration-check'}}, true);
    const rules = await rulesReady(c.app);
    const recovery = rules ? await recoveryReady(c.app) : false;
    return {ready: rules, protocol: 1, projectId: PROJECT, firestoreRulesReady: rules,
      recoveryReady: recovery, transport: 'on-demand', setup: rules ? '' : 'publish-verified-firestore-rules'};
  } catch (_) {return unavailable('firebase-server-permissions-required');}
}
async function capabilities() {
  if (cached && Date.now() - cached.at < 60000) return cached.result;
  if (!checking) checking = check().then(result => {cached = {at: Date.now(), result}; return result;}).finally(() => {checking = undefined;});
  return checking;
}
async function handle(request: Request) {
  // Reject unauthenticated/malformed/oversized input before capability checks can
  // contact Firebase, inspect rules or create a recovery index.
  const ingress: {status: number; body: unknown; authorization?: string} = await usspacePushIngress.read(request);
  if (ingress.status !== 200) return ingress;
  const status = await capabilities();
  if (!status.ready) return {status: 503, body: {consumed: false, error: 'server-setup-required', retryable: true}};
  const c = configuration();
  if (!c) return {status: 503, body: {consumed: false, error: 'server-setup-required', retryable: true}};
  const relay = usspacePushRelayCore.makeOutboxRelay({...c, projectId: PROJECT,
    serverTimestamp: () => FieldValue.serverTimestamp(), logger: {warn: () => {}},
    sleep: (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))});
  return relay.handle({method: 'POST', authorization: ingress.authorization, body: ingress.body});
}
export const usspacePushService = {capabilities, handle};
