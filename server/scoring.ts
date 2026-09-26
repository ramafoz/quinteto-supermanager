import type {Runtime,Identity} from './service.ts';
import type {Player} from '../lib/model.ts';
import {AppError,ensure} from './errors.ts';
import {decrypt} from './crypto.ts';
import {journeys,playerScore,type Fetcher,type PlayerScore} from './acb.ts';
import {auditStatement} from './audit.ts';
export async function refreshScores(env:Runtime,user:Identity,roundId:string,journeyId:string,fetcher:Fetcher=fetch){
 const round=await env.DB.prepare('SELECT r.*,l.owner_id FROM rounds r JOIN leagues l ON l.id=r.league_id WHERE r.id=? AND l.owner_id=?').bind(roundId,user.userId).first<{id:string;league_id:string;lock_at:number;acb_journey_id:string|null}>();
 if(!round)throw new AppError(403,'OWNER_ONLY','Só o administrador pode actualizar as puntuacións da súa liga.');
 ensure(round.lock_at<=Date.now(),'A xornada aínda non comezou.');
 const link=await env.DB.prepare('SELECT jwt,expires_at FROM acb_links WHERE user_id=?').bind(user.userId).first<{jwt:string;expires_at:number}>();
 if(!link||link.expires_at<=Date.now())throw new AppError(409,'RECONNECT','Conecta de novo a túa conta ACB para consultar as puntuacións.');
 const jwt=await decrypt(link.jwt,env.TOKEN_ENCRYPTION_KEY,user.userId);const calendar=await journeys(jwt,fetcher);
 const journey=calendar.find(j=>j.id===(round.acb_journey_id??journeyId));
 if(!journey)throw new AppError(409,'ACB_JOURNEY','Escolle a xornada ACB correspondente. Se xa estaba vinculada, pode pertencer a outra tempada; conservamos os puntos anteriores.');
 if(round.acb_journey_id&&journeyId&&journeyId!==round.acb_journey_id)throw new AppError(409,'ACB_JOURNEY','Esta xornada xa ten unha xornada ACB vinculada.');
 const snapshots=(await env.DB.prepare('SELECT s.user_id,s.players_json,s.imported_at FROM snapshots s JOIN members m ON m.user_id=s.user_id WHERE s.round_id=? AND m.league_id=?').bind(roundId,round.league_id).all()).results as {user_id:string;players_json:string;imported_at:number}[];
 ensure(snapshots.length>0,'Aínda non hai equipos rexistrados nesta xornada.');
 const ids=[...new Set(snapshots.flatMap(s=>(JSON.parse(s.players_json) as Player[]).map(p=>p.id)))];
 ensure(ids.length<=100,'Demasiados xogadores nunha soa actualización.');
 const scores=new Map<string,PlayerScore>();
 // Bounded concurrency; never write a partial response after an upstream failure.
 for(let i=0;i<ids.length;i+=4){const batch=await Promise.all(ids.slice(i,i+4).map(id=>playerScore(id,journey.number,jwt,fetcher)));for(const score of batch)scores.set(score.id,score);}
 const at=Date.now();const statements=[env.DB.prepare('UPDATE rounds SET acb_journey_id=?,acb_journey_number=? WHERE id=? AND (acb_journey_id IS NULL OR acb_journey_id=?)').bind(journey.id,journey.number,roundId,journey.id)];
 let complete=0;
 for(const snapshot of snapshots){const list=(JSON.parse(snapshot.players_json) as Player[]).map(p=>scores.get(p.id)!);const ready=list.every(s=>s.points!==null);if(ready)complete++;
  const total=ready?Math.round(list.reduce((sum,s)=>sum+s.points!,0)*100)/100:null;
  statements.push(env.DB.prepare(`UPDATE snapshots SET scores_json=?,scores_at=?,raw_points=CASE WHEN ?=1 THEN ? ELSE raw_points END WHERE round_id=? AND user_id=? AND imported_at=? AND players_json=? AND EXISTS(SELECT 1 FROM rounds WHERE id=? AND acb_journey_id=?) AND (scores_at IS NULL OR scores_at<=?)`).bind(JSON.stringify(list),at,ready?1:0,total,roundId,snapshot.user_id,snapshot.imported_at,snapshot.players_json,roundId,journey.id,at));
 }
 statements.push(auditStatement(env,user.userId,`Consulta de puntuacións ACB da xornada ${journey.number}: ${scores.size} xogadores consultados.`));
 const saved=await env.DB.batch(statements);const updated=saved.slice(1,-1).filter(r=>r.meta.changes>0).length;
 return {updated,complete,players:scores.size,pending:[...scores.values()].filter(s=>s.points===null).length};
}
