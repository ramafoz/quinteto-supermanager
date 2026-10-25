import type {Runtime,Identity} from './service.ts';
import type {Player,Score} from '../lib/model.ts';
import {AppError,ensure} from './errors.ts';
import {decrypt} from './crypto.ts';
import {journeys,playerScore,type Fetcher,type PlayerScore} from './acb.ts';
import {auditStatement} from './audit.ts';
import {saveSnapshotResults} from './score-storage.ts';
import {CATALOG_SEASON,clubCode} from '../lib/catalog.ts';
import {excludedFromSuperManager} from '../lib/supermanager-rules.ts';
export async function refreshScores(env:Runtime,user:Identity,roundId:string,journeyId:string,fetcher:Fetcher=fetch,automatic=false){
  const round=await env.DB.prepare('SELECT r.*,l.owner_id FROM rounds r JOIN leagues l ON l.id=r.league_id WHERE r.id=? AND l.owner_id=?').bind(roundId,user.userId).first<{id:string;league_id:string;lock_at:number;ends_at:number;closed_at:number|null;acb_journey_id:string|null;rincon_journey_number:number|null;rincon_season:string|null}>();
 if(!round)throw new AppError(403,'OWNER_ONLY','Só o administrador pode actualizar as puntuacións da súa liga.');
 if(automatic)ensure(round.closed_at===null&&round.ends_at>Date.now(),'As actualizacións automáticas pararon: a xornada rematou.');
 ensure(round.lock_at<=Date.now(),'A xornada aínda non comezou.');
 const link=await env.DB.prepare('SELECT jwt,expires_at FROM acb_links WHERE user_id=?').bind(user.userId).first<{jwt:string;expires_at:number}>();
 if(!link||link.expires_at<=Date.now())throw new AppError(409,'RECONNECT','Conecta de novo a túa conta ACB para consultar as puntuacións.');
 const jwt=await decrypt(link.jwt,env.TOKEN_ENCRYPTION_KEY,user.userId);const calendar=await journeys(jwt,fetcher);
 const journey=calendar.find(j=>j.id===(round.acb_journey_id??journeyId));
 if(!journey)throw new AppError(409,'ACB_JOURNEY','Escolle a xornada ACB correspondente. Se xa estaba vinculada, pode pertencer a outra tempada; conservamos os puntos anteriores.');
 if(round.acb_journey_id&&journeyId&&journeyId!==round.acb_journey_id)throw new AppError(409,'ACB_JOURNEY','Esta xornada xa ten unha xornada ACB vinculada.');
  if(round.rincon_journey_number&&round.rincon_journey_number!==journey.number||round.rincon_season&&round.rincon_season!==CATALOG_SEASON)throw new AppError(409,'ACB_JOURNEY','A xornada ACB non coincide coa xornada de Rincón gardada. Conservamos os datos anteriores.');
 const snapshots=(await env.DB.prepare('SELECT s.user_id,s.players_json,s.imported_at FROM snapshots s JOIN members m ON m.user_id=s.user_id WHERE s.round_id=? AND m.league_id=?').bind(roundId,round.league_id).all()).results as {user_id:string;players_json:string;imported_at:number}[];
 ensure(snapshots.length>0,'Aínda non hai equipos rexistrados nesta xornada.');
 const ids=[...new Set(snapshots.flatMap(s=>(JSON.parse(s.players_json) as Player[]).map(p=>p.id)))];
 ensure(ids.length<=100,'Demasiados xogadores nunha soa actualización.');
 const scores=new Map<string,PlayerScore>();
 // Bounded concurrency; never write a partial response after an upstream failure.
 for(let i=0;i<ids.length;i+=4){if(automatic){const active=await env.DB.prepare('SELECT id FROM rounds WHERE id=? AND closed_at IS NULL AND ends_at>?').bind(roundId,Date.now()).first();ensure(active,'As actualizacións automáticas pararon: a xornada rematou.');}const batch=await Promise.all(ids.slice(i,i+4).map(id=>playerScore(id,journey.number,jwt,fetcher)));for(const score of batch)scores.set(score.id,score);}
 const at=Date.now();
 const bound=await env.DB.prepare('UPDATE rounds SET acb_journey_id=?,acb_journey_number=? WHERE id=? AND (acb_journey_id IS NULL OR acb_journey_id=?) AND (rincon_journey_number IS NULL OR rincon_journey_number=?) AND (rincon_season IS NULL OR rincon_season=?)').bind(journey.id,journey.number,roundId,journey.id,journey.number,CATALOG_SEASON).run();
 if(!bound.meta.changes)return {updated:0,complete:0,players:scores.size,pending:ids.length};
 let updated=0,complete=0;
 const guard='EXISTS(SELECT 1 FROM rounds WHERE id=? AND acb_journey_id=? AND (?=0 OR (closed_at IS NULL AND ends_at>?)))';
 const playerClubs=new Map(snapshots.flatMap(s=>(JSON.parse(s.players_json) as Player[]).map(p=>[p.id,p.club] as const)));
 const values:Score[]=[...scores.values()].map(s=>{const excluded=excludedFromSuperManager(journey.number,clubCode(playerClubs.get(s.id)??''));return {...s,source:'acb',journey:journey.number,season:CATALOG_SEASON,observedAt:at,...(excluded?{reportedPoints:s.points,reportedValuation:s.valuation,points:0,valuation:0,pointsFinal:true,brokerDelta:0,brokerKind:'final',participation:'excluded' as const,readStatus:'ok' as const,didNotPlay:true,zeroEvidence:'supermanager-exclusion' as const}:{})};});
 for(const snapshot of snapshots){
  const saved=await saveSnapshotResults(env,roundId,snapshot,values.filter(s=>(JSON.parse(snapshot.players_json) as Player[]).some(p=>p.id===s.id)),{season:CATALOG_SEASON,journey:journey.number},at,guard,[roundId,journey.id,automatic?1:0,Date.now()]);
  if(saved.updated)updated++;if(saved.updated&&saved.complete)complete++;
 }
 await auditStatement(env,user.userId,`Consulta de puntuacións ACB da xornada ${journey.number}: ${scores.size} xogadores consultados.`).run();
 return {updated,complete,players:scores.size,pending:[...scores.values()].filter(s=>s.points===null).length};
}
