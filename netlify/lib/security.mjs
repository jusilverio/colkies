import {createHash,timingSafeEqual} from 'node:crypto';
const digest=s=>createHash('sha256').update(s).digest();
export function authorized(header,secret){return typeof secret==='string'&&secret.length>=20&&typeof header==='string'&&header.startsWith('Bearer ')&&header.length<=4096&&timingSafeEqual(digest(header.slice(7)),digest(secret));}
const windows=new Map();
export function allowed(key,limit,period,now=Date.now()){if(windows.size>=10000){for(const [k,v] of windows)if(v.until<=now)windows.delete(k);if(windows.size>=10000&&!windows.has(key))return false;}let v=windows.get(key);if(!v||v.until<=now){v={until:now+period,count:0};windows.set(key,v);}return ++v.count<=limit;}
