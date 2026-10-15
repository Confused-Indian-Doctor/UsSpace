/* Clearly labelled disposable demo emulator fixtures. Never uses production credentials. */
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore,FieldValue}=require('firebase-admin/firestore');
const M=require('../app/src/main/assets/travel-models.js');
if(process.env.GCLOUD_PROJECT!=='demo-usspace'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Only the local demo emulators are allowed');
const app=initializeApp({projectId:'demo-usspace'}),auth=getAuth(app),db=getFirestore(app),uid='travel_qa_al',partner='travel_qa_partner',pairId='travel_qa_pair';
for(const [id,email,name] of [[uid,'travel-al@example.test','Al · QA'],[partner,'travel-partner@example.test','Partner · QA']]){try{await auth.createUser({uid:id,email,password:'UsSpace-Emulator-Only-2026',displayName:name});}catch(e){if(e.code!=='auth/uid-already-exists'&&e.code!=='auth/email-already-exists')throw e;}}
const batch=db.batch();batch.set(db.doc('couples/'+pairId),{ownerUid:uid,memberCount:2});for(const id of [uid,partner]){batch.set(db.doc('users/'+id),{coupleId:pairId});batch.set(db.doc('couples/'+pairId+'/members/'+id),{uid:id,name:id===uid?'Al · QA':'Partner · QA'});}
const when='2026-10-16',confirmedAt=new Date().toISOString();
function record(kind,fields,visibility='shared'){const value=M.normalize(kind,{...fields,visibility,pairId:visibility==='shared'?pairId:'',revision:1},{uid,pairId});value.createdAt=FieldValue.serverTimestamp();value.updatedAt=FieldValue.serverTimestamp();value.updatedBy=uid;const collections={item:'travelItems',trip:'travelTrips',stop:'travelStops',memory:'travelMemories',collection:'travelCollections'};batch.set(db.doc((visibility==='shared'?'couples/'+pairId:'users/'+uid)+'/'+collections[kind]+'/'+value.id),value);return value;}
record('collection',{id:'qa_collection',title:'QA · our weekend',description:'Demo emulator data only',color:'rose'});
record('item',{id:'qa_garden',title:'QA · Garden walk',kind:'place',category:'Travel',location:'Glasgow',description:'Take a slow walk and bring a book. Emulator fixture, not a venue guide.',collectionIds:['qa_collection'],verifiedPlace:{provider:'user-confirmed',placeId:'qa_garden_point',name:'QA checked garden point',latitude:55.879,longitude:-4.29,sourceUrl:'https://www.openstreetmap.org/?mlat=55.879&mlon=-4.29',confirmedAt}});
record('item',{id:'qa_private',title:'QA · Private coffee idea',category:'Food'},'private');
record('item',{id:'qa_done',title:'QA · A lovely day',status:'done',completedDate:when});
record('trip',{id:'qa_trip',title:'QA · Our little weekend',destination:'Glasgow',startDate:when,endDate:'2026-10-18',timezone:'Europe/London',currency:'GBP',travelMode:'walk',pace:'relaxed',status:'planning'});
record('stop',{id:'qa_stop',tripId:'qa_trip',bucketItemId:'qa_garden',title:'QA · Garden walk',localDate:when,orderKey:1024,startTime:'10:00',durationMinutes:60,travelMode:'walk',notes:'Bring a book. Leave the afternoon free.'});
record('memory',{id:'qa_memory',bucketItemId:'qa_done',title:'QA · A lovely day',localDate:when,location:'Glasgow',reflection:'A slow afternoon worth keeping. Demo emulator fixture.'});
await batch.commit();console.log('TRAVEL_QA_DEMO_FIXTURES_READY');
