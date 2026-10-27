// @ts-nocheck
import {env} from 'cloudflare:workers';
import {database} from '@/db/raw';
import {jubileeProjection} from '@/lib/usspace-export';
import {digest} from '@/lib/helper-pairing';
import {applySavedOverride,mergeSavedSession} from '@/lib/merge-sessions';
import seed from '@/lib/seed.json';
import sourceHistory from '@/lib/source-history.json';
import legacyIds from '@/lib/legacy-ids.json';
export async function GET(request:Request){
 const headers={'Cache-Control':'no-store'};
 // Dedicated read-only export credential. Never reuse the laptop's update token.
 const supplied=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];
 const configured=(env as any).USSPACE_EXPORT_TOKEN_SHA256,person=(env as any).USSPACE_EXPORT_PERSON;
 if(!configured||!person)return Response.json({error:'export-not-configured'},{status:503,headers});
 if(!supplied||await digest(supplied)!==configured)return Response.json({error:'unauthorized'},{status:401,headers});
 const db=database(),saved=await db.prepare('SELECT payload FROM rota_snapshots WHERE id=1').first<{payload:string}>(),sync=await db.prepare('SELECT status,updated_at FROM rota_sync WHERE id=1').first<{status:string;updated_at:number}>();
 // Never export the bundled seed as a successful source refresh.
 if(!saved||!sync||sync.status!=='succeeded')return Response.json({error:'source-not-successfully-refreshed'},{status:503,headers});
 const snapshot=JSON.parse(saved.payload),map=new Map(snapshot.sessions.map(s=>[s.id,s]));
 const edits=await db.prepare('SELECT payload FROM sessions').all<{payload:string}>();
 for(const row of edits.results){const v=JSON.parse(row.payload),legacy=legacyIds[v.id];if(legacy){const current=map.get(legacy);if(current)map.set(legacy,{...current,...(v.deleted?{deleted:true}:{}),...(v.start?{start:v.start}:{}),...(v.end?{end:v.end}:{})});}else{const current=map.get(v.id);if(current){const baselines=[...seed.filter(s=>s.id===v.id),...sourceHistory.flatMap(snapshot=>snapshot.filter(s=>s.id===v.id))];map.set(v.id,v.sourceBaseline?applySavedOverride(current,v,v.sourceBaseline):mergeSavedSession(current,v,baselines));}else if(!v.id.startsWith('rota-')||!sourceHistory.some(snapshot=>snapshot.some(s=>s.id===v.id)))map.set(v.id,v);}}
 // An observed timestamp represents this successful export, not continuous access
 // to the hospital. The original upstream refresh timestamp is separately supplied.
 const sourceTimestamp=new Date().toISOString(),projection=jubileeProjection({...snapshot,sessions:[...map.values()]},{person,sourceTimestamp});
 // No coverage is inferred from a teaching timetable. Remains partial until the
 // source exposes a deliberate authoritative own-roster coverage contract.
 return Response.json({refresh:projection,upstreamRefreshedAt:new Date(sync.updated_at).toISOString()},{headers});
}
