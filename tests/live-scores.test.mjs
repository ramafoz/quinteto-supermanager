import test from 'node:test';
import assert from 'node:assert/strict';
import {sortPlayers,livePoints,liveNet} from '../lib/live-scores.ts';
import {pollScores} from '../lib/score-polling.ts';
test('polling runs every two minutes, stops at round end, and cleanup prevents later calls',t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:1000});let calls=0,ended=0;
 const stop=pollScores(()=>calls++,()=>ended++,301000);
 t.mock.timers.tick(119999);assert.equal(calls,0);t.mock.timers.tick(1);assert.equal(calls,1);
 t.mock.timers.tick(120000);assert.equal(calls,2);t.mock.timers.tick(60000);assert.equal(ended,1);
 t.mock.timers.tick(120000);assert.equal(calls,2);stop();
 const cancel=pollScores(()=>calls++,()=>ended++,Date.now()+600000);cancel();t.mock.timers.tick(600000);assert.equal(calls,2);assert.equal(ended,1);
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
