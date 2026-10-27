/* Backend-only fixed-site reader. No hospital session or browser credentials. */
export async function pullJubilee({exportToken,fetcher=fetch,signal}={}){
 if(typeof exportToken!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(exportToken))throw Error('jubilee-export-not-configured');
 const response=await fetcher('https://jubilee-work.alameenashraf.chatgpt.site/api/usspace-export',{redirect:'error',signal:signal||AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+exportToken,Accept:'application/json'}});
 if(!response.ok||Number(response.headers.get('content-length')||0)>196608)throw Error('jubilee-source-unavailable');const reader=response.body?.getReader();if(!reader)throw Error('jubilee-source-unavailable');let size=0;const chunks=[];try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>196608)throw Error('jubilee-source-too-large');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data?.refresh||typeof data.upstreamRefreshedAt!=='string')throw Error('invalid-jubilee-export');const {unresolved,...refresh}=data.refresh;return {refresh,upstreamRefreshedAt:data.upstreamRefreshedAt,unresolved:Number(unresolved)||0};
}
