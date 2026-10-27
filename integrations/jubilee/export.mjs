/* Adapter for Jubilee Work v12's real sessions snapshot; no workplace text is exported. */
import {createHash} from 'node:crypto';
import M from '../../functions/shared/paired-care-models.cjs';
export function jubileeProjection(snapshot,{person,sourceTimestamp,coverageStart,coverageEnd}={}){
 if(typeof person!=='string'||!person.trim()||!Array.isArray(snapshot?.sessions)||snapshot.sessions.length>5000)throw Error('Configure the exact existing rota person.');
 const rows=snapshot.sessions.filter(s=>String(s.person||'').trim().toLowerCase()===person.trim().toLowerCase());let unresolved=0;
 const events=rows.map(s=>{try{if(typeof s.id!=='string'||!s.id)throw Error('unknown-identity');let start=null,end=null;try{if(s.start)start=M.londonTime(s.date,s.start);if(s.end)end=M.londonTime(s.date,s.end);if(start!=null&&end!=null&&end<=start){const day=new Date(Date.parse(s.date+'T12:00:00Z')+86400000).toISOString().slice(0,10);end=M.londonTime(day,s.end);}}catch(_){start=null;end=null;}
 if(!/^\d{4}-\d\d-\d\d$/.test(s.date)||new Date(s.date+'T12:00:00Z').toISOString().slice(0,10)!==s.date)throw Error('invalid-source-date');if(start==null||end==null)unresolved++;
 const kind=/leave|holiday/i.test(s.activity)?'leave':/on.?call/i.test(s.activity)?'on-call':/shift|duty|night/i.test(s.activity)?'shift':/personal|appointment/i.test(s.activity)?'personal':'teaching';
 return {id:'jubilee_'+createHash('sha256').update(s.id).digest('hex').slice(0,40),kind,start:start==null?null:new Date(start).toISOString(),end:end==null?null:new Date(end).toISOString(),localDate:s.date,sourceTimestamp,cancelled:s.deleted===true};}catch(_){unresolved++;return null;}}).filter(Boolean);
 // Coverage must be explicitly declared by the source. A workbook with own entries
 // does not prove that missing days are free or that all shifts were supplied.
 const authoritative=!!coverageStart&&!!coverageEnd&&unresolved===0;
 return {version:1,sourceTimestamp,status:authoritative?'complete':'partial',authoritative,coverageStart:coverageStart||new Date(Math.min(...events.map(e=>e.start?Date.parse(e.start):Date.parse(e.localDate+'T00:00:00Z')),Date.parse(sourceTimestamp))).toISOString(),coverageEnd:coverageEnd||new Date(Math.max(...events.map(e=>e.end?Date.parse(e.end):Date.parse(e.localDate+'T23:59:59Z')),Date.parse(sourceTimestamp)+1)).toISOString(),events,unresolved};
}
