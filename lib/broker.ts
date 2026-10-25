import type {Player,Score,Round} from './model.ts';
import {quota} from './quota.ts';
import {brokerTotal,type ScoreContext,contextFor} from './score-data.ts';
export const INITIAL_BROKER=5_000_000;
export type BrokerRow={userId:string;name:string;opening:number;delta:number;value:number;counted:number;pendingRounds:number;missing:number;provisional:boolean};
export type BrokerSnapshot={roundId:string;userId:string;players:Player[];scores:Score[]|null};
export function brokerDelta(snapshot?:BrokerSnapshot,context?:ScoreContext){
 if(!snapshot||!snapshot.players.length||quota(snapshot.players).status!=='valid')return {delta:0,missing:snapshot?.players.length||10,final:false};
  const total=brokerTotal(snapshot.players,snapshot.scores,context);
  return {delta:Math.round(total.value??0),missing:total.expected-total.count,final:total.state==='final'};
}
// Recompute from saved snapshots, never increment a balance during a refresh.
export function brokerStandings(members:{id:string;name:string}[],rounds:Round[],snapshots:BrokerSnapshot[],selectedId?:string,now=Date.now()){
 const ended=(r:Round)=>r.closedAt!==null||r.endsAt<=now;
 const selected=rounds.find(r=>r.id===selectedId);
 const started=rounds.filter(r=>r.lockAt<=now).sort((a,b)=>a.lockAt-b.lockAt||a.id.localeCompare(b.id));
 const calculate=(person:{id:string;name:string},selection?:Round):BrokerRow=>{
  let opening=INITIAL_BROKER,delta=0,counted=0,pendingRounds=0,missing=0,provisional=false;
  const seen=new Set<string>();
  for(const r of started.filter(r=>selection?(r.lockAt<selection.lockAt||r.id===selection.id):ended(r))){
   const current=r.id===selection?.id;
   const key=r.rinconJourneyNumber?`${r.rinconSeason}:${r.rinconJourneyNumber}`:r.id;
   if(seen.has(key)||(!current&&!ended(r))){pendingRounds++;provisional=true;continue;}seen.add(key);
    const result=brokerDelta(snapshots.find(s=>s.roundId===r.id&&s.userId===person.id),contextFor(r));
   if(current)delta=result.delta;else opening+=result.delta;
   missing+=result.missing;
   if(!result.final){pendingRounds++;provisional=true;}else counted++;
   if(current&&!ended(r))provisional=true;
  }
  return {userId:person.id,name:person.name,opening:selection?opening:INITIAL_BROKER,delta:selection?delta:opening-INITIAL_BROKER,value:opening+delta,counted,pendingRounds,missing,provisional};
 };
 return {overall:members.map(m=>calculate(m)),round:selected&&selected.lockAt<=now?members.map(m=>calculate(m,selected)):[]};
}
