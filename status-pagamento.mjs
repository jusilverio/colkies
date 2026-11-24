import {reply} from '../lib/rules.mjs';import {verify} from '../lib/verify-payment.mjs';
export default async req=>{if(req.method!=='GET')return reply(405,{});try{return reply(200,await verify(Object.fromEntries(new URL(req.url).searchParams)));}catch{return reply(400,{pago:false});}};
