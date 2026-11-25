import {randomBytes,scrypt,createCipheriv} from 'node:crypto';
import {promisify} from 'node:util';
import {gzip} from 'node:zlib';
import {db,init} from './db.mjs';
const derive=promisify(scrypt),zip=promisify(gzip);
const tables=['store_settings','delivery_days','customers','orders','payments','freight_ceps','checkout_links','migrations','admin_audit','tracking_tokens','club_members','club_cycles','finance_settings','club_benefits'];
let busy=false;
export async function backup(pass){
 if(typeof pass!=='string'||pass.length<24||pass.length>256)throw Error('Use uma frase de recuperação com pelo menos 24 caracteres.');
 if(busy)throw Error('Já existe um backup em andamento.');
 busy=true;
 try{
 await init();const c=await db().getConnection();const data={format:'coolkies-logical-v1',created_at:new Date().toISOString(),tables:{}};
 try{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
 let bytes=0;
 for(const t of tables){const [rows]=await c.query('SELECT * FROM `'+t+'` LIMIT 100001');if(rows.length>100000)throw Error('Backup excede o limite; migre para exportação em fluxo.');const serialized=JSON.stringify(rows);bytes+=Buffer.byteLength(serialized);if(bytes>20*1024*1024)throw Error('Backup excede o limite de 20 MB.');data.tables[t]=rows;}
 await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();}
 const salt=randomBytes(32),iv=randomBytes(12),key=await derive(pass,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('coolkies-backup-v1'));
 const plain=await zip(Buffer.from(JSON.stringify(data)));const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);key.fill(0);
 const envelope={format:'coolkies-backup-v1',kdf:'scrypt',N:32768,r:8,p:1,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')};
 await db().execute('INSERT INTO admin_audit(action) VALUES (?)',['backup-generated']);
 return envelope;
 }finally{busy=false;}
}
