/* Preserve a pending Android file selection across background list refreshes. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root&&root.document)api.mount(root);})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function createGate(schedule=setTimeout,unschedule=clearTimeout){
 let input=null,scope='',render=null,timer=null;
 function cancel(){if(timer!==null)unschedule(timer);timer=null;input=null;scope='';render=null;}
 function finish(){const callback=render;cancel();if(callback)schedule(callback,0);}
 return {
  open(node,value){cancel();input=node;scope=value;},
  defer(value,callback){if(!input)return false;if(value!==scope||input.isConnected===false){cancel();return false;}render=callback;return true;},
  changed(node){if(input===node)finish();},
  result(selected){if(!input)return;if(!selected){finish();return;}if(timer!==null)unschedule(timer);timer=schedule(finish,5000);},
  invalidate:cancel
 };
}
function mount(root){
 const doc=root.document,gate=createGate(root.setTimeout.bind(root),root.clearTimeout.bind(root));
 function scope(){const m=root.UsExtras?.get()||{},t=root.UsTravel?.get()||{};return [m.uid||'',m.coupleId||'',t.uid||'',t.pairId||''].join('|');}
 doc.addEventListener('click',event=>{const input=event.target?.closest?.('input[type="file"]');if(input?.closest?.('#bucket'))gate.open(input,scope());},true);
 doc.addEventListener('change',event=>gate.changed(event.target),true);
 doc.addEventListener('cancel',event=>gate.changed(event.target),true);
 root.UsFilePicker={defer(callback){return gate.defer(scope(),callback);},result:selected=>gate.result(selected),invalidate:gate.invalidate};
}
return {createGate,mount};
});
