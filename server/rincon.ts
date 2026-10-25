import {AppError} from './errors.ts';
import {CATALOG_SEASON,normalizeName,type CatalogPair} from '../lib/catalog.ts';
import {parseRincon} from './catalog-sources.ts';
import type {Fetcher} from './acb.ts';
import type {ObservationState} from '../lib/model.ts';
import {explicitMatchState,parseCalendarStates} from './rincon-match-state.ts';
import {excludedFromSuperManager} from '../lib/supermanager-rules.ts';
export const LIVE_URL='https://www.rincondelmanager.com/smgr/directo.php';
export const CALENDAR_URL='https://www.rincondelmanager.com/smgr/calendario.php';
export const BROKER_URL='https://www.rincondelmanager.com/smgr/broker.php';
export type RinconScore=ObservationState&{noChangesScores?:RinconScore[];pointsFinal?:boolean;id:string;points:number|null;valuation:number|null;broker:number|null;brokerOpening:number|null;brokerDelta:number|null;brokerKind:'opening'|'provisional'|'final'|null;playing:boolean;source:'rincon';sourceUrl:string;season:string;journey:number;observedAt:number;didNotPlay?:boolean;stale?:boolean;brokerStale?:boolean};
const fail=()=>new AppError(502,'RINCON_SOURCE','Rincón non ofrece datos verificables desta xornada. Conservamos os datos anteriores.');
const decode=(s:string)=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;|&#x27;/gi,"'").replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).trim();
const plain=(s:string)=>decode(s.replace(/<[^>]*>/g,'')).trim();
const numeric=(sort:string|undefined,visible:string)=>{
 if(/^[—–−-]$/.test(plain(visible)))return null;
 if(!sort||!/^[-+]?\d+(?:\.\d+)?$/.test(sort))throw fail();
 const n=Number(sort);if(!Number.isFinite(n))throw fail();return n;
};
export function parseLive(html:string){
 const journey=Number(html.match(/<h1>Todos los jugadores\s*·\s*J(\d+)<\/h1>/)?.[1]);
 if(!Number.isInteger(journey)||journey<1||journey>50||!html.includes('data-imgs-temp="202627"'))throw fail();
 const states=new Map<string,string>();
 for(const chip of html.matchAll(/<button\b[^>]*class="dj-chip[^>]*data-dj-match="(\d+)"[^>]*>([\s\S]*?)<\/button>/g))states.set(chip[1],plain(chip[2].match(/class="dj-chip__est">([\s\S]*?)<\/span>/)?.[1]??''));
 const rows=[...html.matchAll(/<tr\b[^>]*data-dj-row[^>]*data-dj-match="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>{
  const row=m[2],name=row.match(/data-player-name="([^"]+)"/)?.[1],club=row.match(/data-player-team="([A-Z]{3})"/)?.[1];
  const number=Number(row.match(/data-player-jor="(\d+)"/)?.[1]);
  const cells=[...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)];
  if(!name||!club||number!==journey||cells.length!==11||!states.has(m[1])||!row.includes(`/imgs/202627/${club}_b.gif`))throw fail();
  const value=(i:number)=>numeric(cells[i][1].match(/data-sort="([^"]*)"/)?.[1],cells[i][2]);
  const points=value(3),delta=value(4),valuation=value(10),minutes=value(5);
  const stats=[6,7,8,9,10].map(value);
  const noMinutes=minutes===0&&stats.every(n=>n===0)&&/^0(?:\/0)?$/.test(plain(cells[9][2]));
  if(points!==null&&(points < -100||points>200)||delta!==null&&Math.abs(delta)>10000000)throw fail();
  const matchState=explicitMatchState(states.get(m[1])??'');
  return {name:decode(name),club,points,delta,valuation,minutes,noMinutes,matchId:m[1],matchState,final:matchState==='final',playing:matchState==='live'};
 });
 const count=Number(html.match(/data-dj-count[^>]*>(\d+) jugadores/)?.[1]);
 if(rows.length!==count||rows.length>1000||new Set(rows.map(r=>normalizeName(r.name)+'|'+r.club)).size!==rows.length)throw fail();
 const clubs=new Map<string,string>();for(const row of rows){if(clubs.has(row.club)&&clubs.get(row.club)!==row.matchId)throw fail();clubs.set(row.club,row.matchId);}
 return {journey,rows};
}
export function parseBroker(html:string){
 const catalog=parseRincon(html);const journey=Number(html.match(/Tablas broker\s*·\s*J(\d+)/)?.[1]);
 if(!Number.isInteger(journey)||journey<1||journey>50)throw fail();
 const prices=new Map<string,number>();
 for(const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)){
  const ref=row[1].match(/href="\/smgr\/jugador\/([a-z0-9-]+)"/)?.[1];if(!ref)continue;
  const price=Number(row[1].match(/<td class="r num" data-sort="(\d+)"><strong>/)?.[1]);
  if(!Number.isSafeInteger(price)||price<=0||price>10000000||prices.has(ref))throw fail();prices.set(ref,price);
 }
 if(prices.size!==catalog.length)throw fail();return {journey,catalog,prices};
}
export async function readRinconPage(url:string,fetcher:Fetcher){
 try{
  const response=await fetcher(url,{redirect:'manual',headers:{Accept:'text/html'},signal:AbortSignal.timeout(15000)});
  if(!response.ok||response.status>=300||!response.body)throw fail();
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3000000){await reader.cancel();throw fail();}chunks.push(value);}
  const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(data);
 }catch{throw fail();}
}
export async function readRinconScores(ids:string[],pairs:CatalogPair[],journey:number,fetcher:Fetcher,at=Date.now()){
 const [liveHtml,brokerHtml]=await Promise.all([readRinconPage(LIVE_URL,fetcher),readRinconPage(BROKER_URL,fetcher)]);
 const live=parseLive(liveHtml),broker=parseBroker(brokerHtml);
 if(live.journey!==journey||broker.journey!==journey)throw new AppError(409,'RINCON_JOURNEY','Rincón mostra outra xornada. Non se modificaron os puntos gardados.');
 const lookup=(id:string)=>{
  const pair=pairs.find(p=>p.acb.ref===id);const player=pair?broker.catalog.find(p=>p.ref===pair.rincon.ref):undefined;
  const matches=pair?live.rows.filter(p=>normalizeName(p.name)===normalizeName(player?.name??pair.rincon.name)&&p.club===(player?.club??pair.rincon.club)):[];
  const row=matches.length===1?matches[0]:undefined;
  const club=player?.club??pair?.rincon.club;
  const clubRows=live.rows.filter(p=>p.club===club);
  return {pair,player,row,club,clubRows};
 };
 // One optional calendar read for clubs not described by the live response.
 // A calendar failure affects only the state label, never fabricates a zero.
 let calendar=new Map<string,import('../lib/model.ts').MatchState>();
 if(ids.some(id=>{const p=lookup(id);return !excludedFromSuperManager(journey,p.club)&&!p.clubRows.some(r=>r.matchState!=='unknown');})){
  try{calendar=parseCalendarStates(await readRinconPage(CALENDAR_URL,fetcher),journey,at);}catch{/* Unknown remains pending. */}
 }
 return ids.map(id=>{
  const {pair,player,row,club,clubRows}=lookup(id);
  const opening=player?broker.prices.get(player.ref)??null:null;
  let matchState=row?.matchState??clubRows[0]?.matchState??calendar.get(club??'')??'unknown';
  if(matchState==='unknown')matchState=calendar.get(club??'')??'unknown';
  const excluded=excludedFromSuperManager(journey,club);
  const stateConflict=(matchState==='scheduled'||matchState==='postponed')&&clubRows.some(p=>p.minutes!==null&&p.minutes>0||p.points!==null&&p.points!==0);
  if(stateConflict)matchState='unknown';
  const peers=row?clubRows.filter(p=>p.matchId===row.matchId&&p!==row&&p.minutes!==null&&p.minutes>0&&p.points!==null).length:0;
  // A complete explicit zero-minute row + >=2 participating teammates is evidence.
  // A missing row, an HTTP failure or an incomplete box score is never evidence.
  const inferred=!!row&&(row.points===null||row.points===0)&&(row.delta===null||row.delta===0)&&row.noMinutes&&peers>=2&&(matchState==='live'||matchState==='final');
  const zero=excluded||inferred;
  const usable=!stateConflict&&matchState!=='scheduled'&&matchState!=='postponed'&&(matchState==='live'||matchState==='final'||row?.minutes!==null&&row?.minutes!==undefined&&row.minutes>0);
  const points=zero?0:usable?row?.points??null:null,delta=zero?0:usable?row?.delta??null:null;
  const final=excluded||matchState==='final';
  const participation:import('../lib/model.ts').Participation=excluded?'excluded':inferred?(final?'did-not-play':'not-yet-played'):row?.minutes!==null&&row?.minutes!==undefined&&row.minutes>0?'played':'unknown';
  return {id,points,pointsFinal:points!==null&&final,valuation:zero?0:points===null?null:row?.valuation??null,broker:opening===null?null:opening+(delta??0),brokerOpening:opening,brokerDelta:delta,brokerKind:delta===null?(opening===null?null:'opening'):final?'final':'provisional',playing:matchState==='live',didNotPlay:zero&&final,source:'rincon',sourceUrl:LIVE_URL,season:CATALOG_SEASON,journey,observedAt:at,matchState,participation,readStatus:stateConflict?'conflict':points===null?'missing':'ok',zeroEvidence:excluded?'supermanager-exclusion':inferred?'live-row-and-teammates':undefined} satisfies RinconScore;
 });
}
