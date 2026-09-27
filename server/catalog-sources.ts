import {AppError} from './errors.ts';
import {CATALOG_SEASON,clubCode,type CatalogPlayer} from '../lib/catalog.ts';
import type {Fetcher} from './acb.ts';
const failure=(message='O formato ou o tamaño do catálogo non é o esperado. Consérvanse os datos anteriores.')=>new AppError(502,'CATALOG_SOURCE',message);
const decode=(s:string)=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;|&#x27;/gi,"'").replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).trim();
export function parseRincon(html:string):CatalogPlayer[]{
 const season=html.match(/<title>[^<]*?(20\d{2}\/\d{2})/i)?.[1];
 if(season!==CATALOG_SEASON)throw failure('Rincón mostra outra tempada ou non permite comprobala. Non se actualizou o catálogo.');
 const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>m[1]).filter(r=>r.includes('pname-full'));
 const players=rows.map(row=>{
  const grab=(re:RegExp)=>{const m=row.match(re);if(!m)throw failure();return decode(m[1]);};
  const ref=grab(/href="\/smgr\/jugador\/([a-z0-9-]+)"/);
  return {ref,name:grab(/class="pname-full">([^<]+)/),shortName:grab(/class="pname-abbr">([^<]+)/),club:grab(/alt="([A-Z]{3})"/),position:grab(/pos-badge[^>]*>([BAP])</)};
 });
 validateCatalog(players);return players;
}
export function validateCatalog(players:CatalogPlayer[]){
 if(players.length<100||players.length>1000||new Set(players.map(p=>p.ref)).size!==players.length||players.some(p=>!p.name||p.name.length>150||!p.club||p.club.length>100))throw failure();
}
export function parseAcbMarket(raw:unknown):CatalogPlayer[]{
 if(!Array.isArray(raw))throw failure();
 return raw.map(p=>{
  if(!p||!/^\d+$/.test(String(p.idPlayer))||Number(p.idPlayer)<=0||typeof p.shortName!=='string'||typeof p.nameTeam!=='string')throw failure();
  return {ref:String(p.idPlayer),name:p.shortName.trim(),shortName:p.shortName.trim(),club:clubCode(p.nameTeam),position:({1:'B',3:'A',5:'P'}[Number(p.position)]??({Base:'B',Alero:'A','Pívot':'P'}[String(p.position)]??''))};
 });
}
async function read(url:string,fetcher:Fetcher,jwt?:string){
 let r:Response;try{r=await fetcher(url,{redirect:'manual',headers:jwt?{Authorization:`Bearer ${jwt}`}:{Accept:'text/html'},signal:AbortSignal.timeout(15000)});}catch{throw failure('Non se puideron consultar os catálogos. Consérvanse os datos anteriores.');}
 if(jwt&&(r.status===401||r.status===403))throw new AppError(409,'RECONNECT','Conecta de novo ACB para actualizar o catálogo.');
 if(!r.ok||r.status>=300)throw failure();
 const reader=r.body?.getReader();if(!reader)throw failure();const chunks:Uint8Array[]=[];let length=0;
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>3000000){await reader.cancel();throw failure();}chunks.push(value);}
 const joined=new Uint8Array(length);let offset=0;for(const c of chunks){joined.set(c,offset);offset+=c.length;}return new TextDecoder().decode(joined);
}
export async function readCatalogSources(jwt:string,fetcher:Fetcher){
 // Never send ACB authorization to Rincón, and never follow token-carrying redirects.
 const rincon=parseRincon(await read('https://www.rincondelmanager.com/smgr/broker.php',fetcher));
 const acb:CatalogPlayer[]=[];const seen=new Set<string>();
 for(let page=1;page<=5;page++){
  const filters=JSON.stringify([{field:'competition.idCompetition',value:1,operator:'=',condition:'AND'},{field:'edition.isActive',value:true,operator:'=',condition:'AND'}]);
  const url=new URL('https://supermanager.acb.com/api/basic/player');url.search=new URLSearchParams({_filters:filters,_page:String(page),_perPage:'300'}).toString();
  let raw:unknown;try{raw=JSON.parse(await read(url.href,fetcher,jwt));}catch(e){if(e instanceof AppError)throw e;throw failure();}
  const batch=parseAcbMarket(raw);for(const p of batch){if(seen.has(p.ref))throw failure('ACB repetiu xogadores entre páxinas. Non se gardou un catálogo incompleto.');seen.add(p.ref);acb.push(p);}
  if(batch.length<300){validateCatalog(acb);return {acb,rincon};}
 }
 throw failure();
}
