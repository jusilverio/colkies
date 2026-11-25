import http from 'node:http';
import {init,db,seedFreight} from './netlify/lib/db.mjs';
import admin from './netlify/functions/admin.mjs';
import loja from './netlify/functions/loja.mjs';
import frete from './netlify/functions/frete.mjs';
import checkout from './netlify/functions/create-checkout.mjs';
import status from './netlify/functions/status-pagamento.mjs';
import webhook from './netlify/functions/webhook-infinitepay.mjs';
import simulation from './netlify/functions/simulation.mjs';
const routes=new Map(Object.entries({simulation,admin,loja,frete,'create-checkout':checkout,'status-pagamento':status,'webhook-infinitepay':webhook}));
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
let ready=false;
async function prepare(){try{await init();const n=await seedFreight();ready=true;console.log('MySQL initialized; CEP count:',n);}catch(e){ready=false;console.error('DB initialization:',e.code||e.name);setTimeout(prepare,10000).unref();}}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/health'){if(!ready)return send(res,503,{ok:false});try{await db().query('SELECT 1');return send(res,200,{ok:true});}catch{return send(res,503,{ok:false});}}
const match=/^\/\.netlify\/functions\/([a-z-]+)$/.exec(url.pathname);const handler=match&&routes.get(match[1]);if(!handler)return send(res,404,{message:'Não encontrado'});if(!ready)return send(res,503,{message:'Banco indisponível.'});
if(match[1]==='admin'&&(!process.env.COOLKIES_ADMIN_PASSWORD||process.env.COOLKIES_ADMIN_PASSWORD.length<20))return send(res,503,{message:'Configure senha administrativa forte (20 caracteres ou mais).'});
if(match[1]==='admin'){const auth=req.headers.authorization||'';if(auth.length>4096)return send(res,401,{message:'Acesso negado'});}
const chunks=[];let len=0;for await(const chunk of req){len+=chunk.length;if(len>20*1024*1024){return send(res,413,{message:'Solicitação muito grande'});}chunks.push(chunk);}
const headers=new Headers();for(const k of ['authorization','content-type'])if(typeof req.headers[k]==='string')headers.set(k,req.headers[k]);const method=req.method||'GET';const body=['GET','HEAD'].includes(method)?undefined:Buffer.concat(chunks);const result=await handler(new Request(url,{method,headers,body}));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
}catch(e){console.error('request:',e.code||e.name);if(!res.headersSent)send(res,500,{message:'Operação não concluída'});else res.end();}});
server.requestTimeout=30000;server.headersTimeout=10000;server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>{console.log('API ready to initialize');prepare();});
