const enc=new TextEncoder();
const rot=(x,n)=>(x<<n)|(x>>>(32-n));
function salsa(b,x){x.set(b);for(let i=0;i<8;i+=2){
x[4]^=rot(x[0]+x[12],7);x[8]^=rot(x[4]+x[0],9);x[12]^=rot(x[8]+x[4],13);x[0]^=rot(x[12]+x[8],18);
x[9]^=rot(x[5]+x[1],7);x[13]^=rot(x[9]+x[5],9);x[1]^=rot(x[13]+x[9],13);x[5]^=rot(x[1]+x[13],18);
x[14]^=rot(x[10]+x[6],7);x[2]^=rot(x[14]+x[10],9);x[6]^=rot(x[2]+x[14],13);x[10]^=rot(x[6]+x[2],18);
x[3]^=rot(x[15]+x[11],7);x[7]^=rot(x[3]+x[15],9);x[11]^=rot(x[7]+x[3],13);x[15]^=rot(x[11]+x[7],18);
x[1]^=rot(x[0]+x[3],7);x[2]^=rot(x[1]+x[0],9);x[3]^=rot(x[2]+x[1],13);x[0]^=rot(x[3]+x[2],18);
x[6]^=rot(x[5]+x[4],7);x[7]^=rot(x[6]+x[5],9);x[4]^=rot(x[7]+x[6],13);x[5]^=rot(x[4]+x[7],18);
x[11]^=rot(x[10]+x[9],7);x[8]^=rot(x[11]+x[10],9);x[9]^=rot(x[8]+x[11],13);x[10]^=rot(x[9]+x[8],18);
x[12]^=rot(x[15]+x[14],7);x[13]^=rot(x[12]+x[15],9);x[14]^=rot(x[13]+x[12],13);x[15]^=rot(x[14]+x[13],18);}
for(let j=0;j<16;j++)b[j]+=x[j];}
export async function derive(pass,salt,N=32768,r=8){
const k=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveBits']);
const pb=async(s,n)=>new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:s,iterations:1},k,n*8));
const B=await pb(salt,128*r),w=32*r,X=new Uint32Array(w),V=new Uint32Array(N*w),Y=new Uint32Array(w),T=new Uint32Array(16),S=new Uint32Array(16),dv=new DataView(B.buffer);
for(let j=0;j<w;j++)X[j]=dv.getUint32(j*4,true);
function mix(){T.set(X.subarray(w-16));for(let i=0;i<2*r;i++){for(let j=0;j<16;j++)T[j]^=X[i*16+j];salsa(T,S);Y.set(T,(i%2*r+Math.floor(i/2))*16);}X.set(Y);}
try{for(let i=0;i<N;i++){V.set(X,i*w);mix();if(i%1024===0)await new Promise(r=>setTimeout(r,0));}
for(let i=0;i<N;i++){const j=(X[w-16]&(N-1))*w;for(let z=0;z<w;z++)X[z]^=V[j+z];mix();if(i%1024===0)await new Promise(r=>setTimeout(r,0));}
for(let j=0;j<w;j++)dv.setUint32(j*4,X[j],true);return await pb(B,32);
}finally{V.fill(0);X.fill(0);Y.fill(0);T.fill(0);S.fill(0);B.fill(0);}}
const bytes=(s,n)=>{if(typeof s!=='string'||s.length>32*1024*1024)throw Error('Formato inválido');const b=Uint8Array.from(atob(s),c=>c.charCodeAt(0));if(n!==undefined&&b.length!==n)throw Error('Formato inválido');return b;};
const tables=['store_settings','delivery_days','customers','orders','payments','freight_ceps','checkout_links','migrations','admin_audit'];
export async function verifyBackup(e,pass){if(e.format!=='coolkies-backup-v1'||e.kdf!=='scrypt'||e.N!==32768||e.r!==8||e.p!==1)throw Error('Formato de backup não reconhecido.');
const salt=bytes(e.salt,32),iv=bytes(e.iv,12),tag=bytes(e.tag,16),ct=bytes(e.ciphertext),combined=new Uint8Array(ct.length+16);combined.set(ct);combined.set(tag,ct.length);
const key=await derive(pass,salt);let plain;try{const k=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['decrypt']);plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:enc.encode('coolkies-backup-v1'),tagLength:128},k,combined);}catch{throw Error('Frase incorreta ou arquivo alterado/corrompido.');}finally{key.fill(0);}
const reader=new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let total=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>22*1024*1024)throw Error('Backup excede limite de descompressão.');chunks.push(value);}}finally{await reader.cancel();}
const data=JSON.parse(await new Blob(chunks).text());if(data.format!=='coolkies-logical-v1'||!Number.isFinite(Date.parse(data.created_at))||!data.tables||tables.some(t=>!Array.isArray(data.tables[t])||data.tables[t].some(r=>!r||typeof r!=='object'||Array.isArray(r))))throw Error('Estrutura interna inválida.');
const cfg=data.tables.store_settings.find(r=>r.id===1);if(!cfg)throw Error('Configuração da loja ausente.');const config=typeof cfg.config==='string'?JSON.parse(cfg.config):cfg.config;if(!Array.isArray(config?.products))throw Error('Produtos ausentes.');
return {date:data.created_at,products:config.products.length,counts:Object.fromEntries([...tables,...(Array.isArray(data.tables.tracking_tokens)?['tracking_tokens']:[])].map(t=>[t,data.tables[t].length]))};}
if(typeof document!=='undefined'){const $=id=>document.getElementById(id);$('verify').onclick=async()=>{const f=$('verifyFile').files[0],p=$('verifyPhrase').value,out=$('verifyResult');if(!f||!p){out.textContent='Selecione o arquivo e informe a frase.';return;}if(f.size>32*1024*1024){out.textContent='Arquivo acima do limite.';return;}$('verify').disabled=true;$('verifyPhrase').value='';out.textContent='Verificando localmente…';try{const r=await verifyBackup(JSON.parse(await f.text()),p);out.textContent='Integridade criptográfica confirmada.\nData: '+r.date+'\nProdutos: '+r.products+'\n'+Object.entries(r.counts).map(([k,v])=>k+': '+v).join('\n')+'\nNenhum dado foi restaurado.';}catch(e){out.textContent='Falha: '+e.message;}finally{$('verify').disabled=false;}};}
