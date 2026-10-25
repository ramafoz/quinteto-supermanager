import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {mergeScore,brokerTotal,bestPoints} from '../lib/score-data.ts';
import {noChangesTotals} from '../lib/no-changes.ts';
import {readRinconScores,CALENDAR_URL,LIVE_URL,parseLive} from '../server/rincon.ts';
import {parseCalendarStates} from '../server/rincon-match-state.ts';
import {readRinconHistory} from '../server/rincon-history.ts';
import {participationLabel} from '../lib/participation.ts';
import {saveSnapshotResults} from '../server/score-storage.ts';
import {state} from '../server/service.ts';
import {refreshScores} from '../server/scoring.ts';
import {encrypt} from '../server/crypto.ts';
const context={journey:5,season:'2026/27'};
const score=(source,points,extra={})=>({id:'target',source,points,valuation:points,observedAt:100,...context,...extra});
const fixture=n=>readFileSync(new URL('./fixtures/'+n+'.html',import.meta.url),'utf8');

for(const source of ['acb','rincon'])test(`${source} 17 points survive a missing result from the other source`,()=>{
 const old=score(source,17,{brokerDelta:50,brokerKind:'provisional'});
 const other=source==='acb'?'rincon':'acb';
 const merged=mergeScore(old,score(other,null,{observedAt:200,readStatus:'failed'}),context);
 assert.equal(merged.points,17);assert.equal(merged.source,source);assert.equal(!!merged.stale,false);
 assert.equal(merged.sourceResults[source].points,17);assert.equal(merged.sourceResults[other].points,null);
 assert.equal(noChangesTotals([{id:'target'}],[merged],context).points,17);
});
test('a valid zero is preferred to absence; stale data cannot hide a valid alternative; final cannot regress',()=>{
 assert.equal(mergeScore(score('acb',0),score('rincon',null,{observedAt:200}),context).points,0);
 const mixed=mergeScore(score('rincon',17),score('acb',12),context);
 const failed=mergeScore(mixed,score('acb',null,{observedAt:300}),context);
 assert.equal(failed.points,17);assert.equal(failed.source,'rincon');assert.equal(failed.sourceResults.acb.stale,true);
 const final=mergeScore(score('rincon',21,{pointsFinal:true}),score('acb',17,{observedAt:400}),context);
 assert.equal(final.points,21);assert.equal(final.pointsFinal,true);
});
test('fresh observations need explicit round provenance and out-of-order observations cannot replace newer points',()=>{
 const valid=score('acb',17);
 assert.equal(mergeScore(valid,{id:'target',source:'rincon',points:0,valuation:0,observedAt:200},context).points,17);
 const older=mergeScore(valid,score('rincon',5,{observedAt:50}),context);
 assert.equal(older.points,17);assert.equal(older.sourceResults.rincon.points,5);
});
for(const wrong of [{journey:4},{season:'2025/26'}])test(`fallback rejects a different ${Object.keys(wrong)[0]}`,()=>{
 const merged=mergeScore(score('acb',17,wrong),score('rincon',null,{observedAt:200}),context);
 assert.equal(merged.points,null);assert.equal(bestPoints(merged,context),undefined);
});
test('unchanged points combine retained ACB and sold Rincón values while broker counts remain independent',()=>{
 const kept=score('acb',17),sold=score('rincon',-3,{id:'sold',brokerDelta:-70,brokerKind:'final',pointsFinal:true});
 kept.noChangesScores=[sold];
 const totals=noChangesTotals([{id:'target'},{id:'sold'}],[kept],context);
 assert.equal(totals.points,14);assert.equal(totals.pointStatus.count,2);assert.equal(totals.brokerDelta,-70);assert.equal(totals.brokerStatus.count,1);
 assert.equal(noChangesTotals([{id:'target'},{id:'sold'}],[kept],{...context,journey:4}).points,null);
});

