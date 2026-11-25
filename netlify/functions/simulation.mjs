import {createHash,timingSafeEqual,randomUUID} from 'node:crypto';
import {db,settings,transaction,inSandbox,createSandbox,parse} from '../lib/db.mjs';
import {reserve,confirmVerified} from '../lib/orders.mjs';
import {cotar} from '../lib/frete.mjs';
import {reply,horarioValido} from '../lib/rules.mjs';
const hash=x=>createHash('sha256').update(x).digest();
let ready;
const initSim=()=>ready??=createSandbox().catch(e=>{ready=null;throw e;});
const states=['recebido','em produção','pronto','em entrega','entregue'];
export default async req=>{
if(req.method!=='POST')return reply(405,{message:'Método inválido'});
const secret=process.env.COOLKIES_ADMIN_PASSWORD;
if(!secret||secret.length<20||!timingSafeEqual(hash((req.headers.get('authorization')||'').replace(/^Bearer /,'')),hash(secret)))return reply(401,{message:'Acesso negado'});
try{
const b=await req.json();await initSim();
const real=await settings();
return await inSandbox(async()=>{
switch(b.action){
case 'config':{const cfg=await settings();const [ceps]=await db().query('SELECT MIN(cep) cep,band FROM freight_ceps GROUP BY band ORDER BY band');return reply(200,{products:cfg.products.filter(p=>p.active).map(({id,n,p})=>({id,n,p})),capacity:cfg.capacity,daily:cfg.daily,blocked:cfg.blocked,ceps});}
case 'sync':{await transaction(async c=>{await settings(c,true);await c.execute('UPDATE store_settings SET config=? WHERE id=1',[JSON.stringify(real)]);});return reply(200,{ok:true});}
case 'create':{const cfg=await settings();const p=cfg.products[b.product];if(!Number.isInteger(b.product)||!p?.active||!Number.isInteger(b.quantity)||b.quantity<1||b.quantity>cfg.daily)throw Error('Produto ou quantidade inválida');const id=randomUUID(),cliente={name:'Cliente de teste '+id.slice(0,8),email:id+'@example.invalid',phone:'11000000000',street:'Rua fictícia',number:'1',neighborhood:'Bairro fictício',city:'São Paulo',state:'SP',cep:String(b.cep||'')};const f=await cotar({tipo:'avulso',entrega:cliente},null,cfg);const o=await reserve({request_id:id,tipo:'avulso',cliente,agendamento:{date:b.date,time:b.time},items:[{id:b.product,quantity:b.quantity}],total_esperado_cents:p.p*b.quantity+f.shipping_cents});return reply(200,{order:o});}
case 'payment':{if(!['approved','declined','expired'].includes(b.outcome))throw Error('Resultado inválido');if(b.outcome==='approved'){const [[o]]=await db().execute('SELECT total_cents,payment_status FROM orders WHERE id=?',[b.id]);if(!o||!['awaiting','expired','paid','late_paid'].includes(o.payment_status))throw Error('Pedido não elegível');return reply(200,{status:await confirmVerified(b.id,'sim-'+b.id,o.total_cents)});}const [r]=await db().execute("UPDATE orders SET payment_status=?, expires_at=UTC_TIMESTAMP(6) WHERE id=? AND payment_status='awaiting'",[b.outcome,b.id]);if(!r.affectedRows)throw Error('Pedido não está aguardando');return reply(200,{ok:true});}
case 'stage':{const i=states.indexOf(b.status);if(i<1)throw Error('Etapa inválida');const [r]=await db().execute("UPDATE orders SET operational_status=? WHERE id=? AND payment_status='paid' AND operational_status=?",[b.status,b.id,states[i-1]]);if(!r.affectedRows)throw Error('Avance uma etapa por vez; pagamento aprovado necessário');return reply(200,{ok:true});}
case 'list':{const [rows]=await db().query('SELECT id,snapshot,payment_status,operational_status,expires_at,expires_at<=UTC_TIMESTAMP(6) expired FROM orders ORDER BY created_at DESC LIMIT 200');const [[n]]=await db().query('SELECT COUNT(*) n FROM customers');return reply(200,{customers:n.n,orders:rows.map(r=>({...parse(r.snapshot),status:r.payment_status==='awaiting'&&r.expired?'expired':r.payment_status,stage:r.operational_status}))});}
case 'reset':{await transaction(async c=>{await settings(c,true);for(const t of ['checkout_links','payments','orders','customers','delivery_days'])await c.query('DELETE FROM '+t);});return reply(200,{ok:true});}
default:return reply(400,{message:'Ação inválida'});
}});}catch(e){console.error('simulation',e.code||e.name);return reply(400,{message:e.code?'Falha no ambiente de teste: '+String(e.code).replace(/[^A-Z_0-9]/g,''):e.message||'Falha no teste'});}
};
