import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
const origin='https://coolkies-api-production.up.railway.app';
const pages=new Map([['/','index.html'],['/index.html','index.html'],['/admin.html','admin.html'],['/obrigado.html','obrigado.html'],['/acompanhar.html','acompanhar.html'],['/simulation.html','simulation.html']]);
const routes=new Set(['admin','loja','frete','create-checkout','status-pagamento','webhook-infinitepay','simulation','acompanhamento']);
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json=(res,status,message)=>{res.writeHead(status,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify({message}));};
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost'),method=req.method||'GET';
 if(u.pathname==='/health'){res.writeHead(200,headers);return res.end('ok');}
 const m=/^\/\.netlify\/functions\/([a-z-]+)$/.exec(u.pathname);
 if(m&&routes.has(m[1])){
 if(!['GET','HEAD','POST'].includes(method))return json(res,405,'Método inválido');
 const limit=m[1]==='admin'?20*1024*1024:64000;let size=0;const chunks=[];
 if(method==='POST')for await(const chunk of req){size+=chunk.length;if(size>limit)return json(res,413,'Solicitação muito grande');chunks.push(chunk);}
 const h={};for(const k of ['authorization','content-type'])if(typeof req.headers[k]==='string')h[k]=req.headers[k];
 const upstream=await fetch(origin+u.pathname+u.search,{method,headers:h,body:method==='POST'?Buffer.concat(chunks):undefined,redirect:'manual',signal:AbortSignal.timeout(25000)});
 res.writeHead(upstream.status,{...headers,'Content-Type':upstream.headers.get('content-type')||'application/json'});
 if(method==='HEAD'||!upstream.body)return res.end();Readable.fromWeb(upstream.body).pipe(res);return;
 }
 const page=pages.get(u.pathname);
 if(!page||!['GET','HEAD'].includes(method))return json(res,404,'Página não encontrada');
 let data;try{data=await readFile(new URL('./public/'+page,import.meta.url));}catch{return json(res,404,'Página ainda indisponível');}
 res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8'});res.end(method==='HEAD'?undefined:data);
 }catch(e){if(!res.headersSent)json(res,502,'Serviço temporariamente indisponível');else res.end();}});
server.requestTimeout=35000;server.headersTimeout=10000;server.listen(Number(process.env.PORT||8080),'0.0.0.0');
