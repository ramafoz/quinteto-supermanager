import type {Runtime,Identity} from './service.ts';
import type {Player} from '../lib/model.ts';
import {CATALOG_SEASON,type CatalogPair,type CatalogDocument} from '../lib/catalog.ts';
import {AppError} from './errors.ts';
import {audit} from './audit.ts';
export async function positionCatalog(env:Runtime,leagueId:string){
 const saved=await env.DB.prepare('SELECT revision,confirmed_json,document_json FROM league_catalogs WHERE league_id=? AND season=?').bind(leagueId,CATALOG_SEASON).first<{revision:number;confirmed_json:string;document_json:string}>();
 const positions=new Map<string,string>();if(!saved)return {positions,revision:null};
 const document=JSON.parse(saved.document_json) as CatalogDocument;
 for(const p of JSON.parse(saved.confirmed_json) as CatalogPair[]){const source=document.rincon?.find(e=>e.present&&e.player.ref===p.rincon.ref)?.player??p.rincon;const value=({B:'Base',A:'Alero',P:'Pívot'} as Record<string,string>)[source.position];if(value)positions.set(p.acb.ref,value);}
 return {positions,revision:saved.revision};
}
export function completePositions<T extends Player>(players:T[],positions:Map<string,string>):T[]{return players.map(p=>!p.position||['xogador','jugador'].includes(p.position.trim().toLowerCase())?{...p,position:positions.get(p.id)??p.position}:p);}
export async function repairPositions(env:Runtime,user:Identity){
 const owner=await env.DB.prepare('SELECT id FROM leagues WHERE owner_id=?').bind(user.userId).first<{id:string}>();
 if(!owner)throw new AppError(403,'OWNER_ONLY','Só o administrador pode completar as posicións.');
 const {positions,revision}=await positionCatalog(env,owner.id);if(revision===null)return {updated:0};
 const rows=(await env.DB.prepare('SELECT s.round_id,s.user_id,s.players_json,s.baseline_json,s.history_json FROM snapshots s JOIN rounds r ON r.id=s.round_id WHERE r.league_id=?').bind(owner.id).all()).results;
 const statements=[];
 for(const row of rows){
  const players=JSON.stringify(completePositions(JSON.parse(row.players_json as string),positions));
  const baseline=row.baseline_json===null?null:JSON.stringify(completePositions(JSON.parse(row.baseline_json as string),positions));
  const history=JSON.stringify(JSON.parse(row.history_json as string).map((h:{incoming:Player[];outgoing:Player[]})=>({...h,incoming:completePositions(h.incoming,positions),outgoing:completePositions(h.outgoing,positions)})));
  if(players===row.players_json&&baseline===row.baseline_json&&history===row.history_json)continue;
  statements.push(env.DB.prepare('UPDATE snapshots SET players_json=?,baseline_json=?,history_json=? WHERE round_id=? AND user_id=? AND players_json=? AND baseline_json IS ? AND history_json=? AND EXISTS(SELECT 1 FROM league_catalogs WHERE league_id=? AND season=? AND revision=?)').bind(players,baseline,history,row.round_id,row.user_id,row.players_json,row.baseline_json,row.history_json,owner.id,CATALOG_SEASON,revision));
 }
 let updated=0;for(let i=0;i<statements.length;i+=50){const results=await env.DB.batch(statements.slice(i,i+50));updated+=results.reduce((n,r)=>n+r.meta.changes,0);}
 if(updated)await audit(env,user.userId,`Posicións pendentes completadas con Rincón en ${updated} cadros gardados.`);
 return {updated};
}
