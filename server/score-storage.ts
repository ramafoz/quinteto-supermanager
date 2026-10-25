import type {Runtime} from './service.ts';
import type {Player,Score} from '../lib/model.ts';
import {allSavedScores,mergeScore,pointsTotal,type ScoreContext} from '../lib/score-data.ts';
import {AppError} from './errors.ts';

export type ScoreSnapshot={user_id:string;players_json:string;imported_at:number;previous_players_json?:string|null};
// Merge against the latest JSON, not the copy read before upstream requests.
// The JSON CAS retries concurrent ACB/Rincón writes without losing either source.
export async function saveSnapshotResults(env:Runtime,roundId:string,snapshot:ScoreSnapshot,fresh:Score[],context:ScoreContext,at:number,guard:string,guardArgs:unknown[]){
 for(let attempt=0;attempt<4;attempt++){
  const saved=await env.DB.prepare('SELECT players_json,imported_at,scores_json,scores_at FROM snapshots WHERE round_id=? AND user_id=?').bind(roundId,snapshot.user_id).first<{players_json:string;imported_at:number;scores_json:string|null;scores_at:number|null}>();
  if(!saved||saved.players_json!==snapshot.players_json||saved.imported_at!==snapshot.imported_at)return {updated:false,complete:false};
  const previous:Score[]=JSON.parse(saved.scores_json??'[]');const all=allSavedScores(previous);
  const players=JSON.parse(snapshot.players_json) as Player[];
  const list=players.map(p=>mergeScore(all.find(s=>s.id===p.id),fresh.find(s=>s.id===p.id)??{id:p.id,source:'rincon',points:null,valuation:null,journey:context.journey,season:context.season,observedAt:at},context));
  const currentIds=new Set(players.map(p=>p.id));
  // Keep caches even when an optional mapping/read fails; never clear them as a group.
  const extraIds=new Set([...all,...fresh].filter(s=>!currentIds.has(s.id)).map(s=>s.id));
  if(list.length)list[0].noChangesScores=[...extraIds].map(id=>{
   const value=mergeScore(all.find(s=>s.id===id),fresh.find(s=>s.id===id),context);
   const {noChangesScores:unused,...score}=value;return score;
  });
  const pointStatus=pointsTotal(players,list,context);
  const ready=pointStatus.count>0&&pointStatus.count===pointStatus.expected;
  const total=ready?pointStatus.value:null;
  const storedAt=Math.max(at,(saved.scores_at??0)+1);
  const result=await env.DB.prepare(`UPDATE snapshots SET scores_json=?,scores_at=?,raw_points=CASE WHEN ?=1 THEN ? ELSE raw_points END WHERE round_id=? AND user_id=? AND imported_at=? AND players_json=? AND scores_json IS ? AND ${guard}`).bind(JSON.stringify(list),storedAt,ready?1:0,total,roundId,snapshot.user_id,snapshot.imported_at,snapshot.players_json,saved.scores_json,...guardArgs).run();
  if(result.meta.changes>0)return {updated:true,complete:ready};
  // A closed round or changed catalogue is not a score-write conflict to retry.
  if(!await env.DB.prepare(`SELECT id FROM rounds WHERE id=? AND ${guard}`).bind(roundId,...guardArgs).first())return {updated:false,complete:false};
 }
 throw new AppError(409,'SCORES_CONFLICT','Outra actualización cambiou os resultados. Conserváronse os datos; volve actualizar.');
}
