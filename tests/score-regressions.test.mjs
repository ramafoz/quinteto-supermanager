import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {brokerTotal,mergeScore,sourceScore,rebaseScores,statusLabel} from '../lib/score-data.ts';
import {noChangesTotals} from '../lib/no-changes.ts';
import {saveSnapshotResults} from '../server/score-storage.ts';
import {refreshScores} from '../server/scoring.ts';
import {readRinconHistory} from '../server/rincon-history.ts';
import {encrypt} from '../server/crypto.ts';
const c={journey:5,season:'2026/27'};
const players=Array.from({length:10},(_,i)=>({id:String(i+1),name:`Player ${i+1}`,position:'Base',club:i<2?'Río Breogán':'FCB'}));
const r=(id,delta,extra={})=>({id,source:'rincon',points:10,valuation:10,pointsFinal:false,broker:100000+(delta??0),brokerOpening:100000,brokerDelta:delta,brokerKind:'provisional',observedAt:100,...c,...extra});
const a=(id,points=20,extra={})=>({id,source:'acb',points,valuation:points,observedAt:101,...c,...extra});

test('J5 broker sums signed available deltas, counts real zeros, and excludes missing/stale/wrong-round data',()=>{
 const total=brokerTotal(players,[r('1',107081),r('2',-7000),r('3',0),r('4',null),r('5',500,{brokerStale:true}),r('6',900,{journey:4}),r('7',900,{season:'2025/26'}),r('8',0,{brokerKind:'opening'})],c);
 assert.deepEqual(total,{value:100081,count:3,expected:10,finalCount:0,state:'partial'});
 assert.equal(statusLabel(total),'Parcial · 3/10');
 assert.equal(brokerTotal(players,[],c).value,null);
});
test('ten available players are provisional until all ten are final, including definitive zeros',()=>{
 const values=players.map(p=>r(p.id,0,{brokerKind:'final'}));
 values[9].brokerKind='provisional';assert.equal(brokerTotal(players,values,c).state,'provisional');
 values[9].brokerKind='final';assert.deepEqual(brokerTotal(players,values,c),{value:0,count:10,expected:10,finalCount:10,state:'final'});
 assert.equal(statusLabel(brokerTotal(players,values,c)),'Definitivo');
});
test('J4 unchanged roster includes sold players; points and broker have independent partial counts',()=>{
 const context={...c,journey:4};
 const scores=[{...r('new',999,{journey:4}),noChangesScores:[r('1',-50,{journey:4,points:-4,brokerKind:'final',pointsFinal:true}),r('2',null,{journey:4,points:12})]},r('3',0,{journey:4,points:null})];
 const t=noChangesTotals(players,scores,context);
 assert.equal(t.points,8);assert.equal(t.pointStatus.count,2);
 assert.equal(t.brokerDelta,-50);assert.equal(t.brokerStatus.count,2);assert.equal(t.brokerStatus.state,'partial');
 assert.equal(noChangesTotals(players,scores,c).points,null);
});
for(const order of ['rincon-first','acb-first'])test(`independent sources in ${order} order preserve broker, sold-player cache and provenance`,()=>{
 const rincon=r('1',100,{brokerKind:'final',pointsFinal:true}),acb=a('1');
 let row=mergeScore(undefined,order==='rincon-first'?rincon:acb,c);
 row.noChangesScores=[r('sold',-9)];
 row=mergeScore(row,order==='rincon-first'?acb:rincon,c);
 assert.equal(sourceScore(row,'acb',c).points,20);assert.equal(sourceScore(row,'rincon',c).points,10);
 assert.equal(brokerTotal([players[0]],[row],c).value,100);
 assert.equal(noChangesTotals([{id:'sold'}],[row],c).brokerDelta,-9);
 assert.equal(row.noChangesScores[0].id,'sold');assert.equal(row.sourceResults.rincon.journey,5);
});
test('legacy v23 rows are understood without rewriting history; unknown and mismatched contexts are not current totals',()=>{
 const legacy=r('1',100,{pointsFinal:undefined,brokerKind:'final'}),copy=structuredClone(legacy);
 assert.equal(brokerTotal([players[0]],[legacy],c).value,100);
 const merged=mergeScore(legacy,a('1'),c);
 assert.equal(merged.sourceResults.rincon.pointsFinal,true);assert.deepEqual(legacy,copy);
 assert.equal(brokerTotal([players[0]],[r('1',100,{journey:undefined})],c).value,null);
 assert.equal(sourceScore(mergeScore(r('1',900,{journey:4}),a('1'),c),'rincon',c),undefined);
});
test('same-round final results survive failed/older/provisional refreshes and keep their actual observation time',()=>{
 const old=r('1',-100,{points:-2,brokerKind:'final',pointsFinal:true,observedAt:100});
 const failed=mergeScore(old,r('1',null,{points:null,pointsFinal:false,observedAt:200,brokerKind:'opening'}),c);
 assert.equal(failed.points,-2);assert.equal(failed.stale,false);assert.equal(failed.brokerDelta,-100);assert.equal(!!failed.brokerStale,false);
 assert.equal(failed.sourceResults.rincon.pointsObservedAt,100);assert.equal(failed.sourceResults.rincon.brokerObservedAt,100);
 const older=mergeScore(failed,r('1',999,{observedAt:50}),c);assert.equal(older.brokerDelta,-100);
 const corrected=mergeScore(failed,r('1',-200,{points:0,pointsFinal:true,brokerKind:'final',observedAt:300}),c);assert.equal(corrected.brokerDelta,-200);assert.equal(corrected.points,0);
});
test('historical final delta retains the verified opening price from the live round',()=>{
 const final=mergeScore(r('1',10),r('1',-100,{broker:null,brokerOpening:null,pointsFinal:true,brokerKind:'final',observedAt:200}),c);
 assert.equal(final.brokerOpening,100000);assert.equal(final.broker,99900);assert.equal(final.brokerDelta,-100);
});
test('failed provisional results remain stored as previous data but are excluded from current totals',()=>{
 const stale=mergeScore(r('1',100),r('1',null,{points:null,observedAt:200,brokerKind:'opening'}),c);
 assert.equal(stale.brokerDelta,100);assert.equal(stale.brokerStale,true);assert.equal(stale.stale,true);
 assert.equal(brokerTotal([players[0]],[stale],c).value,null);
 const recovered=mergeScore(stale,r('1',-30,{points:0,observedAt:300}),c);
 assert.equal(recovered.stale,false);assert.equal(recovered.brokerStale,false);assert.equal(brokerTotal([players[0]],[recovered],c).value,-30);
 const acb=mergeScore(stale,a('1',0,{observedAt:300}),c);assert.equal(acb.points,0);assert.equal(acb.stale,false);
 assert.equal(acb.sourceResults.rincon.brokerStale,true);
});
test('roster rebase retains independent source data and sold cache while new players remain pending',()=>{
 const previous=[mergeScore(r('1',50),a('1'),c),r('2',-10)];previous[0].noChangesScores=[r('older-sold',3)];
 const next=rebaseScores(previous,[players[0],{id:'new'}]);
 assert.equal(next.length,2);assert.equal(next[1].points,null);assert.equal(next[0].sourceResults.acb.points,20);
 assert.deepEqual(new Set(next[0].noChangesScores.map(s=>s.id)),new Set(['2','older-sold']));
 assert.equal(noChangesTotals([players[0],players[1]],next,c).brokerDelta,40);
});

