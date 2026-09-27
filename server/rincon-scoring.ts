import type {Runtime,Identity} from './service.ts';
import type {Player} from '../lib/model.ts';
import {CATALOG_SEASON,type CatalogPair} from '../lib/catalog.ts';
import type {Fetcher} from './acb.ts';
import {AppError,ensure} from './errors.ts';
import {auditStatement} from './audit.ts';
import {readRinconScores,type RinconScore} from './rincon.ts';
export async function refreshRinconScores(env:Runtime,user:Identity,roundId:string,number:unknown,fetcher:Fetcher=fetch,automatic=false){
 const round=await env.DB.prepare('SELECT r.*,l.owner_id FROM rounds r JOIN leagues l ON l.id=r.league_id WHERE r.id=? AND l.owner_id=?').bind(roundId,user.userId).first<{id:string;league_id:string;lock_at:number;ends_at:number;closed_at:number|null;acb_journey_number:number|null;rincon_journey_number:number|null;rincon_season:string|null}>();
 if(!round)throw new AppError(403,'OWNER_ONLY','Só o administrador pode actualizar as puntuacións da súa liga.');
 ensure(round.lock_at<=Date.now(),'A xornada aínda non comezou.');
 if(automatic)ensure(round.closed_at===null&&round.ends_at>Date.now(),'As actualizacións automáticas pararon: a xornada rematou.');
 const journey=round.rincon_journey_number??number;
 ensure(typeof journey==='number'&&Number.isInteger(journey)&&journey>=1&&journey<=50,'Indica o número de xornada de Rincón.');
 ensure((!round.rincon_season||round.rincon_season===CATALOG_SEASON)&&(!round.rincon_journey_number||number===undefined||number===round.rincon_journey_number)&&(!round.acb_journey_number||round.acb_journey_number===journey),'A xornada seleccionada non coincide coa que xa estaba vinculada.');
 const catalog=await env.DB.prepare('SELECT revision,confirmed_json FROM league_catalogs WHERE league_id=? AND season=?').bind(round.league_id,CATALOG_SEASON).first<{revision:number;confirmed_json:string}>();
 ensure(catalog,'Actualiza e revisa primeiro as equivalencias dos xogadores da liga.');
 const pairs=JSON.parse(catalog.confirmed_json) as CatalogPair[];
 const snapshots=(await env.DB.prepare('SELECT s.user_id,s.players_json,s.imported_at,s.scores_json FROM snapshots s JOIN members m ON m.user_id=s.user_id WHERE s.round_id=? AND m.league_id=?').bind(roundId,round.league_id).all()).results as {user_id:string;players_json:string;imported_at:number;scores_json:string|null}[];
 ensure(snapshots.length>0,'Aínda non hai equipos nesta xornada.');
 const ids=[...new Set(snapshots.flatMap(s=>(JSON.parse(s.players_json) as Player[]).map(p=>p.id)))];
 const missing=ids.filter(id=>pairs.filter(p=>p.acb.ref===id).length!==1);
 ensure(missing.length===0,`Faltan ${missing.length} equivalencias confirmadas. Revísalas no catálogo da liga.`);
 ensure(new Set(pairs.map(p=>p.rincon.ref)).size===pairs.length,'Hai equivalencias repetidas. Revisa o catálogo.');
 const at=Date.now();
 // Shared lease bounds requests across admin tabs. Failed reads never change scores.
 const claimed=await env.DB.prepare('UPDATE rounds SET rincon_fetch_at=? WHERE id=? AND (rincon_fetch_at IS NULL OR rincon_fetch_at<=?) RETURNING id').bind(at,roundId,at-(automatic?115000:10000)).first();
 if(!claimed)return {updated:0,pending:0,skipped:true};
 const scores=await readRinconScores(ids,pairs,journey,fetcher,at);
 if(automatic){const active=await env.DB.prepare('SELECT id FROM rounds WHERE id=? AND closed_at IS NULL AND ends_at>?').bind(roundId,Date.now()).first();ensure(active,'As actualizacións automáticas pararon: a xornada rematou.');}
 const revision=await env.DB.prepare('SELECT revision FROM league_catalogs WHERE league_id=? AND season=?').bind(round.league_id,CATALOG_SEASON).first<{revision:number}>();
 ensure(revision?.revision===catalog.revision,'As equivalencias cambiaron durante a consulta. Actualiza de novo.');
 const guard='EXISTS(SELECT 1 FROM rounds r JOIN league_catalogs c ON c.league_id=r.league_id WHERE r.id=? AND r.rincon_fetch_at=? AND c.season=? AND c.revision=? AND (?=0 OR (r.closed_at IS NULL AND r.ends_at>?)))';
 const guardArgs=[roundId,at,CATALOG_SEASON,catalog.revision,automatic?1:0,Date.now()];
 const statements=[env.DB.prepare(`UPDATE rounds SET rincon_journey_number=?,rincon_season=? WHERE id=? AND (rincon_journey_number IS NULL OR rincon_journey_number=?) AND ${guard}`).bind(journey,CATALOG_SEASON,roundId,journey,...guardArgs)];
 let pending=0;
 for(const snapshot of snapshots){
  const previous=JSON.parse(snapshot.scores_json??'[]') as RinconScore[];
  const list=(JSON.parse(snapshot.players_json) as Player[]).map(p=>{
   const fresh=scores.find(s=>s.id===p.id)!;const old=previous.find(s=>s.id===p.id);let score:RinconScore={...fresh};
   if(fresh.points===null&&old?.points!=null){score={...score,points:old.points,valuation:old.valuation,stale:true};}
   if((fresh.broker===null||fresh.brokerKind==='opening')&&old?.broker!=null&&old.source==='rincon'&&old.journey===journey){score={...score,broker:old.broker,brokerDelta:old.brokerDelta,brokerOpening:old.brokerOpening,brokerKind:old.brokerKind,brokerStale:true};}
   if(score.points===null||score.stale)pending++;return score;
  });
  const ready=list.every(s=>s.points!==null&&!s.stale);const total=ready?Math.round(list.reduce((sum,s)=>sum+s.points!,0)*100)/100:null;
  statements.push(env.DB.prepare(`UPDATE snapshots SET scores_json=?,scores_at=?,raw_points=CASE WHEN ?=1 THEN ? ELSE raw_points END WHERE round_id=? AND user_id=? AND imported_at=? AND players_json=? AND (scores_at IS NULL OR scores_at<=?) AND ${guard}`).bind(JSON.stringify(list),at,ready?1:0,total,roundId,snapshot.user_id,snapshot.imported_at,snapshot.players_json,at,...guardArgs));
 }
 statements.push(auditStatement(env,user.userId,`Consulta de Rincón da xornada ${journey}: ${ids.length} xogadores, puntos SM e broker.`));
 const saved=await env.DB.batch(statements);return {updated:saved.slice(1,-1).filter(r=>r.meta.changes>0).length,pending,skipped:false};
}