function row(name,{points=17,delta=50,minutes=240,club='FCB',journey=5,stats=points===null?0:17}={}){
 const cell=(value,visible=value)=>`<td data-sort="${value}">${visible}</td>`;
 return `<tr data-dj-row data-dj-match="1"><td><button data-player-name="${name}" data-player-jor="${journey}" data-player-team="${club}">${name}</button></td><td><img src="/imgs/202627/${club}_b.gif"></td><td>P</td>${cell(points??-999,points??'–')}${cell(delta??0,delta??'–')}${cell(minutes,minutes===0?'0:00':'4:00')}${cell(0)}${cell(0)}${cell(0)}${cell(0,'0/0')}${cell(stats)}</tr>`;
}
function live(status='min 12',options={},peers=2){
 const rows=[row('Target',{points:null,delta:null,minutes:0,...options}),...Array.from({length:peers},(_,i)=>row('Peer '+i,{club:options.club,journey:options.journey}))];
 return `<input data-imgs-temp="202627"><h1>Todos los jugadores · J${options.journey??5}</h1><button class="dj-chip" data-dj-match="1"><span class="dj-chip__est">${status}</span></button><p data-dj-count>${rows.length} jugadores</p><table>${rows.join('')}</table>`;
}
function broker({name='Target',club='FCB',journey=5}={}){
 return `<title>Tablas broker SuperManager ACB 2026/27</title><h1>Tablas broker · J${journey}</h1><table>${Array.from({length:100},(_,i)=>`<tr><td><span class="pos-badge">P</span><img alt="${club}"><a href="/smgr/jugador/${i?'filler-'+i:'target-player'}"><span class="pname-full">${i?'Filler '+i:name}</span><span class="pname-abbr">${i?'F. '+i:name}</span></a></td><td class="r num" data-sort="100000"><strong>100.000</strong></td></tr>`).join('')}</table>`;
}
async function read(html,options={}){
 const calls=[];
 const pairs=[{acb:{ref:'target'},rincon:{ref:'target-player',name:options.name??'Target',club:options.club??'FCB'}}];
 const values=await readRinconScores(['target'],pairs,options.journey??5,async url=>{
  calls.push(url);if(url===CALENDAR_URL){if(options.calendar)return new Response(options.calendar);throw new Error('Simulated calendar unavailable');}
  return new Response(url===LIVE_URL?html:broker(options));
 },options.at??100);
 return {value:values[0],calls};
}
test('verified live zero-minute row with two participating teammates produces a provisional zero without extra queries',async()=>{
 const {value,calls}=await read(live());
 assert.equal(value.points,0);assert.equal(value.brokerDelta,0);assert.equal(value.pointsFinal,false);assert.equal(value.brokerKind,'provisional');assert.equal(value.participation,'not-yet-played');assert.equal(value.readStatus,'ok');assert.equal(value.zeroEvidence,'live-row-and-teammates');assert.equal(calls.length,2);
 assert.equal(brokerTotal([{id:'target'}],[value],context).count,1);assert.equal(noChangesTotals([{id:'target'}],[value],context).pointStatus.count,1);
 assert.match(participationLabel(value,context),/0 provisional/);
});
test('the same zero becomes final only when the verified match ends',async()=>{
 const {value:initial}=await read(live());const {value:final}=await read(live('Final'),{at:200});
 const merged=mergeScore(initial,final,context);
 assert.equal(merged.points,0);assert.equal(merged.brokerDelta,0);assert.equal(merged.didNotPlay,true);assert.equal(merged.pointsFinal,true);
 assert.equal(brokerTotal([{id:'target'}],[merged],context).state,'final');
 assert.equal(noChangesTotals([{id:'target'}],[merged],context).pointStatus.state,'final');assert.match(participationLabel(merged,context),/Non participou · 0 definitivo/);
});
test('final non-participation evidence survives a later failed query; provisional evidence is not shown as current',async()=>{
 const {value:final}=await read(live('Final'));
 const failed=mergeScore(final,score('rincon',null,{observedAt:200,readStatus:'failed',participation:'unknown'}),context);
 assert.equal(failed.points,0);assert.equal(failed.pointsFinal,true);assert.equal(failed.participation,'did-not-play');assert.equal(failed.zeroEvidence,'live-row-and-teammates');assert.equal(failed.brokerDelta,0);
 const {value:provisional}=await read(live());
 const missing=mergeScore(provisional,score('rincon',null,{observedAt:200,readStatus:'missing'}),context);
 assert.equal(missing.stale,true);assert.equal(participationLabel(missing,context),'');assert.equal(noChangesTotals([{id:'target'}],[missing],context).pointStatus.count,0);
});
test('real J5 source row for Howard Sant-Roos is verified as non-participation',async()=>{
 const {value}=await read(fixture('live-j5-nonparticipant'),{name:'Howard Sant-Roos',club:'MUR'});
 assert.equal(value.points,0);assert.equal(value.brokerDelta,0);assert.equal(value.participation,'did-not-play');assert.equal(value.pointsFinal,true);
});
test('actual participation replaces a previously inferred provisional zero',async()=>{
 const {value:initial}=await read(live());const {value:played}=await read(live('min 24',{points:-2,delta:-300,minutes:600,stats:-2}),{at:200});
 const merged=mergeScore(initial,played,context);
 assert.equal(merged.points,-2);assert.equal(merged.brokerDelta,-300);assert.equal(merged.participation,'played');assert.equal(merged.zeroEvidence,undefined);assert.equal(merged.stale,false);
});
test('a player previously observed participating cannot be replaced by an inferred non-participation zero',async()=>{
 const {value}=await read(live('Final'));
 const merged=mergeScore(score('acb',17),value,context);
 assert.equal(merged.points,17);assert.equal(merged.sourceResults.rincon.readStatus,'conflict');assert.equal(merged.sourceResults.rincon.points,null);assert.equal(merged.brokerDelta,null);
});
for(const [status,label] of [['18:00','scheduled'],['Aplazado','postponed']])test(`${label} match has pending points and broker, never inferred zeros`,async()=>{
 const {value}=await read(live(status,{},0));assert.equal(value.matchState,label);assert.equal(value.points,null);assert.equal(value.brokerDelta,null);assert.equal(value.pointsFinal,false);assert.equal(value.zeroEvidence,undefined);
 assert.match(participationLabel(value,context),label==='scheduled'?/non comezado/:/Aprazado/);
});
test('no teammate data and no verified match state cannot imply postponement or zero',async()=>{
 const {value}=await read(live('Pendente',{},0));
 assert.equal(value.matchState,'unknown');assert.equal(value.points,null);assert.equal(value.brokerDelta,null);assert.match(participationLabel(value,context),/sen confirmar/);
});
test('pregame zero placeholders and conflicting scheduled/live statistics never become current zeros',async()=>{
 const {value}=await read(live('18:00',{points:0,delta:0,minutes:0,stats:0},0));
 assert.equal(value.matchState,'scheduled');assert.equal(value.points,null);assert.equal(value.brokerDelta,null);
 const {value:conflict}=await read(live('18:00'));
 assert.equal(conflict.matchState,'unknown');assert.equal(conflict.readStatus,'conflict');assert.equal(conflict.points,null);
 const {value:unknown}=await read(live('Pendente',{points:0,delta:0,minutes:0,stats:0},0));
 assert.equal(unknown.points,null);assert.equal(unknown.brokerDelta,null);
});
test('one participating teammate, a missing player row or positive minutes with missing points are insufficient for zero',async()=>{
 assert.equal((await read(live('min 12',{},1))).value.points,null);
 assert.equal((await read(live('min 12',{minutes:1}))).value.points,null);
 const without=live().replace(row('Target',{points:null,delta:null,minutes:0}),'').replace('3 jugadores','2 jugadores');
 const {value}=await read(without);assert.equal(value.points,null);assert.equal(value.brokerDelta,null);assert.equal(value.readStatus,'missing');
});
test('malformed individual statistics and incomplete live responses fail verification, never becoming zeros',async()=>{
 await assert.rejects(read(live().replace('data-sort="0">0:00','data-sort="bad">0:00')));
 await assert.rejects(read(live().replace('3 jugadores','4 jugadores')));
});
test('observed calendar identifies future schedules; overdue schedules stay unknown and results stay final',()=>{
 const early=parseCalendarStates(fixture('calendar-j5'),5,Date.parse('2026-10-25T08:30:00Z'));
 assert.equal(early.get('BLB'),'scheduled');assert.equal(early.get('FCB'),'final');
 const late=parseCalendarStates(fixture('calendar-j5'),5,Date.parse('2026-10-25T12:30:00Z'));
 assert.equal(late.get('BLB'),'unknown');assert.equal(late.get('VBC'),'scheduled');
 assert.throws(()=>parseCalendarStates(fixture('calendar-j5').replace('2026/27','2025/26'),5,100));
 assert.throws(()=>parseCalendarStates(fixture('calendar-j5'),4,100));
});
test('one shared optional calendar request handles clubs absent from live, without requesting extra players',async()=>{
 const empty='<input data-imgs-temp="202627"><h1>Todos los jugadores · J5</h1><p data-dj-count>0 jugadores</p>';
 const {value,calls}=await read(empty,{club:'BLB',calendar:fixture('calendar-j5'),at:Date.parse('2026-10-25T08:30:00Z')});
 assert.equal(value.matchState,'scheduled');assert.equal(value.points,null);assert.equal(calls.length,3);assert.equal(calls.filter(x=>x===CALENDAR_URL).length,1);assert.equal(calls.some(x=>x.includes('/jugador/')),false);
 const {value:unknown}=await read(empty,{club:'BLB'});assert.equal(unknown.matchState,'unknown');assert.equal(unknown.points,null);
});
test('calendar postponement requires explicit text, and carries no invented SuperManager exclusion',()=>{
 const html=fixture('calendar-j5').replace('<span class="cal-when"><span class="cal-when__d">25/10</span><span class="cal-when__t">12:00</span></span>','<span>Aplazado</span>');
 assert.equal(parseCalendarStates(html,5,100).get('BLB'),'postponed');
});
test('JOV–AND J2 remains zero even if later source statistics exist or another source is refreshed',async()=>{
 const {value}=await read(live('Final',{journey:2,club:'JOV',points:33,delta:800,minutes:900}),{journey:2,club:'JOV'});
 assert.equal(value.points,0);assert.equal(value.brokerDelta,0);assert.equal(value.participation,'excluded');
 const c={...context,journey:2};const merged=mergeScore(value,score('acb',33,{journey:2,observedAt:300}),c);
 assert.equal(merged.points,0);assert.equal(merged.sourceResults.acb.points,33);assert.equal(brokerTotal([{id:'target'}],[merged],c).value,0);
});
test('technical historical failure is explicitly failed, not non-participation; valid alternative points survive',async()=>{
 const [failed]=await readRinconHistory(['target'],[{acb:{ref:'target'},rincon:{ref:'missing-profile',club:'FCB'}}],1,async url=>url.includes('/jornada/')?new Response(fixture('j1')):new Response('server failure',{status:503}),200,true);
 assert.equal(failed.points,null);assert.equal(failed.brokerDelta,null);assert.equal(failed.readStatus,'failed');assert.equal(failed.zeroEvidence,undefined);assert.equal(failed.didNotPlay,false);
 const c={...context,journey:1},merged=mergeScore(score('acb',17,{journey:1}),failed,c);
 assert.equal(merged.points,17);assert.match(participationLabel(merged,c),/Consulta fallida/);
});
test('sold nonparticipants and retained ACB scores have independent point/broker completeness',async()=>{
 for(const status of ['min 12','Final']){
  const {value}=await read(live(status));value.id='sold';
  const kept=score('acb',17);kept.noChangesScores=[value];
  const totals=noChangesTotals([{id:'target'},{id:'sold'}],[kept],context);
  assert.equal(totals.points,17);assert.equal(totals.pointStatus.count,2);assert.equal(totals.brokerDelta,0);assert.equal(totals.brokerStatus.count,1);assert.equal(totals.brokerStatus.finalCount,status==='Final'?1:0);
 }
});

