import { AppError } from './errors.ts';
import type { Player } from '../lib/model.ts';
const BASE='https://supermanager.acb.com';
export type Team={id:string;name:string};
export type Fetcher=typeof fetch;
async function json(url:string,init:RequestInit,fetcher:Fetcher){
  let response:Response;
  // The deployed Workers runtime supports manual/follow, not redirect:error.
  // Never follow redirects carrying an ACB password or bearer token.
  try { response=await fetcher(url,{...init,redirect:'manual',signal:AbortSignal.timeout(15000)}); }
  catch { throw new AppError(502,'ACB_UNAVAILABLE','ACB non responde. O teu cadro anterior segue gardado. Téntao máis tarde.'); }
  if(response.status>=300&&response.status<400)throw new AppError(502,'ACB_REDIRECT','ACB devolveu unha redirección inesperada. Detivemos a conexión sen reenviar as credenciais.');
  if(response.status===401||response.status===403)throw new AppError(409,'RECONNECT','ACB rexeitou a sesión. Revisa os teus datos ou volve conectar.');
  if(response.status===429)throw new AppError(429,'ACB_RATE_LIMIT','ACB pediu agardar. Téntao dentro duns minutos.');
  if(!response.ok)throw new AppError(502,'ACB_UNAVAILABLE','Non se puido consultar ACB. Téntao máis tarde.');
  try { return await response.json(); }catch { throw new AppError(502,'ACB_SCHEMA','ACB devolveu un formato inesperado.'); }
}
const schema=()=>new AppError(502,'ACB_SCHEMA','O formato de ACB cambiou. Non se sobrescribiu o teu cadro.');
function id(value:unknown){if(!/^\d+$/.test(String(value))||Number(value)<=0)throw schema();return String(value);}
export function normalizeTeams(raw:unknown):Team[]{
  // Public adapter: array of competitions, each with userTeamList.
  if(!Array.isArray(raw))throw schema();
  const rows=raw.flatMap(group=>{if(!group||!Array.isArray(group.userTeamList))throw schema();return group.userTeamList;});
  const teams=rows.map(t=>{if(typeof t.nameTeam!=='string'||!t.nameTeam.trim())throw schema();return {id:id(t.idUserTeam),name:t.nameTeam.slice(0,150)};});
  return [...new Map(teams.map(t=>[t.id,t])).values()];
}
export function normalizePlayers(raw:unknown):Player[]{
  if(!Array.isArray(raw))throw schema();
  const active=raw.filter(p=>p&&p.statusTeamSquad!=='empty');
  const players=active.map(p=>{
    if(typeof p.shortName!=='string'||!p.shortName.trim())throw schema();
    // Numeric position mapping is deliberately not guessed; names still compare by ID.
    const position=['Base','Alero','Pívot'].includes(p.position)?p.position:'Jugador';
    return {id:id(p.idPlayer),name:p.shortName.slice(0,120),position,...(typeof p.nameTeam==='string'&&p.nameTeam.trim()?{club:p.nameTeam.trim().slice(0,120)}:{})};
  });
  if(players.length!==10||new Set(players.map(p=>p.id)).size!==10)throw new AppError(422,'INCOMPLETE_ROSTER','O cadro debe ter 10 xogadores distintos. Completa os cambios en ACB e volve importar.');
  return players;
}
async function login(username:string,password:string,fetcher:Fetcher=fetch){
  const signin=await json('https://id.acb.com/api/signIn',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password})},fetcher) as {code?:unknown};
  if(typeof signin?.code!=='string'||!signin.code)throw new AppError(409,'RECONNECT','ACB non aceptou o acceso. Revisa os teus datos.');
  const tokens=await json(`${BASE}/oauth/V2/open/accounttoken/getTokens`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uuid:signin.code,deviceId:''})},fetcher) as {jwt?:unknown;type?:unknown};
  if(typeof tokens?.jwt!=='string'||!tokens.jwt||tokens.type!=='Bearer')throw schema();
  // Do not retain password, sign-in code or refresh: refresh contract is unverified.
  return {jwt:tokens.jwt as string,signin};
}
export async function signIn(username:string,password:string,fetcher:Fetcher=fetch){return (await login(username,password,fetcher)).jwt;}
export async function authenticate(username:string,password:string,fetcher:Fetcher=fetch){
 const {jwt,signin}=await login(username,password,fetcher);
 // Cognito sub comes from the authenticated ACB response, never from form data
 // or from merely decoding an unverified browser-supplied JWT.
 const attributes=(signin as {UserData?:{UserAttributes?:{Name?:unknown;Value?:unknown}[]}}).UserData?.UserAttributes;
 const value=(name:string)=>Array.isArray(attributes)?attributes.find(a=>a.Name===name)?.Value:undefined;
 const sub=value('sub');if(typeof sub!=='string'||!sub||sub.length>128)throw new AppError(502,'ACB_IDENTITY','ACB validou o acceso, pero non devolveu o identificador estable esperado. Non se creou nin se cambiou ningunha conta.');
 const nickname=value('preferred_username');return{jwt,acbId:'cognito:'+sub,name:typeof nickname==='string'&&nickname.trim()?nickname.trim().slice(0,40):'Xogador'};
}
export function tokenExpiry(jwt:string,now=Date.now()){
  let expiry=now+60*60*1000;
  try { const payload=JSON.parse(atob(jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(typeof payload.exp==='number')expiry=payload.exp*1000; }catch{/* Opaque token: conservative local expiry. */}
  return Math.min(expiry,now+24*60*60*1000);
}
export async function teams(jwt:string,fetcher:Fetcher=fetch){return normalizeTeams(await json(`${BASE}/api/basic/userteam/all`,{headers:{Authorization:`Bearer ${jwt}`}},fetcher));}
export type Journey={id:string;number:number};
export async function journeys(jwt:string,fetcher:Fetcher=fetch):Promise<Journey[]>{
 const raw=await json(`${BASE}/api/basic/journey/competition/1`,{headers:{Authorization:`Bearer ${jwt}`}},fetcher);
 if(!Array.isArray(raw)||raw.length!==1||!Array.isArray(raw[0]?.journeyList))throw schema();
 const list=raw[0].journeyList.map((j:{idJourney:unknown;number:unknown})=>{const number=Number(j.number);if(!Number.isInteger(number)||number<1||number>100)throw schema();return {id:id(j.idJourney),number};});
 if(new Set(list.map((j:Journey)=>j.id)).size!==list.length||new Set(list.map((j:Journey)=>j.number)).size!==list.length)throw schema();return list;
}
export type PlayerScore={id:string;valuation:number|null;points:number|null};
export function normalizeScore(raw:unknown,playerId:string,number:number):PlayerScore{
 const data=raw as {idPlayer?:unknown;playerStats?:{numberJourney?:unknown;pointsJourney?:unknown;bonusVictory?:unknown}[]};
 if(!data||!Array.isArray(data.playerStats)||(data.idPlayer!==undefined&&String(data.idPlayer)!==playerId))throw schema();
 const matches=data.playerStats.filter(s=>Number(s.numberJourney)===number);if(matches.length>1)throw schema();
 const row=matches[0];if(!row||row.pointsJourney===null||row.pointsJourney===undefined)return {id:playerId,valuation:null,points:null};
 const numeric=(v:unknown)=>{if(typeof v!=='number'||!Number.isFinite(v)||v< -1000||v>1000)throw schema();return v;};
 const valuation=numeric(row.pointsJourney);const bonus=row.bonusVictory==null?0:numeric(row.bonusVictory);
 // Official player view displays bonusVictory when nonzero, otherwise pointsJourney.
 return {id:playerId,valuation,points:bonus!==0?bonus:valuation};
}
export async function playerScore(playerId:string,number:number,jwt:string,fetcher:Fetcher=fetch){return normalizeScore(await json(`${BASE}/api/basic/playerstats/1/${id(playerId)}`,{headers:{Authorization:`Bearer ${jwt}`}},fetcher),playerId,number);}
export async function roster(teamId:string,jwt:string,fetcher:Fetcher=fetch){
 const players=normalizePlayers(await json(`${BASE}/api/basic/userteamplayer/${id(teamId)}`,{headers:{Authorization:`Bearer ${jwt}`}},fetcher));
 if(players.every(p=>p.club))return players;
 const filters=JSON.stringify([{field:'competition.idCompetition',value:1,operator:'=',condition:'AND'},{field:'edition.isActive',value:true,operator:'=',condition:'AND'}]);
 const url=new URL(`${BASE}/api/basic/player`);url.search=new URLSearchParams({_filters:filters,_page:'1',_perPage:'300'}).toString();
 // The public market adapter supplies nameTeam; unknown clubs remain unverified.
 const market=await json(url.href,{headers:{Authorization:`Bearer ${jwt}`}},fetcher);
 if(!Array.isArray(market))throw schema();
 const clubs=new Map<string,string>();for(const p of market)if(p&&typeof p.nameTeam==='string'&&p.nameTeam.trim())clubs.set(String(p.idPlayer),p.nameTeam.trim().slice(0,120));
 return players.map(p=>({...p,club:p.club??clubs.get(p.id)}));
}
