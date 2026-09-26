import type {Runtime} from './service.ts';
import type {Player} from '../lib/model.ts';
export function auditStatement(env:Runtime,userId:string,message:string){
 return env.DB.prepare('INSERT INTO audit_events(league_id,user_id,user_name,at,message) SELECT league_id,user_id,name,?,? FROM members WHERE user_id=?').bind(Date.now(),message,userId);
}
export async function audit(env:Runtime,userId:string,message:string){await auditStatement(env,userId,message).run();}
// Only counts enter the audit trail. Player IDs stay in the private observation cache.
export async function observe(env:Runtime,userId:string,teamId:string,players:Player[],automatic:boolean){
 const previous=await env.DB.prepare('SELECT * FROM roster_observations WHERE user_id=?').bind(userId).first<{team_id:string;ids_json:string;observed_at:number}>();
 const ids=players.map(p=>p.id).sort();const old:string[]=previous?JSON.parse(previous.ids_json):[];
 const changed=previous&&previous.team_id===teamId?ids.filter(id=>!old.includes(id)).length:null;
 const at=Math.max(Date.now(),(previous?.observed_at??0)+1);
 const saved=await env.DB.prepare(`INSERT INTO roster_observations(user_id,team_id,ids_json,observed_at) SELECT ?,?,?,? WHERE COALESCE((SELECT observed_at FROM roster_observations WHERE user_id=?),-1)=? ON CONFLICT(user_id) DO UPDATE SET team_id=excluded.team_id,ids_json=excluded.ids_json,observed_at=excluded.observed_at RETURNING observed_at`).bind(userId,teamId,JSON.stringify(ids),at,userId,previous?.observed_at??-1).first();
 if(!saved)return;
 await audit(env,userId,automatic?'Actualización automática do equipo.':'Actualización manual do equipo.');
 if(changed!==null&&changed>0)await audit(env,userId,`O equipo cambiou ${changed} xogadores desde a actualización anterior.`);
 const last=await env.DB.prepare(`SELECT s.baseline_json,r.label FROM snapshots s JOIN rounds r ON r.id=s.round_id WHERE s.user_id=? AND s.team_id=? AND s.declared_at IS NOT NULL AND r.lock_at<=? AND (r.closed_at IS NOT NULL OR r.ends_at<=?) ORDER BY r.lock_at DESC LIMIT 1`).bind(userId,teamId,Date.now(),Date.now()).first<{baseline_json:string;label:string}>();
 if(last?.baseline_json){
  const baseline:Player[]=JSON.parse(last.baseline_json);const count=ids.filter(id=>!baseline.some(p=>p.id===id)).length;
  const message=`Coa xornada ${last.label} rematada, o equipo ten ${count} xogadores distintos aos declarados como iniciais; posible penalización para revisar, sen desconto automático.`;
  if(count&&((changed!==null&&changed>0)||!await env.DB.prepare('SELECT id FROM audit_events WHERE user_id=? AND message=? LIMIT 1').bind(userId,message).first()))await audit(env,userId,message);
 }
}
