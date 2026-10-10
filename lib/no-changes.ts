import type {Player,Score,Round} from './model.ts';

export function comparisonEnabled(round:Round){
 const number=round.rinconJourneyNumber??round.acbJourneyNumber??Number(round.label.match(/(?:\bJ|Xornada\s+|Jornada\s+)(\d+)/i)?.[1]);
 return Number.isInteger(number)&&number>=3;
}

// Sold-player results are optional metadata in the existing scores JSON.
// They are never added to the array used by official scores or standings.
export function noChangesTotals(previous:Player[],scores:Score[]|null){
 const available=[...(scores??[]),...(scores?.[0]?.noChangesScores??[])];
 const values=previous.map(p=>available.find(s=>s.id===p.id));
 const points=values.length&&values.every(s=>s?.source==='rincon'&&s.points!=null&&Number.isFinite(s.points)&&!s.stale)
  ?Math.round(values.reduce((sum,s)=>sum+s!.points!,0)*100)/100:null;
 const brokerDelta=values.length&&values.every(s=>s?.source==='rincon'&&s.brokerDelta!=null&&Number.isFinite(s.brokerDelta)&&!s.brokerStale)
  ?Math.round(values.reduce((sum,s)=>sum+s!.brokerDelta!,0)):null;
 return {points,brokerDelta};
}
