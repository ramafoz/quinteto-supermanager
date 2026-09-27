import type {Lineup,Player} from './model.ts';
export function livePoints(team:Lineup){
 if(team.rawPoints!=null&&(!team.scores||team.scoresAt===null||team.scores.every(s=>s.points!==null&&!s.stale)))return team.rawPoints;
 const published=team.scores?.filter(s=>s.points!==null);
 return published?.length?Math.round(published.reduce((sum,s)=>sum+s.points!,0)*100)/100:team.scores?null:team.rawPoints??null;
}
export function liveNet(team:Lineup){const points=livePoints(team);return points===null?null:Math.round((points-(team.penalty??0))*100)/100;}
export function sortPlayers<T extends Player & {owners?:string[]}>(players:T[],by='position',direction='asc'){
 const rank=(p:Player)=>({Base:1,Alero:2,Ala:2,'Pívot':3}[p.position]??4);
 const name=(a:T,b:T)=>rank(a)-rank(b)||a.name.localeCompare(b.name,'gl');
 return [...players].sort((a,b)=>(direction==='desc'?-1:1)*(by==='coincidences'?((a.owners?.length??0)-(b.owners?.length??0)):name(a,b))||(by==='coincidences'?name(a,b):0));
}
