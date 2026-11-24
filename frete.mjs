import {cotar} from '../lib/frete.mjs';
const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export default async req=>{if(req.method!=='POST')return response(405,{message:'Método não permitido'});try{return response(200,await cotar(await req.json()));}catch(e){return response(422,{available:false,message:e.message});}};
