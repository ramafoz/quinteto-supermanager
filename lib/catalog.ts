export const CATALOG_SEASON='2026/27';
export type CatalogPlayer={ref:string;name:string;shortName:string;club:string;position:string};
export type CatalogPair={acb:CatalogPlayer;rincon:CatalogPlayer;confirmedAt:number;confirmedBy:string};
export type CatalogEntry={player:CatalogPlayer;present:boolean;lastSeenAt:number};
export type CatalogDocument={acb:CatalogEntry[];rincon:CatalogEntry[]};
export type CatalogRow={acb:CatalogPlayer;acbPresent:boolean;acbLastSeenAt:number|null;confirmed:CatalogPair|null;candidate:CatalogPlayer|null;candidates:CatalogPlayer[];status:'confirmed'|'new'|'changed'|'missing'|'pending';notes:string[]};
export type CatalogView={season:string;revision:number;checkedAt:number|null;reviewDue:boolean;rows:CatalogRow[];rincon:CatalogPlayer[];acbCount:number;rinconCount:number;seedOnly:boolean};
export const normalizeName=(s:string)=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/\b(jr|iv|iii)\b/g,'').replace(/[^a-z0-9]/g,'');
const clubs:Record<string,string>={'rio breogan':'BRE','leyma coruna':'COR','monbus obradoiro':'OBR','obradoiro':'OBR','barca':'FCB','fc barcelona':'FCB','real madrid':'RMA','morabanc andorra':'AND','asisa joventut':'JOV','joventut badalona':'JOV','ilerna lleida':'ILE','la laguna tenerife':'CAN','kosner baskonia':'BAS','baskonia':'BAS','surne bilbao':'BLB','surne bilbao basket':'BLB','recoletas salud san pablo burgos':'BUR','kids&us manresa':'MAN','baxi manresa':'MAN','fiatc girona':'GIR','casademont zaragoza':'ZAR','valencia basket':'VBC','ucam murcia':'MUR','unicaja':'UNI'};
export function clubCode(value:string){const plain=value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();return clubs[plain]??value.trim();}
export function candidatesFor(a:CatalogPlayer,rincon:CatalogPlayer[]){return rincon.filter(r=>r.club===a.club&&(normalizeName(r.name)===normalizeName(a.name)||normalizeName(r.shortName)===normalizeName(a.shortName)||normalizeName(r.name)===normalizeName(a.shortName)));}
export function catalogRows(document:CatalogDocument,pairs:CatalogPair[]):CatalogRow[]{
 const accepted=new Map(pairs.map(p=>[p.acb.ref,p]));const observed=new Map(document.acb.map(e=>[e.player.ref,e]));
 for(const p of pairs)if(!observed.has(p.acb.ref))observed.set(p.acb.ref,{player:p.acb,present:false,lastSeenAt:p.confirmedAt});
 const rincon=document.rincon.filter(e=>e.present).map(e=>e.player);
 return [...observed.values()].map(e=>{
  const a=e.player;const confirmed=accepted.get(a.ref)??null;const candidates=candidatesFor(a,rincon);const linked=confirmed?rincon.find(r=>r.ref===confirmed.rincon.ref):undefined;
  const candidate=confirmed?(linked??null):(candidates.length===1?candidates[0]:null);const notes:string[]=[];
  let status:CatalogRow['status']=confirmed?'confirmed':candidate?'new':'pending';
  if(!e.present){status='missing';notes.push('Non aparece no catálogo ACB consultado.');}
  if(confirmed&&!linked){status='missing';notes.push('A referencia confirmada non aparece no broker de Rincón. Non implica unha baixa definitiva.');}
  if(candidate){
   if(a.club!==candidate.club){notes.push('Os clubs non coinciden.');if(status!=='missing')status='changed';}
   if(a.position&&candidate.position&&a.position!==candidate.position){notes.push('As posicións non coinciden.');if(status!=='missing')status='changed';}
  }
  if(confirmed&&linked){
   for(const field of ['name','shortName','club','position'] as const)if(a[field]!==confirmed.acb[field]||linked[field]!==confirmed.rincon[field]){notes.push('Hai cambios de nome, club ou posición desde a confirmación.');if(status!=='missing')status='changed';break;}
  }
  if(!confirmed&&!candidate)notes.push(candidates.length>1?'Hai máis dun candidato. Escolle a correspondencia.':'Sen coincidencia inequívoca. Podes buscar unha correspondencia.');
  if(!a.position)notes.push('ACB non achega unha posición coñecida.');
  return {acb:a,acbPresent:e.present,acbLastSeenAt:e.lastSeenAt||null,confirmed,candidate,candidates,status,notes};
 }).sort((a,b)=>a.acb.name.localeCompare(b.acb.name,'gl'));
}
