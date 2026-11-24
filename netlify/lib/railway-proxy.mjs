const origin='https://coolkies-api-production.up.railway.app';
const reply=(status,message)=>new Response(JSON.stringify({message}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function forward(req,route){
try{const url=new URL('/.netlify/functions/'+route,origin);url.search=new URL(req.url).search;
const headers=new Headers();for(const k of ['content-type','authorization']){const v=req.headers.get(k);if(v)headers.set(k,v);}
const method=req.method;const body=['GET','HEAD'].includes(method)?undefined:await req.arrayBuffer();if(body&&body.byteLength>20*1024*1024)return reply(413,'Solicitação muito grande');
const r=await fetch(url,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(20000)});
return new Response(await r.arrayBuffer(),{status:r.status,headers:{'Content-Type':r.headers.get('content-type')||'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){console.error('railway proxy',e.name);return reply(503,'Servidor Coolkies temporariamente indisponível.');}}
