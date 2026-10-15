const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../app/src/main/assets/travel-models.js'),S=require('../app/src/main/assets/travel-store.js');
const code=fs.readFileSync('app/src/main/assets/travel.js','utf8');
function setup(){let sequence=0,active='bucket',calls=[],acks=[],nav=[];const handlers={};const section={innerHTML:'',addEventListener(name,fn){(handlers[name]??=[]).push(fn);}};
 const root={document:{readyState:'complete',getElementById:id=>id==='bucket'?section:null,querySelector:()=>({id:active})},UsTravelModels:M,UsTravelStore:S,URL,Intl,console,Date,Set,Map,crypto:{randomUUID:()=> 'id'+(++sequence)},UsExtras:{get:()=>({bucket:[],coupleId:'pair'}),subscribe:()=>{},photo:()=>''},UsSpaceExtras:{openLink:url=>calls.push({url})},AndroidTravel:{apply:value=>{calls.push(JSON.parse(value));return true;},refresh(){},photo(){return '';},react(...args){calls.push({reaction:args});}},AndroidTravelImports:{refresh(){},claim:id=>calls.push({claim:id}),acknowledge:id=>acks.push(id),image:()=>''},go:id=>{nav.push(id);active=id;}};
 root.UsPlans={render:()=>root.UsTravel?.renderBucket({}),openBucket:id=>calls.push({legacy:id||'new'})};
 const context=vm.createContext(root);vm.runInContext(code,context);
 const fire=(name,event)=>{for(const fn of handlers[name]||[])fn(event);};
 const click=(action,id='',extra={})=>fire('click',{target:{closest:()=>({dataset:{travelAction:action,id,...extra}})}});
 const input=(field,value,type='input')=>fire(type,{type,target:{dataset:{travelField:field},value,hasAttribute:()=>false}});
 const submit=name=>fire('submit',{preventDefault(){},target:{dataset:{travelForm:name}}});
 const state=(patch={})=>root.onUsTravelState({uid:'al',pairId:'pair',sharedReady:true,records:[],pending:[],reactions:[],...patch});
 return {root,section,calls,acks,nav,click,input,submit,state,fire,load(name){vm.runInContext(fs.readFileSync('app/src/main/assets/'+name,'utf8'),context);}};}

module.exports={setup};
