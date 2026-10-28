#!/usr/bin/env node
/* Explicit admin CLI, never a public endpoint. Credential values never leave the process. */
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {makeRosterService} from '../functions/src/roster-service.mjs';
import {resolveRosterOwner,installRosterBinding} from '../functions/src/roster-configuration.mjs';
const hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n').trim()).digest('hex');
async function main(){
 const args=process.argv.slice(2),value=k=>{const i=args.indexOf(k);return i<0?'':args[i+1]||'';};
 const consentRules=args.includes('--enable-consent-rules'),apply=args.includes('--apply')||consentRules,expected=value('--expected-current-rules-sha256');
 if(!process.env.USSPACE_FIREBASE_ADMIN_JSON)throw Error('firebase-admin-secret-required');
 let raw;try{raw=JSON.parse(process.env.USSPACE_FIREBASE_ADMIN_JSON);}catch{throw Error('invalid-admin-configuration');}
 if(raw.type!=='service_account'||raw.project_id!=='usspace-c859e')throw Error('wrong-firebase-project');
 if(typeof raw.client_email!=='string'||!/^([^\s@]+)@usspace-c859e\.iam\.gserviceaccount\.com$/.test(raw.client_email)||typeof raw.private_key!=='string'||raw.private_key.length<1200||raw.private_key.length>10000)throw Error('invalid-admin-configuration');
 const require=createRequire(new URL('../functions/package.json',import.meta.url));
 const {initializeApp,cert,deleteApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore,FieldValue}=require('firebase-admin/firestore');
 const app=initializeApp({projectId:'usspace-c859e',credential:cert({projectId:raw.project_id,clientEmail:raw.client_email,privateKey:raw.private_key})}),db=getFirestore(app),auth=getAuth(app);
 async function google(path,method='GET',body){const t=await app.options.credential.getAccessToken();const r=await fetch('https://firebaserules.googleapis.com/v1/projects/usspace-c859e/'+path,{method,signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+t.access_token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok){console.error(JSON.stringify({operation:method+' '+(path.startsWith('rulesets')?'rulesets':'releases'),httpStatus:r.status}));throw Error('firebase-rules-permission-or-service-unavailable');}return r.json();}
 try{
  const owner=await resolveRosterOwner({db,auth,ownerEmail:value('--owner-email')||process.env.USSPACE_ROSTER_OWNER_EMAIL,expectedOwnerEmailSha256:value('--expected-owner-email-sha256')||process.env.USSPACE_JUBILEE_OWNER_EMAIL_SHA256});
  const release=await google('releases/cloud.firestore');if(!/^projects\/usspace-c859e\/rulesets\/[^/]+$/.test(release.rulesetName||''))throw Error('invalid-live-rules-reference');
  const live=await google(release.rulesetName.replace('projects/usspace-c859e/','')),files=live.source?.files;
  if(!Array.isArray(files)||files.length!==1||typeof files[0].content!=='string'||files[0].content.length>200000)throw Error('unsupported-live-rules');
  const currentHash=hash(files[0].content),desired=await readFile(new URL(consentRules?'../firestore.rules':'../firestore.roster-private.rules',import.meta.url),'utf8'),desiredHash=hash(desired);
  const binding=await db.doc('jubileeBindings/current').get();
  if(value('--save-live-rules'))await writeFile(value('--save-live-rules'),files[0].content,{flag:'wx',mode:0o600});
  if(args.includes('--verify-source')){
   const b=binding.data();if(!binding.exists||b.enabled!==true||b.ownerUid!==owner.ownerUid||b.pairId!==owner.pairId)throw Error('current-paired-members-required');
   const {pullJubilee}=await import('../functions/src/jubilee-provider.mjs');
   const source=await pullJubilee({exportToken:b.exportToken,fetcher:async (...input)=>{const response=await fetch(...input);if(!response.ok)console.error(JSON.stringify({operation:'fixed-jubilee-export',httpStatus:response.status}));return response;}});
   const roster=makeRosterService({db,serverTimestamp:()=>FieldValue.serverTimestamp()});
   const result=await roster.refresh(b.ingressCredential,source.refresh,{upstreamRefreshedAt:source.upstreamRefreshedAt,expectedUid:owner.ownerUid});
   const replay=await roster.refresh(b.ingressCredential,source.refresh,{upstreamRefreshedAt:source.upstreamRefreshedAt,expectedUid:owner.ownerUid});
   if(replay.replayed!==true)throw Error('source-replay-not-idempotent');
   let backendVerified=false;
   if(args.includes('--verify-backend')){
    const config=JSON.parse(await readFile(new URL('../app/google-services.json',import.meta.url),'utf8'));
    const client=config.client.find(c=>c.client_info?.android_client_info?.package_name==='app.usspace.couple.v012');
    if(config.project_info?.project_id!=='usspace-c859e'||!client?.api_key?.[0]?.current_key)throw Error('wrong-firebase-project');
    const customToken=await auth.createCustomToken(owner.ownerUid);
    const login=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key='+encodeURIComponent(client.api_key[0].current_key),{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({token:customToken,returnSecureToken:true})});
    const session=await login.json();if(!login.ok||typeof session.idToken!=='string')throw Error('backend-owner-verification-failed');
    const response=await fetch('https://usspace-notify-cb2f5cbc.floot.app/_api/usspace-roster/jubilee-refresh',{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),headers:{Authorization:'Bearer '+session.idToken,'Content-Type':'application/json'},body:'{}'});
    if(!response.ok){console.error(JSON.stringify({operation:'authenticated-owner-roster-endpoint',httpStatus:response.status}));throw Error('backend-owner-verification-failed');}
    const body=await response.json();if(!Number.isInteger(body.upserts)&&body.replayed!==true)throw Error('backend-owner-verification-failed');backendVerified=true;
   }
   console.log(JSON.stringify({mode:'verified-real-source',backendOwnerEndpointVerified:backendVerified,authenticationEvidence:'admin-issued token for existing verified owner; not Google sign-in UI',...result,idempotentReplay:true,sourceEventCount:source.refresh.events.length,unresolved:source.unresolved,authoritative:source.refresh.authoritative,upstreamRefreshedAt:source.upstreamRefreshedAt}));return;
  }
  if(!apply){console.log(JSON.stringify({mode:'inspect',canonicalOwnerVerified:true,currentPairVerified:true,bindingExists:binding.exists,currentRulesSha256:currentHash,desiredPrivateRosterRulesSha256:desiredHash,alreadyPrivateRosterRules:currentHash===desiredHash}));return;}
  if(!/^[a-f0-9]{64}$/.test(expected)||currentHash!==expected)throw Error('live-rules-changed-or-unreviewed');
  if(binding.exists&&!consentRules)throw Error('binding-already-exists-review-required');
  if(consentRules&&(!binding.exists||binding.data().enabled!==true||binding.data().ownerUid!==owner.ownerUid||binding.data().pairId!==owner.pairId))throw Error('current-paired-members-required');
  if(currentHash!==desiredHash){
   const created=await google('rulesets','POST',{source:{files:[{name:'firestore.rules',content:desired}]}});
   if(!/^projects\/usspace-c859e\/rulesets\/[^/]+$/.test(created.name||''))throw Error('invalid-created-rules-reference');
   // Optimistic recheck immediately before publishing: never overwrite a newer live ruleset.
   const again=await google('releases/cloud.firestore');if(again.rulesetName!==release.rulesetName)throw Error('live-rules-changed');
   await google('releases/cloud.firestore','PATCH',{release:{name:'projects/usspace-c859e/releases/cloud.firestore',rulesetName:created.name},updateMask:'rulesetName'});
  }
  const confirmed=await google('releases/cloud.firestore'),rules=await google(confirmed.rulesetName.replace('projects/usspace-c859e/',''));
  if(hash(rules.source.files[0].content)!==desiredHash)throw Error('private-roster-rules-not-confirmed');
  if(consentRules){console.log(JSON.stringify({mode:'consent-rules-published',rulesSha256:desiredHash,consentRecordsWritten:false,ownerBindingPreserved:true}));return;}
  const roster=makeRosterService({db,serverTimestamp:()=>FieldValue.serverTimestamp()});
  console.log(JSON.stringify({...await installRosterBinding({db,roster,...owner}),privateRosterRulesSha256:desiredHash,healthAndPartnerSharingEnabled:false}));
 }finally{await db.terminate();await deleteApp(app);}
}
main().catch(error=>{const allowed=/^(backend-owner-verification-failed|jubilee-source-unavailable|source-replay-not-idempotent|verified-owner-selection-required|owner-selection-needs-review|firebase-admin-secret-required|invalid-admin-configuration|wrong-firebase-project|invalid-owner-email|existing-verified-owner-required|existing-pair-required|canonical-owner-role-required|current-paired-members-required|firebase-rules-permission-or-service-unavailable|invalid-live-rules-reference|unsupported-live-rules|live-rules-changed-or-unreviewed|binding-already-exists-review-required|invalid-created-rules-reference|live-rules-changed|private-roster-rules-not-confirmed)$/;console.error(allowed.test(error.message)?error.message:'configuration-failed-see-secure-provider-console');process.exitCode=1;});