function memory(){
 const db=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 db.exec("INSERT INTO leagues VALUES('l','Fixture','owner','hash');INSERT INTO members VALUES('owner','l','Owner');INSERT INTO rounds(id,league_id,label,lock_at,ends_at,rincon_journey_number,rincon_season) VALUES('r','l','J5',1,9999999999999,5,'2026/27')");
 const roster=JSON.stringify(players);db.prepare('INSERT INTO snapshots(round_id,user_id,team_id,team_name,players_json,imported_at,declared_at,manual_penalty,history_json,baseline_json) VALUES(?,?,?,?,?,?,?,?,?,?)').run('r','owner','team','Fixture',roster,1,1,4,'[{"at":1,"incoming":[],"outgoing":[]}]',roster);
 let beforeWrite;
 const prepare=sql=>{let args=[];return {bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){if(beforeWrite&&sql.startsWith('UPDATE snapshots SET scores_json')){const f=beforeWrite;beforeWrite=undefined;f();}return {meta:{changes:db.prepare(sql).run(...args).changes}};}};};
 const env={DB:{prepare},TOKEN_ENCRYPTION_KEY:'a1'.repeat(32)};
 const snapshot={user_id:'owner',players_json:roster,imported_at:1};
 return {db,env,snapshot,interfere:f=>{beforeWrite=f;}};
}
const guard='EXISTS(SELECT 1 FROM rounds WHERE id=?)';
test('database CAS retries a simultaneous source write and preserves both sources and all non-score fields',async()=>{
 const {db,env,snapshot,interfere}=memory();try{
  const before=db.prepare('SELECT * FROM snapshots').get();
  interfere(()=>db.prepare('UPDATE snapshots SET scores_json=?,scores_at=2').run(JSON.stringify(players.map(p=>a(p.id)))));
  const saved=await saveSnapshotResults(env,'r',snapshot,players.map(p=>r(p.id,100)),c,200,guard,['r']);
  assert.equal(saved.updated,true);
  const after=db.prepare('SELECT * FROM snapshots').get(),rows=JSON.parse(after.scores_json);
  assert.equal(rows.length,10);for(const row of rows){assert.equal(row.sourceResults.acb.points,20);assert.equal(row.sourceResults.rincon.brokerDelta,100);}
  for(const key of Object.keys(before).filter(k=>!['scores_json','scores_at','raw_points'].includes(k)))assert.deepEqual(after[key],before[key],key);
 }finally{db.close();}
});
test('roster import concurrent with score save is respected rather than overwritten',async()=>{
 const {db,env,snapshot,interfere}=memory();try{
  interfere(()=>db.exec('UPDATE snapshots SET imported_at=2'));
  assert.equal((await saveSnapshotResults(env,'r',snapshot,players.map(p=>r(p.id,100)),c,200,guard,['r'])).updated,false);
  assert.equal(db.prepare('SELECT scores_json FROM snapshots').get().scores_json,null);
 }finally{db.close();}
});
test('closed-round guard prevents a delayed automatic write',async()=>{
 const {db,env,snapshot}=memory();try{
  db.exec('UPDATE rounds SET closed_at=1');
  assert.equal((await saveSnapshotResults(env,'r',snapshot,players.map(p=>r(p.id,100)),c,200,'EXISTS(SELECT 1 FROM rounds WHERE id=? AND closed_at IS NULL)',['r'])).updated,false);
 }finally{db.close();}
});
test('actual ACB refresh preserves stored Rincón current/sold results, history, baseline and manual penalty',async()=>{
 const {db,env,snapshot}=memory();try{
  const token=await encrypt('fixture-token',env.TOKEN_ENCRYPTION_KEY,'owner');db.prepare('INSERT INTO acb_links VALUES(?,?,?,?,?,?)').run('owner',token,Date.now()+999999,'team','Fixture','[]');
  await saveSnapshotResults(env,'r',snapshot,[...players.map(p=>r(p.id,100)),r('sold',-100,{points:-4})],c,100,guard,['r']);
  const before=db.prepare('SELECT * FROM snapshots').get();
  const result=await refreshScores(env,{userId:'owner'},'r','5',async(url,init)=>{
   assert.equal(init.headers.Authorization,'Bearer fixture-token');
   return Response.json(url.includes('/journey/')?[{journeyList:[{idJourney:5,number:5}]}]:{idPlayer:url.split('/').at(-1),playerStats:[{numberJourney:5,pointsJourney:10,bonusVictory:12}]});
  });
  assert.equal(result.updated,1);
  const after=db.prepare('SELECT * FROM snapshots').get(),rows=JSON.parse(after.scores_json);
  assert.equal(after.raw_points,120);assert.equal(rows[0].sourceResults.acb.points,12);assert.equal(rows[0].sourceResults.rincon.brokerDelta,100);
  assert.equal(rows[0].noChangesScores[0].id,'sold');assert.equal(rows[0].noChangesScores[0].brokerDelta,-100);
  for(const key of ['baseline_json','history_json','manual_penalty','declared_at','players_json','imported_at'])assert.equal(after[key],before[key]);
 }finally{db.close();}
});
test('ACB cannot bind another journey over an existing Rincón round',async()=>{
 const {db,env}=memory();try{
  const token=await encrypt('fixture-token',env.TOKEN_ENCRYPTION_KEY,'owner');db.prepare('INSERT INTO acb_links VALUES(?,?,?,?,?,?)').run('owner',token,Date.now()+999999,'team','Fixture','[]');
  const before=JSON.stringify(db.prepare('SELECT * FROM snapshots').all());let calls=0;
  await assert.rejects(refreshScores(env,{userId:'owner'},'r','6',async()=>{calls++;return Response.json([{journeyList:[{idJourney:6,number:6}]}]);}),{code:'ACB_JOURNEY'});
  assert.equal(calls,1);assert.equal(JSON.stringify(db.prepare('SELECT * FROM snapshots').all()),before);assert.equal(db.prepare('SELECT acb_journey_id FROM rounds').get().acb_journey_id,null);
 }finally{db.close();}
});

