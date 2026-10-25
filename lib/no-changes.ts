import type {Player,Score,Round} from './model.ts';
import {allSavedScores,brokerObservation,pointsTotal,finite,totalStatus,type ScoreContext} from './score-data.ts';

export function comparisonEnabled(round:Round){
 const number=round.rinconJourneyNumber??round.acbJourneyNumber??Number(round.label.match(/(?:\bJ|Xornada\s+|Jornada\s+)(\d+)/i)?.[1]);
 return Number.isInteger(number)&&number>=2;
}

// Sold-player results are optional metadata in the existing scores JSON.
// They are never added to the array used by official scores or standings.
export function noChangesTotals(previous:Player[],scores:Score[]|null,context?:ScoreContext){
 const available=allSavedScores(scores??[]);
 const values=previous.map(p=>available.find(s=>s.id===p.id));
 const pointStatus=pointsTotal(previous,available,context);
 const brokerStatus=totalStatus(values.map(v=>{const s=brokerObservation(v,context);return {value:s&&!s.brokerStale&&s.brokerKind!=='opening'&&finite(s.brokerDelta)?s.brokerDelta:null,final:s?.brokerKind==='final'};}));
 return {points:pointStatus.value,brokerDelta:brokerStatus.value,pointStatus,brokerStatus};
}
