import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePlayerHistory,verifyFinishedJourney,readRinconHistory} from '../server/rincon-history.ts';
const fixture=name=>readFileSync(new URL(`./fixtures/${name}.html`,import.meta.url),'utf8');
test('real historical rows give SM bonus and broker delta, independently of the current market',()=>{
 assert.deepEqual(parsePlayerHistory(fixture('tryggvi-hlinason'),'tryggvi-hlinason',1),{points:28.8,valuation:24,delta:97500,didNotPlay:false});
 assert.deepEqual(parsePlayerHistory(fixture('emir-sulejmanovic'),'emir-sulejmanovic',1),{points:0,valuation:0,delta:0,didNotPlay:true});
 verifyFinishedJourney(fixture('j1'),1);
});
test('missing rows, changed season, invalid numbers and unfinished journeys never become zero',()=>{
 assert.throws(()=>parsePlayerHistory(fixture('tryggvi-hlinason'),'tryggvi-hlinason',2));
 assert.throws(()=>parsePlayerHistory(fixture('emir-sulejmanovic').replace('2026/27','2027/28'),'emir-sulejmanovic',1));
 assert.throws(()=>parsePlayerHistory(fixture('tryggvi-hlinason').replace('data-sort="28.8"','data-sort="bad"'),'tryggvi-hlinason',1));
 assert.throws(()=>verifyFinishedJourney(fixture('j1').replace('107-92','0-0'),1));
});
test('closed round reader uses selected journey and player history, never current broker prices',async()=>{
 const urls=[];const fetcher=async url=>{urls.push(url);return new Response(fixture(url.includes('/jornada/')?'j1':'emir-sulejmanovic'));};
 const [score]=await readRinconHistory(['1'],[{acb:{ref:'1'},rincon:{ref:'emir-sulejmanovic'}}],1,fetcher,123);
 assert.equal(score.points,0);assert.equal(score.brokerDelta,0);assert.equal(score.brokerKind,'final');assert.equal(score.observedAt,123);assert.equal(urls.length,2);assert.equal(score.broker,null);
});
