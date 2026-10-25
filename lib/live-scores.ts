import type {Lineup,Player} from './model.ts';
import {pointsTotal,finite} from './score-data.ts';
export function livePointsStatus(team:Lineup){return pointsTotal(team.players,team.scores,team.scoreContext);}
export function livePoints(team:Lineup){
 // A manual total deliberately has scoresAt=null; do not reinterpret it as a
 // stale automatic cache. Otherwise a partial sum must never fall back to rawPoints.
 if(!team.scores||team.scoresAt===null)return finite(team.rawPoints)?team.rawPoints:null;
 const total=livePointsStatus(team);
 return total.count===total.expected&&total.count>0&&finite(team.rawPoints)?team.rawPoints:total.value;
}
export function liveNet(team:Lineup){const points=livePoints(team);return points===null?null:Math.round((points-(team.penalty??0))*100)/100;}
export function sortPlayers<T extends Player & {owners?:string[]}>(players:T[],by='position',direction='asc'){
 const rank=(p:Player)=>({Base:1,Alero:2,Ala:2,'Pívot':3}[p.position]??4);
 const name=(a:T,b:T)=>rank(a)-rank(b)||a.name.localeCompare(b.name,'gl');
 return [...players].sort((a,b)=>(direction==='desc'?-1:1)*(by==='coincidences'?((a.owners?.length??0)-(b.owners?.length??0)):name(a,b))||(by==='coincidences'?name(a,b):0));
}
