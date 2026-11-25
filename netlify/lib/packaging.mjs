// Legacy single packaging remains accepted for the old storefront.
export function packaging(tipo, value, units){
 if(tipo!=='presente')return {caixas:0,latas:0,cents:0};
 if(typeof value==='string'){
  if(!['caixa','lata'].includes(value))throw Error('Selecione a embalagem.');
  return {caixas:Number(value==='caixa'),latas:Number(value==='lata'),cents:value==='caixa'?800:1500,legacy:true};
 }
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Selecione a embalagem.');
 const {caixas=0,latas=0}=value;
 if(![caixas,latas].every(n=>Number.isInteger(n)&&n>=0&&n<=15)||caixas+latas===0)throw Error('Quantidade de embalagens inválida.');
 if(!Number.isInteger(units)||units!==4*caixas+6*latas)throw Error('Cada caixa contém 4 cookies e cada lata contém 6.');
 return {caixas,latas,cents:800*caixas+1500*latas};
}
