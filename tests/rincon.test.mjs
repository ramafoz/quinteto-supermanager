import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';
import {parseLive,parseBroker,readRinconScores} from '../server/rincon.ts';
import {refreshRinconScores} from '../server/rincon-scoring.ts';
const owner={userId:'owner'},friend={userId:'friend'};
const pair={acb:{ref:'170',name:'O. Balcerowski',shortName:'O. Balcerowski',club:'FCB',position:'P'},rincon:{ref:'olek-balcerowski',name:'Olek Balcerowski',shortName:'O. Balcerowski',club:'FCB',position:'P'},confirmedAt:1,confirmedBy:'owner'};
const makeLive=({points=36,valuation=30,delta=52500,status='Final',journey=1,name='Olek Balcerowski',club='FCB'}={})=>`<input data-imgs-temp="202627"><h1>Todos los jugadores · J${journey}</h1><button class="dj-chip is-on" data-dj-match="1"><span class="dj-chip__est">${status}</span></button><p data-dj-count>1 jugadores</p><table><tr data-dj-row data-dj-match="1"><td data-sort="${name}"><button data-player-name="${name}" data-player-jor="${journey}" data-player-team="${club}">${name}</button></td><td data-sort="${club}"><img src="/imgs/202627/${club}_b.gif"></td><td data-sort="P">P</td><td data-sort="${points??-999}"><strong>${points??'–'}</strong></td><td data-sort="${delta??0}">${delta??'–'}</td>${[10,10,10,10,10,valuation].map(n=>`<td data-sort="${n}">${n}</td>`).join('')}</tr></table>`;
const makeBroker=(journey=1)=>`<title>Tablas broker SuperManager ACB 2026/27</title><h1>Tablas broker · J${journey}</h1><table>${Array.from({length:100},(_,i)=>`<tr><td><span class="pos-badge">P</span><img alt="FCB"><a href="/smgr/jugador/${i?'test-'+i:pair.rincon.ref}"><span class="pname-full">${i?'Test '+i:pair.rincon.name}</span><span class="pname-abbr">${i?'T. '+i:pair.rincon.shortName}</span></a></td><td class="r num" data-sort="350000"><strong>350.000</strong></td></tr>`).join('')}</table>`;
const fixture=(live=makeLive(),broker=makeBroker())=>async(url,init)=>{assert.equal(init.headers.Authorization,undefined);assert.equal(init.redirect,'manual');return new Response(url.endsWith('directo.php')?live:broker);};
function setup(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));db.exec("INSERT INTO leagues VALUES('l','Liga','owner','hash');INSERT INTO members VALUES('owner','l','Owner'),('friend','l','Friend')");db.prepare('INSERT INTO rounds(id,league_id,label,lock_at,ends_at) VALUES(?,?,?,?,?)').run('r','l','J1',Date.now()-1000,Date.now()+3600000);const players=JSON.stringify([{id:'170',name:'O. Balcerowski',club:'FCB',position:'Pívot'}]);for(const user of ['owner','friend'])db.prepare('INSERT INTO snapshots(round_id,user_id,team_id,team_name,players_json,imported_at,raw_points,manual_penalty) VALUES(?,?,?,?,?,?,?,?)').run('r',user,'1','Test',players,1,203,-4);db.prepare('INSERT INTO league_catalogs VALUES(?,?,?,?,?,?,?)').run('l','2026/27',1,1,'{}',JSON.stringify([pair]),'[]');
 const prepare=sql=>{let args=[];return {bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};};const DB={prepare,async batch(statements){db.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};return {db,env:{DB}};}