test('historical partial reader isolates one failed sold player and preserves successful positive, negative and zero results',async()=>{
 const fixture=n=>readFileSync(new URL('./fixtures/'+n+'.html',import.meta.url),'utf8');
 const pairs=[{acb:{ref:'good'},rincon:{ref:'tryggvi-hlinason',club:'BLB'}},{acb:{ref:'bad'},rincon:{ref:'missing-player',club:'FCB'}},{acb:{ref:'zero'},rincon:{ref:'emir-sulejmanovic',club:'ZAR'}}];
 const values=await readRinconHistory(['good','bad','zero'],pairs,1,async url=>new Response(url.includes('/jornada/')?fixture('j1'):url.endsWith('tryggvi-hlinason')?fixture('tryggvi-hlinason'):url.endsWith('emir-sulejmanovic')?fixture('emir-sulejmanovic'):'bad'),300,true);
 assert.equal(values[0].points,28.8);assert.equal(values[1].points,null);assert.equal(values[2].points,0);
 const context={...c,journey:1};
 const old=r('bad',-100,{...context,points:-4,brokerKind:'final',pointsFinal:true});
 const saved=values.map(v=>mergeScore(v.id==='bad'?old:undefined,v,context));
 const totals=noChangesTotals([{id:'good'},{id:'bad'},{id:'zero'}],saved,context);
 assert.equal(totals.points,24.8);assert.equal(totals.brokerDelta,97400);assert.equal(totals.pointStatus.state,'final');
});
