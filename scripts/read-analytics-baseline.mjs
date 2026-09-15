// Read-only. Credentials come only from the agent environment.
const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;
if(!url||!token){console.log(JSON.stringify({configured:false,baseline:'não confirmei',reason:'env Upstash ausentes no agente'}));process.exitCode=2;}
else{
 const day=process.argv[2]||new Date().toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error('Data inválida');
 const key='an:visit:'+day;
 const r=await fetch(url.replace(/\/$/,'')+'/get/'+encodeURIComponent(key),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('Upstash GET HTTP '+r.status);
 const body=await r.json();if(body.error)throw new Error('Upstash retornou erro');
 console.log(JSON.stringify({http:r.status,key,value:body.result,baselineExists:body.result!==null}));
}