const release=db=>db.exec('UPDATE rounds SET rincon_fetch_at=NULL');
test('reads SM rather than valuation and derives broker value from opening plus published variation',async()=>{const [score]=await readRinconScores(['170'],[pair],1,fixture(),123);assert.equal(score.points,36);assert.equal(score.valuation,30);assert.equal(score.broker,402500);assert.equal(score.brokerKind,'final');assert.equal(score.playing,false);assert.equal(score.observedAt,123);});
test('playing is distinct from final and not-started; zero and negative values remain valid',async()=>{for(const status of ['min 19','Final','18:00']){const [s]=await readRinconScores(['170'],[pair],1,fixture(makeLive({points:-4,valuation:-4,delta:-52500,status})));assert.equal(s.points,-4);assert.equal(s.broker,297500);assert.equal(s.playing,status==='min 19');}assert.equal(parseLive(makeLive({points:0,delta:0})).rows[0].points,0);const [p]=await readRinconScores(['170'],[pair],1,fixture(makeLive({points:null,delta:null})));assert.equal(p.points,null);assert.equal(p.brokerKind,'opening');assert.equal(p.broker,350000);});
test('rejects wrong season, journey, duplicates, malformed values and incomplete response',async()=>{assert.throws(()=>parseLive(makeLive().replaceAll('202627','202526')));assert.throws(()=>parseLive(makeLive().replace('1 jugadores','2 jugadores')));assert.throws(()=>parseLive(makeLive({points:'bad'})));assert.throws(()=>parseBroker(makeBroker().replace('2026/27','2025/26')));await assert.rejects(readRinconScores(['170'],[pair],2,fixture()));await assert.rejects(readRinconScores(['170'],[pair],1,fixture(makeLive(),makeBroker(2))));});
test('two source reads update all teams once, preserve manual adjustments, and reuse admin tab lease',async()=>{const {db,env}=setup();try{let calls=0;const fetcher=async(...a)=>{calls++;return fixture()(...a);};let r=await refreshRinconScores(env,owner,'r',1,fetcher);assert.equal(calls,2);assert.equal(r.updated,2);for(const s of db.prepare('SELECT * FROM snapshots').all()){assert.equal(s.raw_points,36);assert.equal(s.manual_penalty,-4);assert.equal(JSON.parse(s.scores_json)[0].broker,402500);}r=await refreshRinconScores(env,owner,'r',1,fetcher,true);assert.equal(r.skipped,true);assert.equal(calls,2);}finally{db.close();}});
test('source failures and absent score preserve existing values instead of replacing them with zero',async()=>{const {db,env}=setup();try{await refreshRinconScores(env,owner,'r',1,fixture());const before=JSON.stringify(db.prepare('SELECT * FROM snapshots').all());release(db);await assert.rejects(refreshRinconScores(env,owner,'r',1,async()=>new Response('error',{status:503})));assert.equal(JSON.stringify(db.prepare('SELECT * FROM snapshots').all()),before);release(db);await refreshRinconScores(env,owner,'r',1,fixture(makeLive({points:null,delta:null})));const s=db.prepare('SELECT * FROM snapshots').get(),score=JSON.parse(s.scores_json)[0];assert.equal(s.raw_points,36);assert.equal(score.points,36);assert.equal(score.stale,true);assert.equal(score.broker,402500);assert.equal(score.brokerStale,true);}finally{db.close();}});
test('owner, start time, mapping and round binding are enforced before fetching',async()=>{const {db,env}=setup();try{let calls=0;const noFetch=async()=>{calls++;throw Error('unexpected');};await assert.rejects(refreshRinconScores(env,friend,'r',1,noFetch));db.exec('UPDATE rounds SET lock_at=9999999999999');await assert.rejects(refreshRinconScores(env,owner,'r',1,noFetch));db.exec('UPDATE rounds SET lock_at=1,acb_journey_number=2');await assert.rejects(refreshRinconScores(env,owner,'r',1,noFetch));db.exec("UPDATE rounds SET acb_journey_number=NULL;UPDATE league_catalogs SET confirmed_json='[]'");await assert.rejects(refreshRinconScores(env,owner,'r',1,noFetch));assert.equal(calls,0);}finally{db.close();}});
test('automatic refresh stops after close, including a close during fetch; manual final update allowed',async()=>{const {db,env}=setup();try{let calls=0;const fetcher=async(...a)=>{calls++;db.exec('UPDATE rounds SET closed_at=1');return fixture()(...a);};await assert.rejects(refreshRinconScores(env,owner,'r',1,fetcher,true));assert.equal(db.prepare('SELECT raw_points FROM snapshots').get().raw_points,203);calls=0;await assert.rejects(refreshRinconScores(env,owner,'r',1,fetcher,true));assert.equal(calls,0);release(db);const historical=async url=>new Response(url.includes('/jornada/')?readFileSync(new URL('./fixtures/j1.html',import.meta.url),'utf8'):readFileSync(new URL('./fixtures/tryggvi-hlinason.html',import.meta.url),'utf8').replaceAll('tryggvi-hlinason','olek-balcerowski'));const r=await refreshRinconScores(env,owner,'r',1,historical);assert.equal(r.updated,2);}finally{db.close();}});
test('roster import or mapping edits during fetch cannot overwrite newer state',async()=>{const {db,env}=setup();try{let first=true;const changeRoster=async(...a)=>{if(first){first=false;db.exec("UPDATE snapshots SET imported_at=2 WHERE user_id='owner'");}return fixture()(...a);};const r=await refreshRinconScores(env,owner,'r',1,changeRoster);assert.equal(r.updated,1);assert.equal(db.prepare("SELECT raw_points FROM snapshots WHERE user_id='owner'").get().raw_points,203);release(db);first=true;const changeMapping=async(...a)=>{if(first){first=false;db.exec('UPDATE league_catalogs SET revision=2');}return fixture()(...a);};await assert.rejects(refreshRinconScores(env,owner,'r',1,changeMapping));}finally{db.close();}});

