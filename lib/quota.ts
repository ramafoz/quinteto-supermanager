import type {Player} from './model.ts';
const aliases=new Map([
 ['rio breogan','Río Breogán'],['breogan','Río Breogán'],['cb breogan','Río Breogán'],
 ['leyma coruna','Leyma Coruña'],['leyma basquet coruna','Leyma Coruña'],['basquet coruna','Leyma Coruña'],
 ['obradoiro','Obradoiro'],['monbus obradoiro','Obradoiro'],['obradoiro cab','Obradoiro'],
]);
export function galicianClub(value:string|undefined){return value?aliases.get(value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.]/g,'').replace(/\s+/g,' ').trim())??null:null;}
export function quota(players:Player[]){
 const count=new Set(players.filter(p=>galicianClub(p.club)).map(p=>p.id)).size;
 const unknown=players.filter(p=>!p.club).length;
 return {count,required:2,status:count>=2?'valid':unknown?'unknown':'invalid'} as {count:number;required:number;status:'valid'|'unknown'|'invalid'};
}
