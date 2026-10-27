/* Sanitized helper ingress. Hospital credentials/cookies and full workbooks are never accepted. */
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
const ID=/^[A-Za-z0-9_-]{1,100}$/;
const kinds=['shift','teaching','on-call','leave','personal'];
const hash=x=>createHash('sha256').update(x).digest('hex');
const stamp=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>keys.includes(k));
function fail(code){throw Error(code);}
export function rosterRefresh(input){
 if(!exact(input,['version','sourceTimestamp','status','authoritative','coverageStart','coverageEnd','events'])||input.version!==1||!stamp(input.sourceTimestamp)||!['complete','partial','failed'].includes(input.status)||typeof input.authoritative!=='boolean'||!Array.isArray(input.events)||input.events.length>400)fail('invalid-roster-refresh');
 const from=Date.parse(input.coverageStart),to=Date.parse(input.coverageEnd);if(!stamp(input.coverageStart)||!stamp(input.coverageEnd)||to<=from||to-from>370*86400000||input.status==='failed'&&input.events.length)fail('invalid-roster-coverage');
 const seen=new Set(),events=input.events.map(e=>{if(!exact(e,['id','kind','start','end','localDate','sourceTimestamp','cancelled'])||!ID.test(e.id||'')||seen.has(e.id)||!kinds.includes(e.kind)||!stamp(e.sourceTimestamp)||typeof e.cancelled!=='boolean')fail('invalid-roster-event');seen.add(e.id);
 const known=stamp(e.start)&&stamp(e.end),start=stamp(e.start)?Date.parse(e.start):null,end=stamp(e.end)?Date.parse(e.end):null;
 if((e.start!==null&&!stamp(e.start))||(e.end!==null&&!stamp(e.end))||Date.parse(e.sourceTimestamp)>Date.parse(input.sourceTimestamp))fail('invalid-roster-event-time');
 const localDate=e.localDate||(known?new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(start):'');if(!/^\d{4}-\d\d-\d\d$/.test(localDate)||new Date(localDate+'T12:00:00Z').toISOString().slice(0,10)!==localDate)fail('invalid-roster-date');
 const point=known?start:Date.parse(localDate+'T12:00:00Z');if(point<from||point>=to||known&&(end<=start||end-start>14*86400000))fail('invalid-roster-event-time');
 return {sourceEventId:e.id,kind:e.kind,start,end,localDate,timing:known?'known':'unknown',sourceTimestamp:new Date(e.sourceTimestamp).toISOString(),cancelled:e.cancelled,title:({'shift':'Shift','teaching':'Teaching','on-call':'On-call','leave':'Leave','personal':'Personal work event'})[e.kind],timeZone:'Europe/London'};});
 return {sourceTimestamp:new Date(input.sourceTimestamp).toISOString(),status:input.status,authoritative:input.authoritative&&input.status==='complete',coverageStart:from,coverageEnd:to,events};
}
export function makeRosterService({db,now=()=>new Date(),serverTimestamp=()=>new Date().toISOString()}={}){
 async function issue(uid,sourceId){if(!ID.test(uid||'')||!ID.test(sourceId||''))fail('invalid-source');const id=randomBytes(16).toString('hex'),secret=randomBytes(32).toString('base64url'),credential=id+'.'+secret;await db.runTransaction(async tx=>{tx.set(db.doc('rosterCredentials/'+id),{uid,sourceId,digest:hash(credential),enabled:true,expiresAt:now().getTime()+90*86400000});});return {credential,id,sourceId,expiresInDays:90};}
 async function revoke(uid,id){if(!ID.test(id||''))fail('invalid-credential');await db.runTransaction(async tx=>{const ref=db.doc('rosterCredentials/'+id),s=await tx.get(ref);if(!s.exists||s.data().uid!==uid)fail('forbidden');tx.update(ref,{enabled:false});});}
 async function refresh(credential,input,{upstreamRefreshedAt,expectedUid}={}){if(typeof credential!=='string'||!/^([a-f0-9]{32})\.[A-Za-z0-9_-]{43}$/.test(credential))fail('invalid-credential');const ref=db.doc('rosterCredentials/'+credential.split('.')[0]),clean=rosterRefresh(input),digest=hash(JSON.stringify(clean));
 return db.runTransaction(async tx=>{const key=await tx.get(ref),c=key.exists?key.data():null;if(!c||!c.enabled||c.expiresAt<=now().getTime()||!ID.test(c.uid)||!ID.test(c.sourceId)||typeof c.digest!=='string'||c.digest.length!==64||!timingSafeEqual(Buffer.from(c.digest),Buffer.from(hash(credential))))fail('invalid-credential');if(expectedUid!==undefined&&c.uid!==expectedUid)fail('source-owner-mismatch');
 const stateRef=db.doc('users/'+c.uid+'/rosterSources/'+c.sourceId),stateSnap=await tx.get(stateRef),state=stateSnap.exists?stateSnap.data():{},query=db.collection('users/'+c.uid+'/rosterEvents').where('sourceId','==',c.sourceId).limit(450),rows=await tx.get(query);if(rows.docs.length>=450)fail('source-capacity');
 if(state.sourceTimestamp&&clean.sourceTimestamp<state.sourceTimestamp)fail('stale-source-refresh');if(clean.sourceTimestamp===state.sourceTimestamp){if(state.digest===digest)return {replayed:true};fail('source-version-conflict');}
 const previous=new Map(rows.docs.map(s=>[s.data().sourceEventId,s]));let upserts=0,cancellations=0;
 if(clean.status!=='failed')for(const e of clean.events){const old=previous.get(e.sourceEventId);previous.delete(e.sourceEventId);if(old&&old.data().sourceTimestamp>e.sourceTimestamp)continue;const id='src_'+hash(c.sourceId+'|'+e.sourceEventId).slice(0,40),target=db.doc('users/'+c.uid+'/rosterEvents/'+id);tx.set(target,{...e,id,sourceId:c.sourceId,ownerUid:c.uid,origin:'helper',updatedAt:serverTimestamp()});upserts++;}
 if(clean.authoritative)for(const old of previous.values()){const e=old.data();if((e.start??Date.parse(e.localDate+'T12:00:00Z'))>=clean.coverageStart&&(e.start??Date.parse(e.localDate+'T12:00:00Z'))<clean.coverageEnd&&e.sourceTimestamp<=clean.sourceTimestamp&&!e.cancelled){tx.set(old.ref,{...e,cancelled:true,sourceTimestamp:clean.sourceTimestamp,updatedAt:serverTimestamp()});cancellations++;}}
 const next={...state,ownerUid:c.uid,sourceId:c.sourceId,sourceTimestamp:clean.sourceTimestamp,digest,status:clean.status,attemptedAt:serverTimestamp(),laptopDependent:true,timeZone:'Europe/London'};
 if(stamp(upstreamRefreshedAt)&&clean.status!=='failed')next.lastSourceSuccess=new Date(upstreamRefreshedAt).toISOString();
 if(clean.authoritative){next.coverageStart=clean.coverageStart;next.coverageEnd=clean.coverageEnd;next.lastSuccess=serverTimestamp();}tx.set(stateRef,next);return {upserts,cancellations,status:clean.status};});}
 return {issue,revoke,refresh};
}