test('J3 refresh includes sold players once, reuses another current team, and keeps official totals separate',async()=>{
 const {db,env}=setup();try{
  const {noChangesTotals}=await import('../lib/no-changes.ts');
  const now=Date.now();
  db.prepare('INSERT INTO rounds(id,league_id,label,lock_at,ends_at,closed_at) VALUES(?,?,?,?,?,?)').run('previous','l','J2',now-3000,now-2000,now-1000);
  const oldPlayers=JSON.stringify([{id:'171',name:'Test 1',club:'FCB',position:'Pívot'},{id:'172',name:'Test 2',club:'FCB',position:'Pívot'}]);
  for(const user of ['owner','friend'])db.prepare('INSERT INTO snapshots(round_id,user_id,team_id,team_name,players_json,imported_at) VALUES(?,?,?,?,?,?)').run('previous',user,'1','Test',oldPlayers,1);
  db.prepare('UPDATE snapshots SET players_json=? WHERE round_id=? AND user_id=?').run(JSON.stringify([{id:'172',name:'Test 2',club:'FCB',position:'Pívot'}]),'r','friend');
  const pairs=[pair,...[1,2].map(i=>({...pair,acb:{...pair.acb,ref:String(170+i)},rincon:{...pair.rincon,ref:`test-${i}`,name:`Test ${i}`,shortName:`T. ${i}`}}))];
  db.prepare('UPDATE league_catalogs SET confirmed_json=?').run(JSON.stringify(pairs));
  const rows=[makeLive({journey:3}),makeLive({journey:3,name:'Test 1',points:-5,delta:-10}),makeLive({journey:3,name:'Test 2',points:20,delta:100})].map(s=>s.match(/<tr[\s\S]*<\/tr>/)[0]).join('');
  const live=makeLive({journey:3}).replace(/<tr[\s\S]*<\/tr>/,rows).replace('1 jugadores','3 jugadores');
  let calls=0;await refreshRinconScores(env,owner,'r',3,async(...args)=>{calls++;return fixture(live,makeBroker(3))(...args);});
  assert.equal(calls,2);
  for(const user of ['owner','friend']){
   const saved=db.prepare('SELECT * FROM snapshots WHERE round_id=? AND user_id=?').get('r',user),scores=JSON.parse(saved.scores_json);
   assert.equal(saved.raw_points,user==='owner'?36:20);
   assert.equal(scores.length,1);
   assert.deepEqual(noChangesTotals(JSON.parse(oldPlayers),scores),{points:15,brokerDelta:90});
  }
  // A sold player without a confirmed mapping must not block official refresh.
  release(db);db.prepare('UPDATE league_catalogs SET confirmed_json=?').run(JSON.stringify(pairs.filter(p=>p.acb.ref!=='171')));
  await refreshRinconScores(env,owner,'r',3,fixture(live,makeBroker(3)));
  const saved=db.prepare('SELECT * FROM snapshots WHERE round_id=? AND user_id=?').get('r','owner');
  assert.equal(saved.raw_points,36);
  assert.deepEqual(noChangesTotals(JSON.parse(oldPlayers),JSON.parse(saved.scores_json)),{points:null,brokerDelta:null});
 }finally{db.close();}
});

