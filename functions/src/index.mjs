import {initializeApp} from 'firebase-admin/app';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';
import {onDocumentWritten} from 'firebase-functions/v2/firestore';
import {setGlobalOptions} from 'firebase-functions/v2';
import {logger} from 'firebase-functions';
import {makeDispatcher} from './dispatch.mjs';

initializeApp();
setGlobalOptions({region: 'us-central1', maxInstances: 10, memory: '256MiB', timeoutSeconds: 60});
const dispatcher = makeDispatcher({db: getFirestore(), messaging: getMessaging(), logger, sendAttempts: 3, urgentCategories: ['pings', 'notes'], serverTimestamp: () => FieldValue.serverTimestamp()});
const handler = kind => async event => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  if (!after) return; // Deleted documents contain no shareable notification.
  return dispatcher.deliver({kind, coupleId: event.params.coupleId, itemId: event.params.itemId || 'common',
    eventId: event.id, before, after});
};
const watched = (path, kind) => onDocumentWritten({document: path, retry: true}, handler(kind));
// Only existing shared changes and strict, authenticated document writes can send.
// No HTTP/callable endpoint accepts recipient UIDs, FCM tokens or message contents.
export const notifyCommon = watched('couples/{coupleId}/shared/common', 'common');
export const notifyStatus = watched('couples/{coupleId}/profiles/{itemId}', 'profile');
export const notifyAppreciation = watched('couples/{coupleId}/usJar/{itemId}', 'jar');
export const notifyReleasedLetter = watched('couples/{coupleId}/usLetters/{itemId}', 'letter');
export const notifyBucket = watched('couples/{coupleId}/usBucket/{itemId}', 'bucket');
export const notifyPing = watched('couples/{coupleId}/usPings/{itemId}', 'ping');
export const notifySharedWorkTime = watched('couples/{coupleId}/workSummaries/{itemId}', 'work');

// Narrow helper integration. No hospital session material is accepted or stored.
import {onRequest} from 'firebase-functions/v2/https';
import {getAuth} from 'firebase-admin/auth';
import {makeRosterService} from './roster-service.mjs';
const rosterService=makeRosterService({db:getFirestore(),serverTimestamp:()=>FieldValue.serverTimestamp()});
export const rosterIntegration=onRequest({maxInstances:2,timeoutSeconds:30},async(req,res)=>{
 res.set('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'method-not-allowed'});
 if(Number(req.headers['content-length']||0)>196608||req.rawBody?.length>196608)return res.status(413).json({error:'request-too-large'});
 try{const action=req.query.action;
 if(action==='refresh'){const bearer=/^Bearer (.+)$/.exec(req.headers.authorization||'')?.[1];const result=await rosterService.refresh(bearer,req.body);return res.json(result);}
 const token=/^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.authorization||'')?.[1];if(!token)return res.status(401).json({error:'authentication-required'});
 const actor=await getAuth().verifyIdToken(token,true);if(action==='issue'){const result=await rosterService.issue(actor.uid,req.body?.sourceId);return res.json(result);}if(action==='revoke'){await rosterService.revoke(actor.uid,req.body?.id);return res.json({revoked:true});}return res.status(400).json({error:'invalid-action'});
 }catch(_){return res.status(400).json({error:'invalid-or-unauthorized-roster-request'});}
});

import {defineSecret} from 'firebase-functions/params';
import {pullJubilee} from './jubilee-provider.mjs';
const jubileeExportToken=defineSecret('JUBILEE_USSPACE_EXPORT_TOKEN');
const jubileeIngress=defineSecret('JUBILEE_USSPACE_INGRESS_CREDENTIAL');
export const refreshJubileeRoster=onRequest({secrets:[jubileeExportToken,jubileeIngress],maxInstances:2,timeoutSeconds:30},async(req,res)=>{
 res.set('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'method-not-allowed'});
 try{const token=/^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.authorization||'')?.[1];if(!token)return res.status(401).json({error:'authentication-required'});const actor=await getAuth().verifyIdToken(token,true);
 // A separate administrative binding identifies the existing owner. The request
 // cannot choose another Firebase UID or source. No names are used as identities.
 const source=await getFirestore().doc('jubileeBindings/current').get();if(!source.exists||source.data().ownerUid!==actor.uid||source.data().enabled!==true)return res.status(403).json({error:'source-not-bound'});
 const data=await pullJubilee({exportToken:jubileeExportToken.value()});
 // The credential is scoped to this source and revocable. It is stored only in a
 // backend secret, never returned to the phone or mixed with hospital credentials.
 const credential=jubileeIngress.value();
 const result=await rosterService.refresh(credential,data.refresh,{upstreamRefreshedAt:data.upstreamRefreshedAt,expectedUid:actor.uid});return res.json({...result,upstreamRefreshedAt:data.upstreamRefreshedAt,unresolved:data.unresolved});
 }catch(_){return res.status(503).json({error:'source-refresh-unavailable-previous-roster-kept'});}
});
