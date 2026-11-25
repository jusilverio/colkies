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
 if(page==='index.html')data=activateCheckout(data.toString('utf8'));
 res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8'});res.end(method==='HEAD'?undefined:data);
 }catch(e){if(!res.headersSent)json(res,502,'Serviço temporariamente indisponível');else res.end();}});
server.requestTimeout=35000;server.headersTimeout=10000;server.listen(Number(process.env.PORT||8080),'0.0.0.0');

function activateCheckout(html){const patches=[["async function loadShop(){return;try{","async function loadShop(){try{"],["({...p,p:p.p/100,c:AVULSOS[i]?.c","({...AVULSOS[i],...p,p:p.p/100,c:AVULSOS[i]?.c"],["if(false){try{var rr=await fetch","if(true){try{var rr=await fetch"],["var local=true; var json;","var local=false; var json;"],["embalagem:checkoutMode==='presente'?selectedPackaging():null","embalagem:checkoutMode==='presente'?selectedPackaging()[0]:null"],["$('ckPay').disabled=false;\n  quotedFingerprint","$('ckPay').disabled=!json.payments_enabled;\n  if(!json.payments_enabled)$('ckStatus').textContent+=' Pagamento indisponível no momento.';\n  quotedFingerprint"],["id=\"ckPay\" type=\"button\">Simular pagamento","id=\"ckPay\" type=\"button\">Pagar com InfinitePay"],["if(mode===\"presente\" && (!giftCapacity()","if(mode==='presente' && selectedPackaging().length!==1){alert('Por enquanto, finalize um presente por embalagem.');return;}\n if(mode===\"presente\" && (!giftCapacity()"]];for(const [before,after] of patches){if(!html.includes(before))throw Error('Checkout patch mismatch');html=html.replace(before,after);}const start=html.indexOf("$('ckPay').addEventListener('click',function(){");const end=html.indexOf("\nupdateGiftPacks();",start);if(start<0||end<0)throw Error('Missing checkout handler');return html.slice(0,start)+"$('ckPay').addEventListener('click',async function(){\n if(quotedFingerprint!==checkoutFingerprint()){ $('ckStatus').textContent='Verifique o frete novamente.';return;}\n var d=deliveryForm(),slot=selectedDelivery();\n if(!d.name||!d.email.includes('@')||d.phone.replace(/\\D/g,'').length<10||!slot){$('ckStatus').textContent='Confira nome, e-mail, telefone e horário.';return;}\n if(!checkoutRequestId||!lastTotalCents)return;\n $('ckPay').disabled=true;$('ckStatus').textContent='Gerando link seguro de pagamento...';\n try{\n const resp=await fetch('/.netlify/functions/create-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:checkoutRequestId,tipo:checkoutMode,cliente:d,agendamento:slot,items:checkoutLines(checkoutMode).map(x=>({id:x.id,quantity:x.quantity})),embalagem:checkoutMode==='presente'?selectedPackaging()[0]:null,presente:{para:$('giftTo').value,de:$('giftFrom').value,mensagem:$('giftMessage').value},total_esperado_cents:lastTotalCents})});\n const j=await resp.json();if(!resp.ok)throw Error(j.message||'Pagamento indisponível.');\n const u=new URL(j.url);if(u.protocol!=='https:'||!['checkout.infinitepay.com.br','checkout.infinitepay.io','buy.infinitepay.io'].includes(u.hostname))throw Error('Link de pagamento inválido.');\n location.assign(u.href);\n }catch(e){$('ckStatus').textContent=e.message||'Não foi possível iniciar o pagamento. Confira o pedido antes de tentar novamente.';}\n});"+html.slice(end);}
