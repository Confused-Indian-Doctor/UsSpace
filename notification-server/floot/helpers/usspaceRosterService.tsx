// @ts-nocheck
// Reuse the existing authenticated Firebase Admin backend; no new hosted service.
import {FieldValue} from '@google-cloud/firestore';
import {usspaceFirebaseAdmin} from './usspacePushService';
import {usspaceTravelService} from './usspaceTravelService';
import {usspaceRosterServiceCore} from './usspaceRosterServiceCore';
import {usspaceJubileeProvider} from './usspaceJubileeProvider';
const fail=(status,error)=>({status,body:{error}});
async function handle(request:Request,kind:string){
 const ingress=await usspaceTravelService.read(request);if(ingress.status!==200)return ingress;
 const c=usspaceFirebaseAdmin();if(!c)return fail(503,'backend-setup-required');
 const roster=usspaceRosterServiceCore.makeRosterService({db:c.db,serverTimestamp:()=>FieldValue.serverTimestamp()});
 try{
  if(kind==='import')return {status:200,body:await roster.refresh(ingress.authorization.slice(7),ingress.body)};
  const actor=await c.auth.verifyIdToken(ingress.authorization.slice(7),true);if(actor.aud!=='usspace-c859e'||actor.iss!=='https://securetoken.google.com/usspace-c859e')return fail(401,'invalid-authentication');
  if(kind==='credential'){if(ingress.body.action==='issue')return {status:200,body:await roster.issue(actor.uid,ingress.body.sourceId)};if(ingress.body.action==='revoke'){await roster.revoke(actor.uid,ingress.body.id);return {status:200,body:{revoked:true}};}return fail(400,'invalid-action');}
  if(kind==='jubilee-refresh'){
   const binding=await c.db.doc('jubileeBindings/current').get();if(!binding.exists||binding.data().ownerUid!==actor.uid||binding.data().enabled!==true)return fail(403,'source-not-bound');
   const source=await usspaceJubileeProvider.pullJubilee({exportToken:process.env.JUBILEE_USSPACE_EXPORT_TOKEN});
   const result=await roster.refresh(process.env.JUBILEE_USSPACE_INGRESS_CREDENTIAL,source.refresh,{upstreamRefreshedAt:source.upstreamRefreshedAt,expectedUid:actor.uid});return {status:200,body:{...result,upstreamRefreshedAt:source.upstreamRefreshedAt,unresolved:source.unresolved}};
  }
  return fail(400,'invalid-action');
 }catch(_){return fail(400,'invalid-or-unavailable-roster-request');}
}
export const usspaceRosterService={handle};
