import { AppError,ensure } from './errors.ts';
import { decrypt,encrypt,hash,invitation } from './crypto.ts';
import * as acb from './acb.ts';
import {audit,observe} from './audit.ts';
import {catalogAction} from './catalog.ts';
import {refreshScores} from './scoring.ts';
import {refreshRinconScores} from './rincon-scoring.ts';
import {brokerStandings} from '../lib/broker.ts';
import {positionCatalog,completePositions,repairPositions} from './positions.ts';
import type {Round} from '../lib/model.ts';
import {quota} from '../lib/quota.ts';
import type {OverallRow} from '../lib/model.ts';
export type Identity={userId:string;displayName:string};
export type Runtime={DB:D1Database;TOKEN_ENCRYPTION_KEY?:string};
type Member={user_id:string;league_id:string;name:string;owner_id:string;league_name:string};
type Link={user_id:string;jwt:string;expires_at:number;team_id:string|null;team_name:string|null;teams_json:string};
type RoundRow={id:string;league_id:string;label:string;lock_at:number;ends_at:number;closed_at:number|null};
type Snapshot={manual_penalty:number;declared_at:number|null;players_json:string;baseline_json:string|null;changes_count:number;history_json:string;team_id:string;imported_at:number};
function statement(env:Runtime,sql:string,...params:unknown[]){return env.DB.prepare(sql).bind(...params);}
async function member(env:Runtime,userId:string){
 const result=await statement(env,'SELECT m.*, l.owner_id, l.name AS league_name FROM members m JOIN leagues l ON l.id=m.league_id WHERE m.user_id=?',userId).first<Member>();
 if(!result)throw new AppError(403,'JOIN_LEAGUE','Crea unha liga ou entra cun convite.');return result;
}
export async function rateLimit(env:Runtime,userId:string,action:string,max:number,windowMs=60000){
 const bucket=Math.floor(Date.now()/windowMs);const key=`${userId}:${action}:${bucket}`;
 const row=await statement(env,'INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count',key,Date.now()+windowMs*2,max).first();
 if(!row)throw new AppError(429,'RATE_LIMIT','Demasiados intentos. Agarda un minuto e volve probar.');
 await statement(env,'DELETE FROM rate_limits WHERE expires_at<?',Date.now()).run();
}
function penalty(s:{declared_at:unknown;manual_penalty:unknown}){return s.declared_at?Number(s.manual_penalty??0):0;}
export async function state(env:Runtime,user:Identity,roundId?:string){
 const m=await statement(env,'SELECT m.*, l.owner_id, l.name AS league_name FROM members m JOIN leagues l ON l.id=m.league_id WHERE m.user_id=?',user.userId).first<Member>();
 if(!m)return {signedIn:true,user:{id:user.userId,name:user.displayName},league:null};
 const rounds=(await statement(env,'SELECT id,label,lock_at AS lockAt,ends_at AS endsAt,closed_at AS closedAt,acb_journey_id AS acbJourneyId,acb_journey_number AS acbJourneyNumber,rincon_journey_number AS rinconJourneyNumber,rincon_season AS rinconSeason FROM rounds WHERE league_id=? ORDER BY lock_at DESC',m.league_id).all()).results as {id:string;label:string;lockAt:number;endsAt:number;closedAt:number|null}[];
 const now=Date.now();
 const selected=rounds.find(r=>r.id===roundId)??rounds.find(r=>r.closedAt===null&&r.lockAt<=now&&r.endsAt>now)??rounds.filter(r=>r.closedAt===null&&r.lockAt>now).sort((a,b)=>a.lockAt-b.lockAt)[0]??rounds[0];
 const members=(await statement(env,'SELECT m.user_id AS id,m.name,CASE WHEN s.declared_at IS NOT NULL THEN 1 ELSE 0 END AS declared FROM members m LEFT JOIN snapshots s ON s.user_id=m.user_id AND s.round_id=? WHERE m.league_id=? ORDER BY m.name',selected?.id??'',m.league_id).all()).results;
 const link=await statement(env,'SELECT * FROM acb_links WHERE user_id=?',user.userId).first<Link>();
 const acbLinked=!!await statement(env,'SELECT acb_id FROM acb_identities WHERE user_id=?',user.userId).first();
 const hidden=!selected||selected.lockAt>Date.now();
 const completed=(await statement(env,'SELECT s.user_id,s.players_json,s.raw_points,s.scores_json,s.scores_at,s.changes_count,s.declared_at,s.penalty_reduction,s.manual_penalty,s.baseline_json,s.history_json FROM snapshots s JOIN rounds r ON r.id=s.round_id JOIN members m ON m.user_id=s.user_id WHERE r.league_id=? AND m.league_id=? AND r.lock_at<=? AND (r.closed_at IS NOT NULL OR r.ends_at<=?)',m.league_id,m.league_id,now,now).all()).results;
 const completedCount=rounds.filter(r=>r.lockAt<=now&&(r.closedAt!==null||r.endsAt<=now)).length;
 const overall:OverallRow[]=members.map(person=>{
  const row:OverallRow={userId:String(person.id),name:String(person.name),rawPoints:0,penalty:0,netPoints:0,counted:0,pending:completedCount,provisional:false};
  for(const snapshot of completed.filter(s=>s.user_id===person.id)){
   if(snapshot.scores_at&&snapshot.scores_json&&JSON.parse(snapshot.scores_json as string).some((s:{points:number|null;stale?:boolean})=>s.points===null||s.stale))continue;
   if(snapshot.raw_points===null||quota(JSON.parse(snapshot.players_json as string)).status!=='valid')continue;
   row.rawPoints+=Number(snapshot.raw_points);row.penalty+=penalty(snapshot as never);row.counted++;row.pending--;
   if(!snapshot.declared_at||JSON.parse(snapshot.history_json as string).some((h:{pending?:boolean})=>h.pending))row.provisional=true;
  }
  row.rawPoints=Math.round(row.rawPoints*100)/100;row.netPoints=Math.round((row.rawPoints-row.penalty)*100)/100;return row;
 }).sort((a,b)=>Number(b.counted>0)-Number(a.counted>0)||b.netPoints-a.netPoints||a.name.localeCompare(b.name));
 // Privacy is enforced in SQL, not merely by hiding columns in the browser.
 const lineups=selected?(await statement(env,`SELECT s.user_id AS userId,m.name,s.team_name AS team,s.players_json,s.imported_at AS importedAt,s.baseline_json,s.changes_count,s.history_json,s.raw_points,s.declared_at,s.penalty_reduction,s.manual_penalty,s.scores_json,s.scores_at FROM snapshots s JOIN members m ON m.user_id=s.user_id WHERE s.round_id=? AND m.league_id=? AND (?=0 OR s.user_id=?) ORDER BY m.name`,selected.id,m.league_id,hidden?1:0,user.userId).all()).results.map(s=>({userId:s.userId,name:s.name,team:s.team,importedAt:s.importedAt,players:JSON.parse(s.players_json as string),quota:quota(JSON.parse(s.players_json as string)),declaredAt:s.declared_at,rawPoints:s.raw_points,netPoints:s.raw_points===null||quota(JSON.parse(s.players_json as string)).status!=='valid'?null:Math.round((Number(s.raw_points)-penalty(s as never))*100)/100,baselineKnown:!!s.declared_at,changes:s.declared_at?s.changes_count:0,penalty:penalty(s as never),scores:s.scores_json?JSON.parse(s.scores_json as string):null,scoresAt:s.scores_at,history:JSON.parse(s.history_json as string)})):[];
 const brokerSnapshots=(await statement(env,'SELECT s.round_id,s.user_id,s.players_json,s.scores_json FROM snapshots s JOIN rounds r ON r.id=s.round_id JOIN members m ON m.user_id=s.user_id WHERE r.league_id=? AND m.league_id=? AND r.lock_at<=?',m.league_id,m.league_id,now).all()).results.map(s=>({roundId:String(s.round_id),userId:String(s.user_id),players:JSON.parse(s.players_json as string),scores:s.scores_json?JSON.parse(s.scores_json as string):null}));
 const broker=brokerStandings(members.map(m=>({id:String(m.id),name:String(m.name)})),rounds as Round[],brokerSnapshots,selected?.id,now);
 return {signedIn:true,acbLinked,overall,broker,user:{id:user.userId,name:m.name},league:{id:m.league_id,name:m.league_name,isOwner:m.owner_id===user.userId},members,rounds,round:selected??null,hidden,lineups,connection:link?{connected:link.expires_at>Date.now(),expiresAt:link.expires_at,teamId:link.team_id,teamName:link.team_name,teams:JSON.parse(link.teams_json)}:null};
}
function text(value:unknown,label:string,max=80){ensure(typeof value==='string'&&value.trim().length>0&&value.length<=max,`${label}: introduce un valor válido.`);return value.trim();}
async function activeLink(env:Runtime,userId:string){
 const link=await statement(env,'SELECT * FROM acb_links WHERE user_id=?',userId).first<Link>();
 if(!link||link.expires_at<=Date.now())throw new AppError(409,'RECONNECT','Conecta de novo a túa conta ACB para importar.');
 return {link,jwt:await decrypt(link.jwt,env.TOKEN_ENCRYPTION_KEY,userId)};
}
export async function importLineup(env:Runtime,user:Identity,roundId:string,fetcher:acb.Fetcher=fetch,declareStartingTeam=false,automatic=false){
 const m=await member(env,user.userId);const round=await statement(env,'SELECT * FROM rounds WHERE id=? AND league_id=?',roundId,m.league_id).first<RoundRow>();
 if(!round||round.closed_at!==null||round.ends_at<=Date.now())throw new AppError(409,'ROUND_LOCKED','Esta xornada rematou. Os cambios entre xornadas non teñen penalización.');
 const {link,jwt}=await activeLink(env,user.userId);
 if(!link.team_id)throw new AppError(409,'SELECT_TEAM','Selecciona o teu equipo ACB.');
 const previous=await statement(env,'SELECT * FROM snapshots WHERE round_id=? AND user_id=?',round.id,user.userId).first<Snapshot>();
 if(declareStartingTeam&&previous?.declared_at)throw new AppError(409,'ALREADY_DECLARED','Xa declaraches o teu equipo inicial desta xornada.');
 let players:Awaited<ReturnType<typeof acb.roster>>;
 try{players=await acb.roster(link.team_id,jwt,fetcher);}catch(e){if(e instanceof AppError&&e.code==='RECONNECT')await statement(env,'UPDATE acb_links SET expires_at=0 WHERE user_id=? AND jwt=?',user.userId,link.jwt).run();throw e;}
 players=completePositions(players,(await positionCatalog(env,m.league_id)).positions);
 await observe(env,user.userId,link.team_id,players,automatic);
 const now=Date.now();const savedAt=Math.max(now,(previous?.imported_at??0)+1);const started=now>=round.lock_at;
 const eligibility=quota(players);
 if((!previous||declareStartingTeam)&&eligibility.status!=='valid')throw new AppError(422,'GALICIAN_QUOTA',eligibility.status==='unknown'?'Non se pode comprobar o club de todos os xogadores. O cadro queda sen rexistrar ata verificar a cota.':`Necesitas polo menos 2 xogadores entre Río Breogán, Leyma Coruña e Obradoiro. Este cadro ten ${eligibility.count}.`);
 if(started&&previous&&previous.team_id!==link.team_id)throw new AppError(409,'TEAM_FIXED','A xornada comezou: mantén o equipo co que a comezaches.');
 const old=previous?JSON.parse(previous.players_json) as typeof players:[];
 const incoming=previous&&!declareStartingTeam?players.filter(p=>!old.some(o=>o.id===p.id)):[];
 const outgoing=previous&&!declareStartingTeam?old.filter(p=>!players.some(o=>o.id===p.id)):[];
 // A change spanning the start boundary has no authoritative ACB timestamp.
 // Never charge it automatically: it may have happened BEFORE the round began.
 const ambiguous=started&&!!previous&&previous.imported_at<round.lock_at;
 const charged=started&&!ambiguous&&!!previous?.declared_at&&!declareStartingTeam?incoming.length:0;
 const changes=started&&previous?.declared_at&&!declareStartingTeam?previous.changes_count+charged:0;
 const baseline=declareStartingTeam||(!started&&previous?.declared_at)?JSON.stringify(players):previous?.baseline_json??null;
 const declaredAt=declareStartingTeam?now:previous?.declared_at??null;
 const history=started&&previous&&!declareStartingTeam?JSON.parse(previous.history_json):[];
 if(started&&incoming.length)history.push({at:now,incoming,outgoing,penalty:0,pending:ambiguous||!previous?.declared_at});
 // Compare-and-swap prevents concurrent imports from double-counting penalties.
 const saved=await statement(env,`INSERT INTO snapshots (round_id,user_id,team_id,team_name,players_json,imported_at,baseline_json,changes_count,history_json,declared_at)
 SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM rounds WHERE id=? AND league_id=? AND closed_at IS NULL AND ends_at>?)
 AND COALESCE((SELECT imported_at FROM snapshots WHERE round_id=? AND user_id=?),-1)=?
 AND (?=1 OR EXISTS(SELECT 1 FROM rounds WHERE id=? AND lock_at>?))
 AND EXISTS(SELECT 1 FROM acb_links WHERE user_id=? AND jwt=? AND team_id=?)
 ON CONFLICT(round_id,user_id) DO UPDATE SET team_id=excluded.team_id,team_name=excluded.team_name,players_json=excluded.players_json,imported_at=excluded.imported_at,baseline_json=excluded.baseline_json,changes_count=excluded.changes_count,history_json=excluded.history_json,declared_at=excluded.declared_at,manual_penalty=CASE WHEN ?=1 THEN 0 ELSE snapshots.manual_penalty END,scores_json=CASE WHEN snapshots.players_json<>excluded.players_json THEN NULL ELSE snapshots.scores_json END,scores_at=CASE WHEN snapshots.players_json<>excluded.players_json THEN NULL ELSE snapshots.scores_at END,raw_points=CASE WHEN snapshots.scores_json IS NOT NULL AND snapshots.players_json<>excluded.players_json THEN NULL ELSE snapshots.raw_points END
 WHERE excluded.imported_at>snapshots.imported_at RETURNING imported_at`,round.id,user.userId,link.team_id,link.team_name,JSON.stringify(players),savedAt,baseline,changes,JSON.stringify(history),declaredAt,round.id,m.league_id,now,round.id,user.userId,previous?.imported_at??-1,started?1:0,round.id,now,user.userId,link.jwt,link.team_id,declareStartingTeam?1:0).first();
 if(!saved)throw new AppError(409,'IMPORT_CONFLICT','A xornada pechouse ou a conexión cambiou durante a importación.');
 if(declareStartingTeam)await audit(env,user.userId,`Equipo marcado como inicial na xornada ${round.label}.`);
 return {imported:true,players:players.length,importedAt:savedAt,changes,penalty:declareStartingTeam?0:previous?penalty(previous):0,baselineKnown:!!baseline};
}
export async function action(env:Runtime,user:Identity,name:string,body:Record<string,unknown>,fetcher:acb.Fetcher=fetch):Promise<unknown>{
 await rateLimit(env,user.userId,name,name==='connect'?5:30);
 if(name==='create'||name==='join'){
  const existing=await statement(env,'SELECT user_id FROM members WHERE user_id=?',user.userId).first();
  if(existing)throw new AppError(409,'ALREADY_MEMBER','Xa formas parte dunha liga.');
  const nickname=text(body.name,'O teu nome',40);
  if(name==='create'){
   const leagueName=text(body.leagueName,'Nome da liga'); const id=crypto.randomUUID();const code=invitation();
   await env.DB.batch([statement(env,'INSERT INTO leagues(id,name,owner_id,invite_hash) VALUES (?,?,?,?)',id,leagueName,user.userId,await hash(code)),statement(env,'INSERT INTO members(user_id,league_id,name) VALUES (?,?,?)',user.userId,id,nickname)]);
   return {inviteCode:code};
  }
  const code=text(body.code,'Convite',64);const league=await statement(env,'SELECT id FROM leagues WHERE invite_hash=?',await hash(code)).first<{id:string}>();
  if(!league)throw new AppError(400,'INVALID_INVITE','O convite non é válido. Pídelle un novo ao creador da liga.');
  await statement(env,'INSERT INTO members(user_id,league_id,name) VALUES (?,?,?)',user.userId,league.id,nickname).run();return {joined:true};
 }
 const m=await member(env,user.userId);
 if(['catalog-read','catalog-refresh','catalog-confirm'].includes(name))return catalogAction(env,user,name,body,fetcher);
 if(name==='ping'){await audit(env,user.userId,'Ping: sesión activa na web.');return {ok:true};}
 if(name==='refresh-team'){
  if(typeof body.roundId==='string')return importLineup(env,user,body.roundId,fetcher,false,true);
  const {link,jwt}=await activeLink(env,user.userId);if(!link.team_id)throw new AppError(409,'SELECT_TEAM','Selecciona o teu equipo ACB.');
  const players=await acb.roster(link.team_id,jwt,fetcher);await observe(env,user.userId,link.team_id,players,true);return {observed:true};
 }
 if(['repair-positions','audit','penalty','acb-journeys','refresh-scores','refresh-rincon-scores'].includes(name)){
  if(m.owner_id!==user.userId)throw new AppError(403,'OWNER_ONLY','Só o administrador pode facer isto.');
  if(name==='repair-positions')return repairPositions(env,user);
  if(name==='audit'){
   const before=body.before===undefined?Number.MAX_SAFE_INTEGER:Number(body.before);ensure(Number.isSafeInteger(before)&&before>0,'Páxina non válida.');
   const rows=(await statement(env,'SELECT id,at,user_name AS user,message FROM audit_events WHERE league_id=? AND id<? ORDER BY id DESC LIMIT 101',m.league_id,before).all()).results;
   return {events:rows.slice(0,100),next:rows.length>100?rows[99].id:null};
  }
  if(name==='acb-journeys'){const {jwt}=await activeLink(env,user.userId);return {journeys:await acb.journeys(jwt,fetcher)};}
  if(name==='refresh-rincon-scores')return refreshRinconScores(env,user,text(body.roundId,'Xornada'),body.journeyNumber,fetcher,body.automatic===true);
  if(name==='refresh-scores')return refreshScores(env,user,text(body.roundId,'Xornada'),typeof body.journeyId==='string'?body.journeyId:'',fetcher,body.automatic===true);
  const roundId=text(body.roundId,'Xornada');const target=text(body.userId,'Participante',200);const amount=Number(body.penalty);
  ensure((typeof body.penalty==='number'||typeof body.penalty==='string'&&body.penalty.trim()!=='')&&Number.isFinite(amount)&&Math.abs(amount)<=10000&&Math.abs(amount*100-Math.round(amount*100))<0.000001,'Indica un axuste entre −10000 e 10000 cun máximo de dous decimais.');
  const saved=await statement(env,`UPDATE snapshots SET manual_penalty=? WHERE round_id=? AND user_id=? AND declared_at IS NOT NULL AND EXISTS(SELECT 1 FROM rounds WHERE id=? AND league_id=? AND lock_at<=?) RETURNING manual_penalty`,Math.round(amount*100)/100,roundId,target,roundId,m.league_id,Date.now()).first();
  if(!saved)throw new AppError(409,'PENALTY','O equipo debe estar declarado nunha xornada iniciada da túa liga.');
  const adjustedRound=await statement(env,'SELECT label FROM rounds WHERE id=?',roundId).first<{label:string}>();
  await audit(env,target,`O administrador gardou o axuste manual a restar da xornada ${adjustedRound?.label??''} a ${amount} puntos.`);return {adjusted:true};
 }
 if(name==='remove-member'){
  if(m.owner_id!==user.userId)throw new AppError(403,'OWNER_ONLY','Só o creador da liga pode eliminar participantes.');
  const target=text(body.userId,'Participante',200);
  if(target===user.userId)throw new AppError(409,'OWNER_PROTECTED','Non podes eliminar a túa propia conta de administrador.');
  const found=await statement(env,'SELECT user_id FROM members WHERE user_id=? AND league_id=?',target,m.league_id).first();
  if(!found)throw new AppError(404,'MEMBER_NOT_FOUND','Este participante xa non está na túa liga.');
  // One transaction revokes access and removes dependent data before membership.
  await env.DB.batch([
   ...['sessions','acb_identities','acb_links','snapshots','roster_observations'].map(table=>statement(env,`DELETE FROM ${table} WHERE user_id=? AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND league_id=?)`,target,target,m.league_id)),
   statement(env,'DELETE FROM members WHERE user_id=? AND league_id=?',target,m.league_id)
  ]);
  return {removed:true};
 }
 if(name==='invite'||name==='round'||name==='close-round'||name==='score'){
  if(m.owner_id!==user.userId)throw new AppError(403,'OWNER_ONLY','Só o creador da liga pode facer isto.');
  if(name==='invite'){const code=invitation();await statement(env,'UPDATE leagues SET invite_hash=? WHERE id=?',await hash(code),m.league_id).run();return {inviteCode:code};}
  if(name==='score'){
   const roundId=text(body.roundId,'Xornada');const userId=text(body.userId,'Usuario',200);const points=Number(body.points);
   ensure(body.points!==''&&Number.isFinite(points)&&points>=-1000&&points<=10000&&Math.abs(points*100-Math.round(points*100))<0.000001,'Introduce a puntuación ACB cun máximo de dous decimais.');
   const saved=await statement(env,`UPDATE snapshots SET raw_points=?,scores_at=NULL WHERE round_id=? AND user_id=? AND EXISTS(SELECT 1 FROM rounds WHERE id=? AND league_id=? AND (closed_at IS NOT NULL OR ends_at<=?)) RETURNING raw_points`,points,roundId,userId,roundId,m.league_id,Date.now()).first();
   if(!saved)throw new AppError(409,'SCORE_NOT_READY','A xornada debe ter rematado e o participante debe ter un cadro rexistrado.');return {scored:true};
  }
  if(name==='close-round'){const id=text(body.roundId,'Xornada');const closed=await statement(env,'UPDATE rounds SET closed_at=? WHERE id=? AND league_id=? AND closed_at IS NULL AND lock_at<=? RETURNING id',Date.now(),id,m.league_id,Date.now()).first();if(!closed)throw new AppError(409,'ROUND_STATE','Só podes rematar unha xornada que xa comezase.');return {closed:true};}
  const label=text(body.label,'Xornada',50);const lockAt=Number(body.lockAt);
  const endsAt=Number(body.endsAt);ensure(Number.isSafeInteger(endsAt)&&endsAt>lockAt&&endsAt<lockAt+14*86400000,'Indica o final da xornada, posterior ao seu inicio (máximo 14 días).');
  ensure(Number.isSafeInteger(lockAt)&&lockAt>Date.now()+60000&&lockAt<Date.now()+366*86400000,'O inicio debe ser unha data futura, polo menos un minuto despois de agora.');
  return statement(env,'INSERT INTO rounds(id,league_id,label,lock_at,ends_at) VALUES (?,?,?,?,?) RETURNING id',crypto.randomUUID(),m.league_id,label,lockAt,endsAt).first();
 }
 if(name==='disconnect'){await statement(env,'DELETE FROM acb_links WHERE user_id=?',user.userId).run();return {disconnected:true};}
 if(name==='connect'){
  // Validate encryption configuration BEFORE collecting a token from ACB.
  await encrypt('configuration-check',env.TOKEN_ENCRYPTION_KEY,user.userId);
  const username=text(body.username,'Usuario ACB',200);
  ensure(typeof body.password==='string'&&body.password.length>0&&body.password.length<=512,'Introduce o teu contrasinal ACB.');
  let jwt:string;
  try{
   const linked=await statement(env,'SELECT acb_id FROM acb_identities WHERE user_id=?',user.userId).first<{acb_id:string}>();
   if(linked){const account=await acb.authenticate(username,body.password,fetcher);if(account.acbId!==linked.acb_id)throw new AppError(409,'ACCOUNT_MISMATCH','Usa a mesma conta ACB coa que entraches na liguiña.');jwt=account.jwt;}
   else jwt=await acb.signIn(username,body.password,fetcher);
  }finally{delete body.password;}
  const teams=await acb.teams(jwt,fetcher);const cipher=await encrypt(jwt,env.TOKEN_ENCRYPTION_KEY,user.userId);
  await statement(env,`INSERT INTO acb_links(user_id,jwt,expires_at,teams_json) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET jwt=excluded.jwt,expires_at=excluded.expires_at,teams_json=excluded.teams_json,team_id=NULL,team_name=NULL`,user.userId,cipher,acb.tokenExpiry(jwt),JSON.stringify(teams)).run();return {teams};
 }
 if(name==='select-team'){
  const teamId=text(body.teamId,'Equipo',30);const {link,jwt}=await activeLink(env,user.userId);
  const teams=await acb.teams(jwt,fetcher);const team=teams.find(t=>t.id===teamId);
  if(!team)throw new AppError(403,'TEAM_NOT_OWNED','Ese equipo non pertence á túa conta ACB.');
  const fixed=await statement(env,'SELECT s.team_id FROM snapshots s JOIN rounds r ON r.id=s.round_id WHERE s.user_id=? AND r.league_id=? AND r.lock_at<=? AND r.closed_at IS NULL AND r.ends_at>?',user.userId,m.league_id,Date.now(),Date.now()).first<{team_id:string}>();
  if(fixed&&fixed.team_id!==teamId)throw new AppError(409,'TEAM_FIXED','Podes cambiar xogadores en ACB, pero non cambiar de equipo durante a xornada.');
  const changed=await statement(env,'UPDATE acb_links SET team_id=?,team_name=?,teams_json=? WHERE user_id=? AND jwt=? RETURNING team_id',team.id,team.name,JSON.stringify(teams),user.userId,link.jwt).first();
  if(!changed)throw new AppError(409,'RECONNECT','A conexión cambiou. Volve tentalo.');
  return {selected:true};
 }
 if(name==='import'){ensure(body.declareStartingTeam===undefined||typeof body.declareStartingTeam==='boolean','Declaración non válida.');return importLineup(env,user,text(body.roundId,'Xornada'),fetcher,body.declareStartingTeam===true);}
 throw new AppError(404,'NOT_FOUND','Acción non atopada.');
}
