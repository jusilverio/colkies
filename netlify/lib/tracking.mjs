import {randomBytes,createHash} from 'node:crypto';
import {db,transaction,parse} from './db.mjs';
import {uuid} from './payment-api.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
export async function issueTracking(id,tx){
 if(!uuid(id)||typeof tx!=='string'||!tx||tx.length>200)return null;
 return transaction(async c=>{
 const [[r]]=await c.execute("SELECT o.id FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=? AND BINARY p.transaction_id=BINARY ? AND o.payment_status='paid' FOR UPDATE",[id,tx]);
 if(!r)return null;
 // A fresh bearer credential on each verified payment return, without invalidating saved links.
 const token=randomBytes(32).toString('base64url');
 await c.execute('INSERT INTO tracking_tokens(token_hash,order_id) VALUES (?,?)',[hash(token),id]);return token;
 });
}
export async function lookupTracking(token){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
 const [[r]]=await db().execute("SELECT o.id,o.snapshot,o.total_cents,o.delivery_day,o.delivery_hour,o.payment_status,o.operational_status FROM tracking_tokens t JOIN orders o ON o.id=t.order_id WHERE t.token_hash=?",[hash(token)]);
 if(!r||r.payment_status!=='paid')return null;
 const s=parse(r.snapshot);
 return {reference:r.id.slice(0,8).toUpperCase(),status:r.operational_status,total_cents:r.total_cents,date:r.delivery_day,time:r.delivery_hour,items:s.items.map(i=>({description:i.description,quantity:i.quantity,price:i.price}))};
}
