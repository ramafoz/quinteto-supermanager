import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';
import {brokerStandings,brokerDelta} from '../lib/broker.ts';
import {repairPositions,completePositions,positionCatalog} from '../server/positions.ts';
import {state} from '../server/service.ts';
const players=[{id:'1',name:'One',club:'Río Breogán',position:'Xogador'},{id:'2',name:'Two',club:'Leyma Coruña',position:'Alero'}];
const members=[{id:'u',name:'User'}];
const round=(id,start,end,number)=>({id,label:id,lockAt:start,endsAt:end,closedAt:null,rinconJourneyNumber:number,rinconSeason:'2026/27'});
const snapshot=(id,deltas,extra={})=>({roundId:id,userId:'u',players,scores:deltas.map((d,i)=>({id:String(i+1),source:'rincon',brokerDelta:d,brokerKind:'final',...extra}))});
test('broker starts at 5M, sums signed final-roster deltas once, carries previous rounds, and excludes future/live from overall',()=>{
 const rounds=[round('r1',1,10,1),round('r2',11,30,2),round('future',40,50,3)];
 const snapshots=[snapshot('r1',[100,-20]),snapshot('r2',[-40,10]),snapshot('future',[99999,99999])];
 const result=brokerStandings(members,rounds,snapshots,'r2',20);
 assert.equal(result.round[0].opening,5000080);assert.equal(result.round[0].value,5000050);assert.equal(result.round[0].provisional,true);assert.equal(result.overall[0].value,5000080);
 assert.deepEqual(brokerStandings(members,rounds,snapshots,'r2',20),result);
 snapshots[1]=snapshot('r2',[0,-4]);assert.equal(brokerStandings(members,rounds,snapshots,'r2',35).overall[0].value,5000076);
 assert.deepEqual(brokerStandings(members,rounds,snapshots,'future',20).round,[]);
});
test('pending, stale, unplayed, zero and missing-roster broker data remain distinct; extra old players ignored',()=>{
 const s=snapshot('r',[0,null]);s.scores.push({id:'sold',source:'rincon',brokerDelta:900000,brokerKind:'final'});
 assert.deepEqual(brokerDelta(s),{delta:0,missing:1,final:false});
 assert.equal(brokerDelta(snapshot('r',[0,0])).final,true);
 assert.equal(brokerDelta(snapshot('r',[10,10],{brokerStale:true})).final,false);
 assert.equal(brokerDelta(snapshot('r',[10,10],{brokerKind:'provisional'})).final,false);
 assert.equal(brokerDelta().final,false);
 const r=brokerStandings(members,[round('r',1,10,1)],[],'r',20);assert.equal(r.overall[0].value,5000000);assert.equal(r.overall[0].pendingRounds,1);
});
test('duplicate source journey is not counted twice and corrections propagate to later opening balances',()=>{
 const rounds=[round('r1',1,10,1),round('copy',11,20,1),round('r2',21,30,2)];
 const snapshots=[snapshot('r1',[10,10]),snapshot('copy',[10,10]),snapshot('r2',[10,10])];
 let result=brokerStandings(members,rounds,snapshots,'r2',40);assert.equal(result.overall[0].value,5000040);assert.equal(result.overall[0].provisional,true);
 snapshots[0]=snapshot('r1',[100,100]);result=brokerStandings(members,rounds,snapshots,'r2',40);assert.equal(result.round[0].opening,5000200);
});
function setup(){const db=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 db.exec("INSERT INTO leagues VALUES('l','League','u','hash'),('other','Other','v','h');INSERT INTO members VALUES('u','l','User'),('friend','l','Friend'),('v','other','Other');INSERT INTO rounds(id,league_id,label,lock_at,ends_at) VALUES('r','l','R',1,10),('future','l','Future',9999999999999,99999999999999),('other','other','Other',1,10)");
 const pair={acb:{ref:'1'},rincon:{ref:'one',position:'B'}};db.prepare('INSERT INTO league_catalogs VALUES(?,?,?,?,?,?,?)').run('l','2026/27',1,1,JSON.stringify({rincon:[{present:true,player:{ref:'one',position:'P'}}]}),JSON.stringify([pair]),'[]');
 for(const [r,u] of [['r','u'],['future','friend'],['other','v']])db.prepare('INSERT INTO snapshots(round_id,user_id,team_id,team_name,players_json,baseline_json,history_json,imported_at,declared_at,raw_points,manual_penalty,scores_json,scores_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(r,u,'team','Team',JSON.stringify(players),JSON.stringify(players),JSON.stringify([{at:2,incoming:players,outgoing:players,penalty:0}]),3,2,203,-4,JSON.stringify(snapshot(r,[10,20]).scores),4);
 const prepare=sql=>{let args=[];return {bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};};
 const env={DB:{prepare,async batch(statements){db.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}};return {db,env};}
test('position repair only changes unknown mapped positions in own league, including baseline/history, preserving scores and declarations',async()=>{
 const {db,env}=setup();try{await assert.rejects(repairPositions(env,{userId:'friend'}));const before=db.prepare("SELECT * FROM snapshots WHERE round_id='r'").get();
 const result=await repairPositions(env,{userId:'u'});assert.equal(result.updated,2);const after=db.prepare("SELECT * FROM snapshots WHERE round_id='r'").get();
 for(const field of ['players_json','baseline_json']){const p=JSON.parse(after[field]);assert.equal(p[0].position,'Pívot');assert.equal(p[1].position,'Alero');}
 assert.equal(JSON.parse(after.history_json)[0].incoming[0].position,'Pívot');
 for(const key of Object.keys(before).filter(k=>!['players_json','baseline_json','history_json'].includes(k)))assert.deepEqual(after[key],before[key]);
 assert.equal(JSON.parse(db.prepare("SELECT players_json FROM snapshots WHERE round_id='other'").get().players_json)[0].position,'Xogador');
 assert.equal((await repairPositions(env,{userId:'u'})).updated,0);
 assert.equal(completePositions(players,(await positionCatalog(env,'l')).positions)[0].position,'Pívot');
 assert.equal(completePositions([{id:'unknown',position:'Jugador'}],new Map())[0].position,'Jugador');
 }finally{db.close();}
});
test('state exposes broker totals only for own league, hides future round values and preserves previous overall',async()=>{
 const {db,env}=setup();try{const s=await state(env,{userId:'u',displayName:'User'},'future');assert.deepEqual(s.broker.round,[]);assert.equal(s.broker.overall.length,2);assert.equal(s.broker.overall.find(r=>r.userId==='u').value,5000030);assert.equal(s.broker.overall.some(r=>r.userId==='v'),false);}finally{db.close();}
});
