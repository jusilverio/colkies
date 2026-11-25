import mysql from 'mysql2/promise';
import cepData from './cep-data.json' with {type:'json'};
import {AsyncLocalStorage} from 'node:async_hooks';
const scope=new AsyncLocalStorage();
const pools=new Map(), initialized=new Map();
const sandbox=()=>scope.getStore()===true;
export const inSandbox=fn=>scope.run(true,fn);
export async function createSandbox(){if(sandbox())throw Error('Invalid scope');await db().query('CREATE DATABASE IF NOT EXISTS `coolkies_simulation` CHARACTER SET utf8mb4');return inSandbox(async()=>{await init();return seedFreight();});}

export function db(){
 const key=sandbox();if(!pools.has(key)){const u=new URL(process.env.DATABASE_URL||'');if(u.protocol!=='mysql:')throw Error('DATABASE_URL inválida');
 const pool=mysql.createPool({host:u.hostname,port:Number(u.port||3306),user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:key?'coolkies_simulation':decodeURIComponent(u.pathname.slice(1)),...(process.env.RAILWAY_PRIVATE_DB==='true'&&process.env.RAILWAY_ENVIRONMENT_ID&&u.hostname.endsWith('.railway.internal')?{}:{ssl:{rejectUnauthorized:true,...(process.env.MYSQL_SSL_CA?{ca:process.env.MYSQL_SSL_CA.replace(/\\n/g,'\n')}:{})}}),connectionLimit:2,connectTimeout:7000,dateStrings:true,timezone:'Z',multipleStatements:false});pools.set(key,pool);}return pools.get(key);
}
export const initialProducts=[['The OG',1400,''],['Dark Side',1600,''],['Nutella Crush',1900,''],['Caramel Affair',1900,''],['Kinder Crush',2200,''],["S'more Christmas Please",2300,'Chocolate, marshmallow e biscoito crocante.'],['Orange You Sweet?',2300,'Laranja e caramelo salgado.'],['Ginger Bells',2300,'Especiarias natalinas.']].map(([n,p,d],id)=>({id,n,p,d,tag:id<5?'Clássicos':'Especial de Natal',active:true,img:''}));
export const defaults={products:initialProducts,capacity:5,daily:60,blocked:[],rates:Array.from({length:15},(_,i)=>800+200*i),faixas:[]};
export const parse=x=>typeof x==='string'?JSON.parse(x):x;
export async function init(){const key=sandbox();if(!initialized.has(key))initialized.set(key,setup().catch(e=>{initialized.delete(key);throw e}));return initialized.get(key);}
async function setup(){const p=db();
 await p.query(`CREATE TABLE IF NOT EXISTS store_settings (id INT PRIMARY KEY, config JSON NOT NULL) ENGINE=InnoDB`);
 await p.query(`CREATE TABLE IF NOT EXISTS delivery_days (day DATE PRIMARY KEY) ENGINE=InnoDB`);
 await p.query(`CREATE TABLE IF NOT EXISTS customers (id BIGINT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE, name VARCHAR(150) NOT NULL, phone VARCHAR(30) NOT NULL, created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6)) ENGINE=InnoDB`);
 await p.query(`CREATE TABLE IF NOT EXISTS orders (id CHAR(36) PRIMARY KEY, customer_id BIGINT NOT NULL, delivery_day DATE NOT NULL, delivery_hour CHAR(5) NOT NULL, units INT NOT NULL, total_cents INT NOT NULL, payment_status VARCHAR(20) NOT NULL, operational_status VARCHAR(30) NOT NULL DEFAULT 'recebido', expires_at DATETIME(6) NOT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), snapshot JSON NOT NULL, INDEX day_idx(delivery_day,delivery_hour), FOREIGN KEY(customer_id) REFERENCES customers(id)) ENGINE=InnoDB`);
 await p.query(`CREATE TABLE IF NOT EXISTS payments (transaction_id VARCHAR(200) PRIMARY KEY, order_id CHAR(36) NOT NULL UNIQUE, amount_cents INT NOT NULL, confirmed_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6), FOREIGN KEY(order_id) REFERENCES orders(id)) ENGINE=InnoDB`);
 await p.query(`CREATE TABLE IF NOT EXISTS freight_ceps (cep CHAR(8) PRIMARY KEY, estimated_km DECIMAL(10,6) NOT NULL, band TINYINT NOT NULL) ENGINE=InnoDB`);
 await p.query(`CREATE TABLE IF NOT EXISTS checkout_links (order_id CHAR(36) PRIMARY KEY, url VARCHAR(2048) NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id)) ENGINE=InnoDB`);
 await p.query(`CREATE TABLE IF NOT EXISTS migrations (id VARCHAR(80) PRIMARY KEY) ENGINE=InnoDB`);
 await p.query(`CREATE TABLE IF NOT EXISTS admin_audit (id BIGINT AUTO_INCREMENT PRIMARY KEY, action VARCHAR(40) NOT NULL, target VARCHAR(64) NOT NULL DEFAULT '', created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6)) ENGINE=InnoDB`);
 await p.query(`CREATE TABLE IF NOT EXISTS tracking_tokens (token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, order_id CHAR(36) NOT NULL, created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6), FOREIGN KEY(order_id) REFERENCES orders(id)) ENGINE=InnoDB`);
 await p.execute('INSERT IGNORE INTO store_settings(id,config) VALUES (1,?)',[JSON.stringify(defaults)]);
}
export async function settings(c=db(),lock=false){const [[r]]=await c.query('SELECT config FROM store_settings WHERE id=1'+(lock?' FOR UPDATE':''));return parse(r.config);}
export async function transaction(fn){await init();const c=await db().getConnection();try{await c.beginTransaction();const x=await fn(c);await c.commit();return x;}catch(e){await c.rollback();throw e;}finally{c.release();}}
export async function seedFreight(){await init();return transaction(async c=>{await settings(c,true);const [[r]]=await c.execute('SELECT id FROM migrations WHERE id=?',['cep-v1']);if(!r){const data=cepData;const rows=Object.entries(data).map(([cep,[km,band]])=>[cep,km,band]);for(let i=0;i<rows.length;i+=1000)await c.query('INSERT IGNORE INTO freight_ceps(cep,estimated_km,band) VALUES ?',[rows.slice(i,i+1000)]);await c.execute('INSERT INTO migrations(id) VALUES (?)',['cep-v1']);}const [[n]]=await c.query('SELECT COUNT(*) AS n FROM freight_ceps');return n.n;});}
