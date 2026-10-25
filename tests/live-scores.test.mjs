import test from 'node:test';
import assert from 'node:assert/strict';
import {sortPlayers,livePoints,liveNet,livePointsStatus} from '../lib/live-scores.ts';
import {mergeScore} from '../lib/score-data.ts';
import {noChangesTotals} from '../lib/no-changes.ts';
import {pollScores} from '../lib/score-polling.ts';
test('polling runs every two minutes, stops at round end, and cleanup prevents later calls',t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:1000});let calls=0,ended=0;
 const stop=pollScores(()=>calls++,()=>ended++,301000);
 t.mock.timers.tick(119999);assert.equal(calls,0);t.mock.timers.tick(1);assert.equal(calls,1);
 t.mock.timers.tick(120000);assert.equal(calls,2);t.mock.timers.tick(60000);assert.equal(ended,1);
 t.mock.timers.tick(120000);assert.equal(calls,2);stop();
 const cancel=pollScores(()=>calls++,()=>ended++,Date.now()+600000);cancel();t.mock.timers.tick(600000);assert.equal(calls,2);assert.equal(ended,1);
});
const context={season:'2026/27',journey:5};
const players=Array.from({length:10},(_,i)=>({id:String(i),name:String(i),position:'Base'}));
const rincon=(id,points,extra={})=>({id,source:'rincon',points,valuation:points,...context,observedAt:100,...extra});
test('17 stale points stay stored but are excluded from live and unchanged totals and counts',()=>{
 const stale=mergeScore(rincon('0',17),rincon('0',null,{observedAt:200}),context);
 const team={players,scores:[stale,...players.slice(1).map(p=>rincon(p.id,5))],rawPoints:62,scoresAt:200,penalty:4,scoreContext:context};
 const before=structuredClone(team);
 assert.equal(stale.points,17);assert.equal(stale.stale,true);assert.equal(livePoints(team),45);assert.equal(liveNet(team),41);
 assert.equal(livePointsStatus(team).count,9);assert.equal(livePointsStatus(team).state,'partial');
 const previous=noChangesTotals(players,team.scores,context);assert.equal(previous.points,45);assert.equal(previous.pointStatus.count,9);
 assert.deepEqual(team,before);
});
test('all stale/absent values produce no live total, never cached raw points or a penalty-only result',()=>{
 const team={players,scores:players.map(p=>rincon(p.id,17,{stale:true})),rawPoints:170,scoresAt:200,penalty:4,scoreContext:context};
 assert.equal(livePoints(team),null);assert.equal(liveNet(team),null);assert.equal(livePointsStatus(team).count,0);
 assert.equal(noChangesTotals(players,team.scores,context).points,null);
});
test('valid alternative source, wrong context, signed points and legitimate zeros use the same eligibility rule',()=>{
 const mixed=mergeScore(rincon('0',17,{stale:true}),{...rincon('0',12),source:'acb',observedAt:200},context);
 const scores=[mixed,rincon('1',-3),rincon('2',0),rincon('3',999,{journey:4}),rincon('4',999,{season:'2025/26'}),rincon('5',Infinity)];
 const team={players,scores,rawPoints:9999,scoresAt:200,penalty:-2,scoreContext:context};
 assert.equal(livePoints(team),9);assert.equal(liveNet(team),11);assert.equal(livePointsStatus(team).count,3);
 assert.equal(noChangesTotals(players,scores,context).points,9);assert.equal(noChangesTotals(players,scores,context).pointStatus.count,3);
});
test('sold metadata and extra old roster rows cannot inflate live points or counts',()=>{
 const scores=[rincon('0',5,{noChangesScores:[rincon('sold',1000)]}),rincon('extra',2000)];
 const team={players,scores,scoresAt:200,rawPoints:3005,scoreContext:context};
 assert.equal(livePoints(team),5);assert.equal(livePointsStatus(team).count,1);
 assert.equal(noChangesTotals([{id:'sold'}],scores,context).points,1000);
});
test('definitive results and manual totals/adjustments remain authoritative; zero is counted',()=>{
 const scores=players.map(p=>rincon(p.id,0,{pointsFinal:true}));
 const team={players,scores,scoresAt:200,rawPoints:0,penalty:4,scoreContext:context};
 assert.equal(livePoints(team),0);assert.equal(liveNet(team),-4);assert.equal(livePointsStatus(team).count,10);assert.equal(livePointsStatus(team).state,'final');
 const manual={...team,scores:scores.map(s=>({...s,stale:true})),scoresAt:null,rawPoints:203};
 assert.equal(livePoints(manual),203);assert.equal(liveNet(manual),199);
 assert.equal(livePoints({...team,scores:undefined,rawPoints:203}),203);
});
test('position/name sorting and coincidence direction preserve deterministic ties',()=>{
 const rows=[{id:'1',name:'Zeta',position:'Base',owners:['a']},{id:'2',name:'Ana',position:'Pívot',owners:['a','b']},{id:'3',name:'Ana',position:'Base',owners:['a']}];
 assert.deepEqual(sortPlayers(rows).map(p=>p.id),['3','1','2']);
 assert.deepEqual(sortPlayers(rows,'coincidences','desc').map(p=>p.id),['2','3','1']);
 assert.deepEqual(sortPlayers(rows,'position','desc').map(p=>p.id),['2','1','3']);
 assert.deepEqual(rows.map(p=>p.id),['1','2','3']);
});
test('live totals sum available signed points, distinguish missing from zero, and deduct penalties once',()=>{
 const team={rawPoints:200,penalty:50,scoresAt:1,scores:[{id:'1',points:12},{id:'2',points:-3},{id:'3',points:null}]};
 assert.equal(livePoints(team),9);assert.equal(liveNet(team),-41);
 assert.equal(livePoints({...team,scores:[{points:null}]}),null);
 assert.equal(livePoints({...team,rawPoints:null,scores:[{points:0}]}),0);
 assert.equal(livePoints({...team,scoresAt:null,rawPoints:203}),203);
 assert.equal(liveNet({...team,scores:null,rawPoints:203}),153);
});
