import type {Player,Score,Round,TotalStatus} from './model.ts';
import {CATALOG_SEASON} from './catalog.ts';
export type ScoreContext={season:string;journey:number};
export const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
export function contextFor(round:Round):ScoreContext|undefined{
 const journey=round.rinconJourneyNumber??round.acbJourneyNumber??Number(round.label.match(/(?:\bJ|Xornada\s+|Jornada\s+)(\d+)/i)?.[1]);
 return Number.isInteger(journey)&&journey>0?{season:round.rinconSeason??CATALOG_SEASON,journey}:undefined;
}
export function inContext(s:Score|undefined,c?:ScoreContext){return !!s&&(!c||(s.journey===c.journey&&s.season===c.season));}
export function sourceScore(s:Score|undefined,source:'acb'|'rincon',c?:ScoreContext){
 const value=s?.sourceResults?.[source]??(s&&(s.source??'acb')===source?s:undefined);
 return inContext(value,c)?value:undefined;
}
export function pointsAreFinal(s:Score|undefined){return s?.pointsFinal??(s?.source==='rincon'&&s.brokerKind==='final');}
// Prefer a valid observation over a missing/stale one, irrespective of which
// source was refreshed last. A verified final result cannot regress to live data.
export function bestPoints(s:Score|undefined,c?:ScoreContext,preferred=s?.source){
 const candidates=[sourceScore(s,'acb',c),sourceScore(s,'rincon',c)].filter((v):v is Score=>!!v&&finite(v.points));
 const excluded=candidates.find(v=>v.zeroEvidence==='supermanager-exclusion');if(excluded)return excluded;
 return candidates.sort((a,b)=>Number(!!a.stale)-Number(!!b.stale)||Number(pointsAreFinal(b))-Number(pointsAreFinal(a))||(b.pointsObservedAt??b.observedAt??0)-(a.pointsObservedAt??a.observedAt??0)||Number(b.source===preferred)-Number(a.source===preferred))[0];
}
export function brokerObservation(s:Score|undefined,c?:ScoreContext){
 const acb=sourceScore(s,'acb',c),rincon=sourceScore(s,'rincon',c);
 return rincon?.zeroEvidence==='supermanager-exclusion'?rincon:acb?.zeroEvidence==='supermanager-exclusion'?acb:rincon;
}
function leaf(s:Score,c:ScoreContext,source:'acb'|'rincon',legacy=false):Score|undefined{
 // Only unlabelled legacy values inherit their containing snapshot's context.
 if(s.journey!==undefined&&s.journey!==c.journey||s.season!==undefined&&s.season!==c.season)return;
 if(!legacy&&(s.journey!==c.journey||s.season!==c.season))return;
 const {sourceResults:noSources,noChangesScores:noComparison,...value}=s;
 return {...value,source,journey:c.journey,season:c.season,pointsFinal:value.pointsFinal??(source==='rincon'&&value.brokerKind==='final'&&!value.stale)};
}
export function mergeScore(old:Score|undefined,fresh:Score|undefined,c:ScoreContext):Score{
 const id=fresh?.id??old!.id;
 const sources:{acb?:Score;rincon?:Score}={};
 for(const kind of ['acb','rincon'] as const){
  const prior=old?.sourceResults?.[kind]??(old&&(old.source??'acb')===kind?old:undefined);
  if(prior)sources[kind]=leaf(prior,c,kind,true);
 }
 let preferred=old?.source??'acb';
 if(fresh){
  const kind=fresh.source==='rincon'?'rincon':'acb';let f=leaf(fresh,c,kind);const p=sources[kind];
  if(f?.zeroEvidence&&f.zeroEvidence!=='supermanager-exclusion'&&Object.values(sources).some(s=>s&&s.readStatus!=='conflict'&&(s.participation==='played'||finite(s.points)&&s.points!==0))){
   // A player already observed participating cannot return to "not yet played".
   f={...f,points:null,valuation:null,pointsFinal:false,brokerDelta:null,broker:f.brokerOpening??null,brokerKind:f.brokerOpening==null?null:'opening',participation:'unknown',didNotPlay:false,readStatus:'conflict',zeroEvidence:undefined};
  }
  if(f&&(!p||(f.observedAt??0)>=(p.observedAt??0))){
   let next={...p,...f,stale:!!f.stale,brokerStale:!!f.brokerStale,pointsObservedAt:f.observedAt,brokerObservedAt:f.observedAt};
   if(kind==='rincon'&&finite(f.brokerDelta)&&!finite(f.brokerOpening)&&finite(p?.brokerOpening))
    next={...next,brokerOpening:p!.brokerOpening,broker:p!.brokerOpening!+f.brokerDelta};
   if(p&&finite(p.points)&&(!finite(f.points)||p.pointsFinal&&!f.pointsFinal))
    next={...next,points:p.points,valuation:p.valuation,pointsFinal:p.pointsFinal,pointsObservedAt:p.pointsObservedAt??p.observedAt,didNotPlay:p.didNotPlay,participation:p.participation,zeroEvidence:p.zeroEvidence,stale:p.pointsFinal?!!p.stale:true};
   if(kind==='rincon'&&p&&finite(p.brokerDelta)&&(!finite(f.brokerDelta)||p.brokerKind==='final'&&f.brokerKind!=='final'))
    next={...next,broker:p.broker,brokerDelta:p.brokerDelta,brokerOpening:p.brokerOpening,brokerKind:p.brokerKind,brokerObservedAt:p.brokerObservedAt??p.observedAt,brokerStale:p.brokerKind==='final'?!!p.brokerStale:true};
   sources[kind]=next;preferred=kind;
  }
 }
 const points=bestPoints({id,points:null,valuation:null,sourceResults:sources},c,preferred)??sources[preferred as 'acb'|'rincon']??sources.rincon??sources.acb;
 const broker=brokerObservation({id,points:null,valuation:null,sourceResults:sources},c);
 return {...old,...points,id,points:finite(points?.points)?points.points:null,valuation:finite(points?.valuation)?points.valuation:null,source:points?.source??preferred,stale:points?.stale,pointsFinal:points?.pointsFinal,pointsObservedAt:points?.pointsObservedAt,observedAt:points?.observedAt,didNotPlay:points?.didNotPlay,playing:points?.playing,journey:c.journey,season:c.season,
  sourceResults:sources,matchState:broker?.matchState,participation:broker?.participation,readStatus:broker?.readStatus,zeroEvidence:broker?.zeroEvidence,broker:broker?.broker??null,brokerDelta:broker?.brokerDelta??null,brokerOpening:broker?.brokerOpening??null,brokerKind:broker?.brokerKind??null,brokerStale:broker?.brokerStale};
}
export function allSavedScores(scores:Score[]){return [...scores,...scores.flatMap(s=>s.noChangesScores??[])];}
// A roster refresh must not erase the other source or sold-player cache.
export function rebaseScores(scores:Score[],players:Player[]):Score[]{
 const all=allSavedScores(scores),ids=new Set(players.map(p=>p.id));
 const rows:Score[]=players.map(p=>{const old=all.find(s=>s.id===p.id);return old?{...old,noChangesScores:undefined}:{id:p.id,points:null,valuation:null};});
 if(rows.length)rows[0].noChangesScores=[...new Map(all.filter(s=>!ids.has(s.id)).map(s=>{const {noChangesScores:unused,...value}=s;return [s.id,value] as const;})).values()];
 return rows;
}
export function totalStatus(values:{value:number|null;final:boolean}[],expected=values.length):TotalStatus{
 const valid=values.filter(v=>finite(v.value)),count=valid.length,finalCount=valid.filter(v=>v.final).length;
 return {value:count?Math.round(valid.reduce((sum,v)=>sum+v.value!,0)*100)/100:null,count,expected,finalCount,state:!count?'missing':count<expected?'partial':finalCount<expected?'provisional':'final'};
}
export function brokerTotal(players:Player[],scores:Score[]|null|undefined,c?:ScoreContext){
 return totalStatus(players.map(p=>{const s=brokerObservation(scores?.find(s=>s.id===p.id),c);return {value:s&&!s.brokerStale&&s.brokerKind!=='opening'&&finite(s.brokerDelta)?s.brokerDelta:null,final:s?.brokerKind==='final'};}));
}
// One eligibility rule for live teams, historical comparisons and completeness.
export function pointsTotal(players:Player[]|undefined,scores:Score[]|null|undefined,c?:ScoreContext){
 const rows=players?players.map(p=>scores?.find(s=>s.id===p.id)):scores??[];
 return totalStatus(rows.map(row=>{
  // Pre-sourceResults ACB records were scoped by their containing snapshot.
  // Interpret that legacy form without rewriting it or accepting explicit mismatches.
  const legacy=c&&row&&!row.sourceResults&&(row.source??'acb')==='acb'&&row.journey===undefined&&row.season===undefined?{...row,...c}:row;
  const s=bestPoints(legacy,c);return {value:s&&!s.stale&&finite(s.points)?s.points:null,final:pointsAreFinal(s)};
 }));
}
export function statusLabel(total:TotalStatus){
 return total.state==='missing'?`Pendente · 0/${total.expected}`:total.state==='partial'?`Parcial · ${total.count}/${total.expected}`:total.state==='provisional'?`Provisional · ${total.count}/${total.expected}`:'Definitivo';
}
