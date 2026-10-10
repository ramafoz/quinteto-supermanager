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

test('real J2 with eight final games accepts Hlinason results without treating postponed clubs as unplayed',async()=>{
 const journey=fixture('j2-postponed');const finished=verifyFinishedJourney(journey,2);
 assert.equal(finished.size,16);assert.equal(finished.has('JOV'),false);assert.equal(finished.has('BLB'),true);
 assert.deepEqual(parsePlayerHistory(fixture('hlinason-j2'),'tryggvi-hlinason',2),{points:23,valuation:23,delta:112125,didNotPlay:false});
 const absent=fixture('emir-sulejmanovic').replace('data-sort="1"','data-sort="2"');
 const pending={points:null,valuation:null,delta:null,didNotPlay:false};
 assert.deepEqual(parsePlayerHistory(absent,'emir-sulejmanovic',2,false),pending);
 assert.deepEqual(parsePlayerHistory(absent,'emir-sulejmanovic',2,true),{points:0,valuation:0,delta:0,didNotPlay:true});
 assert.deepEqual(parsePlayerHistory(fixture('emir-sulejmanovic'),'emir-sulejmanovic',2,false),pending);
 const pairs=[{acb:{ref:'played'},rincon:{ref:'tryggvi-hlinason',club:'BLB'}},{acb:{ref:'postponed'},rincon:{ref:'emir-sulejmanovic',club:'JOV'}},{acb:{ref:'injured'},rincon:{ref:'emir-sulejmanovic',club:'ZAR'}}];
 const scores=await readRinconHistory(['played','postponed','injured'],pairs,2,async url=>new Response(url.includes('/jornada/')?journey:url.endsWith('tryggvi-hlinason')?fixture('hlinason-j2'):absent));
 assert.equal(scores[0].points,23);assert.equal(scores[0].brokerDelta,112125);
 assert.equal(scores[1].points,null);assert.equal(scores[1].brokerDelta,null);assert.equal(scores[1].brokerKind,null);assert.equal(scores[1].didNotPlay,false);
 assert.equal(scores[2].points,0);assert.equal(scores[2].brokerDelta,0);assert.equal(scores[2].didNotPlay,true);
 assert.throws(()=>verifyFinishedJourney(journey.replace('Jornada 2','Jornada 1'),2));
 assert.throws(()=>verifyFinishedJourney(journey.replace('75-80','0-0'),2));
 assert.throws(()=>verifyFinishedJourney(journey+'<a aria-label="Acta del partido UNI 75-80 CAN">',2));
});

test('real Juan Núñez J2 row is unplayed even though the opponent is populated',async()=>{
 const html=fixture('juan-nunez-j2');
 assert.deepEqual(parsePlayerHistory(html,'juan-nunez',2,true),{points:0,valuation:0,delta:0,didNotPlay:true});
 assert.deepEqual(parsePlayerHistory(html,'juan-nunez',2,false),{points:null,valuation:null,delta:null,didNotPlay:false});
 assert.deepEqual(parsePlayerHistory(html,'juan-nunez',1,true),{points:15.6,valuation:13,delta:30000,didNotPlay:false});
 const scores=await readRinconHistory(['182'],[{acb:{ref:'182'},rincon:{ref:'juan-nunez',name:'Juan Núñez',club:'FCB'}}],2,async url=>new Response(url.includes('/jornada/')?fixture('j2-postponed'):html));
 assert.equal(scores[0].points,0);assert.equal(scores[0].brokerDelta,0);assert.equal(scores[0].didNotPlay,true);
 // Missing data on a played row still fails instead of masquerading as unplayed.
 assert.throws(()=>parsePlayerHistory(html.replace('data-sort="15.6"','data-sort="bad"'),'juan-nunez',1));
});
test('historical source failures identify the player and journey',async()=>{
 await assert.rejects(readRinconHistory(['182'],[{acb:{ref:'182'},rincon:{ref:'juan-nunez',name:'Juan Núñez',club:'FCB'}}],2,async url=>new Response(url.includes('/jornada/')?fixture('j2-postponed'):'bad profile')),/Juan Núñez.*xornada 2/);
});
