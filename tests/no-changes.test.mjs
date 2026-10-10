import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonEnabled,noChangesTotals} from '../lib/no-changes.ts';
import {livePoints} from '../lib/live-scores.ts';
const players=ids=>ids.map(id=>({id,name:id,position:'Base'}));
const score=(id,points,brokerDelta,extra={})=>({id,points,valuation:points,brokerDelta,source:'rincon',...extra});
test('comparison starts at journey 3, including before source binding',()=>{
 for(const n of [1,2])assert.equal(comparisonEnabled({label:`2026/27 · J${n}`}),false);
 assert.equal(comparisonEnabled({label:'Xornada 3'}),true);
 assert.equal(comparisonEnabled({label:'Other',acbJourneyNumber:4}),true);
 assert.equal(comparisonEnabled({label:'J3',rinconJourneyNumber:2}),false);
 assert.equal(comparisonEnabled({label:'Unknown'}),false);
});
test('retained and sold players give the unchanged roster; official total excludes sold metadata',()=>{
 const scores=[score('new',30,50000,{noChangesScores:[score('sold',-5,-20000)]}),score('kept',12.6,0)];
 assert.deepEqual(noChangesTotals(players(['sold','kept']),scores),{points:7.6,brokerDelta:-20000});
 assert.equal(livePoints({players:players(['new','kept']),scores}),42.6);
 assert.deepEqual(noChangesTotals(players(['new','kept']),scores),{points:42.6,brokerDelta:50000});
});
test('missing and stale results are unavailable independently for points and broker; zero is valid',()=>{
 assert.deepEqual(noChangesTotals(players(['sold']),[score('new',10,10)]),{points:null,brokerDelta:null});
 assert.deepEqual(noChangesTotals(players(['x']),[score('x',0,0)]),{points:0,brokerDelta:0});
 assert.deepEqual(noChangesTotals(players(['x']),[score('x',5,-10,{stale:true})]),{points:null,brokerDelta:-10});
 assert.deepEqual(noChangesTotals(players(['x']),[score('x',5,-10,{brokerStale:true})]),{points:5,brokerDelta:null});
 assert.deepEqual(noChangesTotals(players(['x']),[score('x',null,0)]),{points:null,brokerDelta:0});
});