test('J2 unavailable sold-player final history cannot block current official results',async()=>{
 const {db,env}=setup();try{
  const now=Date.now();
  db.prepare('INSERT INTO rounds(id,league_id,label,lock_at,ends_at,closed_at) VALUES(?,?,?,?,?,?)').run('previous','l','J1',now-3000,now-2000,now-1000);
  db.prepare('INSERT INTO snapshots(round_id,user_id,team_id,team_name,players_json,imported_at) VALUES(?,?,?,?,?,?)').run('previous','owner','1','Test',JSON.stringify([{id:'171',name:'Sold',club:'FCB',position:'Pívot'}]),1);
  db.prepare('UPDATE league_catalogs SET confirmed_json=?').run(JSON.stringify([pair,{...pair,acb:{...pair.acb,ref:'171'},rincon:{...pair.rincon,ref:'missing-sold'}}]));
  db.exec('UPDATE rounds SET closed_at=1 WHERE id=\'r\'');
  const historical=async url=>new Response(url.includes('/jornada/')?readFileSync(new URL('./fixtures/j1.html',import.meta.url),'utf8').replace('Jornada 1 ·','Jornada 2 ·'):url.endsWith('missing-sold')?'unavailable':readFileSync(new URL('./fixtures/tryggvi-hlinason.html',import.meta.url),'utf8').replaceAll('tryggvi-hlinason','olek-balcerowski').replace('data-sort="1"','data-sort="2"'));
  const result=await refreshRinconScores(env,owner,'r',2,historical);
  assert.equal(result.updated,2);
  const saved=db.prepare('SELECT * FROM snapshots WHERE round_id=? AND user_id=?').get('r','owner');
  assert.equal(saved.raw_points,28.8);
  assert.deepEqual(JSON.parse(saved.scores_json)[0].noChangesScores,[]);
 }finally{db.close();}
});

test('real J2 source replaces prior postponed-player results with SuperManager zeros',async()=>{
 const {db,env}=setup();try{
  db.exec('UPDATE rounds SET closed_at=1 WHERE id=\'r\'');
  const postponedPair={...pair,acb:{...pair.acb,ref:'171'},rincon:{...pair.rincon,ref:'emir-sulejmanovic',club:'JOV'}};
  db.prepare('UPDATE league_catalogs SET confirmed_json=?').run(JSON.stringify([pair,postponedPair]));
  db.prepare('UPDATE snapshots SET players_json=?,scores_json=?,scores_at=? WHERE user_id=?').run(JSON.stringify([{id:'171',name:'Postponed',club:'JOV',position:'Pívot'}]),JSON.stringify([{id:'171',points:10,valuation:10,brokerDelta:100,broker:350100,brokerOpening:350000,brokerKind:'final',source:'rincon',journey:2}]),1,'friend');
  const fixture=name=>readFileSync(new URL('./fixtures/'+name+'.html',import.meta.url),'utf8');
  const r=await refreshRinconScores(env,owner,'r',2,async url=>new Response(url.includes('/jornada/')?fixture('j2-postponed'):url.endsWith('olek-balcerowski')?fixture('hlinason-j2').replaceAll('tryggvi-hlinason','olek-balcerowski'):fixture('emir-sulejmanovic').replace('data-sort="1"','data-sort="2"')));
  assert.equal(r.updated,2);assert.equal(r.pending,0);
  assert.equal(db.prepare('SELECT raw_points FROM snapshots WHERE user_id=?').get('owner').raw_points,23);
  const saved=db.prepare('SELECT * FROM snapshots WHERE user_id=?').get('friend');
  assert.equal(saved.raw_points,0);const score=JSON.parse(saved.scores_json)[0];
  assert.equal(score.points,0);assert.equal(!!score.stale,false);assert.equal(score.brokerDelta,0);
 }finally{db.close();}
});