function memory(){
 const db=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(fixtureSQL(file));
 db.exec("INSERT INTO leagues VALUES('l','Fixture','owner','hash');INSERT INTO members VALUES('owner','l','Owner');INSERT INTO rounds(id,league_id,label,lock_at,ends_at,closed_at,rincon_journey_number,rincon_season) VALUES('prev','l','J4',1,1,1,4,'2026/27'),('r','l','J5',2,9999999999999,NULL,5,'2026/27')");
 const players=Array.from({length:10},(_,i)=>({id:i?'kept'+i:'target',name:'Fixture '+i,position:'Base',club:i<2?'Río Breogán':'FCB'}));
 const previous=[{...players[0],id:'sold'},...players.slice(1)];
 for(const [round,roster] of [['prev',previous],['r',players]])db.prepare('INSERT INTO snapshots(round_id,user_id,team_id,team_name,players_json,imported_at,declared_at,manual_penalty) VALUES(?,?,?,?,?,?,?,?)').run(round,'owner','team','Fixture',JSON.stringify(roster),1,1,4);
 const prepare=sql=>{let args=[];return {bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};};
 return {db,players,env:{DB:{prepare},TOKEN_ENCRYPTION_KEY:'a1'.repeat(32)},snapshot:{user_id:'owner',players_json:JSON.stringify(players),imported_at:1}};
}
const fixtureSQL=file=>readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8');
for(const source of ['acb','rincon'])test(`database projection preserves ${source} raw_points and classification when the other source is incomplete`,async()=>{
 const {db,env,players,snapshot}=memory();try{
  const initial=players.map(p=>score(source,17,{id:p.id}));db.prepare('UPDATE snapshots SET scores_json=?,raw_points=170,scores_at=100 WHERE round_id=?').run(JSON.stringify(initial),'r');
  await saveSnapshotResults(env,'r',snapshot,players.map(p=>score(source==='acb'?'rincon':'acb',null,{id:p.id,observedAt:200})),context,200,'EXISTS(SELECT 1 FROM rounds WHERE id=?)',['r']);
  const row=db.prepare('SELECT * FROM snapshots WHERE round_id=?').get('r');assert.equal(row.raw_points,170);assert.equal(JSON.parse(row.scores_json).every(s=>s.points===17&&!s.stale),true);
  db.exec("UPDATE rounds SET closed_at=1 WHERE id='r'");const result=await state(env,{userId:'owner',displayName:'Owner'},'r');
  assert.equal(result.overall[0].rawPoints,170);assert.equal(result.overall[0].netPoints,166);assert.equal(result.lineups[0].rawPoints,170);
 }finally{db.close();}
});
test('database totals include a provisional current zero and sold zero without adding sold results to official points',async()=>{
 const {db,env,players,snapshot}=memory();try{
  db.prepare('UPDATE snapshots SET scores_json=?,scores_at=100 WHERE round_id=?').run(JSON.stringify(players.slice(1).map(p=>score('acb',17,{id:p.id}))),'r');
  const {value:zero}=await read(live());
  await saveSnapshotResults(env,'r',snapshot,[zero,{...zero,id:'sold'}],context,200,'EXISTS(SELECT 1 FROM rounds WHERE id=?)',['r']);
  const row=db.prepare('SELECT * FROM snapshots WHERE round_id=?').get('r');assert.equal(row.raw_points,153);assert.equal(row.manual_penalty,4);
  const result=await state(env,{userId:'owner',displayName:'Owner'},'r');const team=result.lineups[0];
  assert.equal(team.noChanges.points,153);assert.equal(team.noChanges.pointStatus.count,10);assert.equal(team.noChanges.brokerStatus.count,1);assert.equal(team.noChanges.brokerStatus.finalCount,0);
  assert.equal(brokerTotal(team.players,team.scores,context).count,1);assert.equal(team.newPlayerIds.includes('target'),true);
 }finally{db.close();}
});
test('actual ACB updates preserve the J2 exclusion and retain the reported upstream values for audit',async()=>{
 const {db,env,players}=memory();try{
  players.forEach((p,i)=>{p.id=String(i+1);});players[0].club='Asisa Joventut';db.prepare('UPDATE snapshots SET players_json=? WHERE round_id=?').run(JSON.stringify(players),'r');db.exec("UPDATE rounds SET rincon_journey_number=2,label='J2' WHERE id='r'");
  const token=await encrypt('fixture-token',env.TOKEN_ENCRYPTION_KEY,'owner');db.prepare('INSERT INTO acb_links VALUES(?,?,?,?,?,?)').run('owner',token,Date.now()+999999,'team','Fixture','[]');
  await refreshScores(env,{userId:'owner'},'r','2',async url=>Response.json(url.includes('/journey/')?[{journeyList:[{idJourney:2,number:2}]}]:{idPlayer:url.split('/').at(-1),playerStats:[{numberJourney:2,pointsJourney:17}]}));
  const saved=db.prepare('SELECT * FROM snapshots WHERE round_id=?').get('r'),scores=JSON.parse(saved.scores_json);
  assert.equal(saved.raw_points,153);assert.equal(scores[0].points,0);assert.equal(scores[0].sourceResults.acb.reportedPoints,17);assert.equal(scores[0].brokerDelta,0);
 }finally{db.close();}
});
