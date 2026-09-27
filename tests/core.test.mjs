import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {action,state,importLineup} from '../server/service.ts';
import {normalizePlayers,normalizeTeams,signIn,tokenExpiry} from '../server/acb.ts';
import {encrypt,decrypt} from '../server/crypto.ts';
import {compare,overlap} from '../lib/model.ts';
import {quota,galicianClub} from '../lib/quota.ts';
import {normalizeScore} from '../server/acb.ts';
const key='a1'.repeat(32);
const owner={userId:'owner',displayName:'Owner'};
const friend={userId:'friend',displayName:'Friend'};
const rawPlayers=Array.from({length:10},(_,i)=>({idPlayer:i+1,shortName:`Jugador ${i+1}`,nameTeam:i<4?(i%2?'Leyma Coruña':'Río Breogán'):'Otro club',statusTeamSquad:'normal'}));
const jwt=`e30.${Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.signature`;
const fixtureFetch=async(url,init)=>{
 if(url.endsWith('/signIn'))return Response.json({code:'temporary-code'});
 if(url.endsWith('/getTokens'))return Response.json({jwt,type:'Bearer',refresh:'discard-me'});
 if(init.headers.Authorization!==`Bearer ${jwt}`)return new Response(null,{status:401});
 return Response.json(url.endsWith('/all')?[{userTeamList:[{idUserTeam:12,nameTeam:'Mi equipo'}]}]:rawPlayers);
};
function database(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 function prepare(sql){let args=[];return {bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const x=db.prepare(sql).run(...args);return {meta:{changes:x.changes}};}};}
 const DB={prepare,async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
 return {env:{DB,TOKEN_ENCRYPTION_KEY:key},db};
}
async function setup(){const {env,db}=database();const invite=await action(env,owner,'create',{name:'Javier',leagueName:'Amigos'});await action(env,friend,'join',{name:'Pedro',code:invite.inviteCode});const round=await action(env,owner,'round',{label:'2026/27 · J1',lockAt:Date.now()+3600000,endsAt:Date.now()+7200000});await action(env,owner,'connect',{username:'fake@example.test',password:'test-only'},fixtureFetch);await action(env,owner,'select-team',{teamId:'12'},fixtureFetch);return {env,db,round,invite};}
test('multiple future rounds can be scheduled while current round stays selected and snapshots stay isolated',async()=>{
 const {env,db,round}=await setup();try{
 const now=Date.now();const second=await action(env,owner,'round',{label:'J2',lockAt:now+7*86400000,endsAt:now+8*86400000});
 await action(env,owner,'round',{label:'J3',lockAt:now+14*86400000,endsAt:now+15*86400000});
 assert.equal((await state(env,owner)).round.id,round.id);
 db.prepare('UPDATE rounds SET lock_at=?,ends_at=? WHERE id=?').run(now-1000,now+3600000,round.id);
 assert.equal((await state(env,owner)).round.id,round.id);
 await importLineup(env,owner,second.id,fixtureFetch);
 const future=await state(env,owner,second.id);assert.equal(future.round.id,second.id);assert.equal(future.hidden,true);assert.equal(future.lineups[0].penalty,0);
 assert.equal((await state(env,owner)).lineups.length,0);
 await action(env,owner,'close-round',{roundId:round.id});assert.equal((await state(env,owner)).round.id,second.id);
 }finally{db.close();}
});
test('overall standings sum completed valid rounds, deduct penalties once and reflect corrections without leaking future data',async()=>{
 const {env,db,round}=await setup();try{
 await importLineup(env,owner,round.id,fixtureFetch);const now=Date.now();
 db.prepare('UPDATE rounds SET lock_at=?,ends_at=? WHERE id=?').run(now-20000,now-10000,round.id);
 db.prepare('UPDATE snapshots SET raw_points=203,changes_count=2,declared_at=1,manual_penalty=50 WHERE round_id=?').run(round.id);
 const second=await action(env,owner,'round',{label:'J2',lockAt:now+100000,endsAt:now+200000});await importLineup(env,owner,second.id,fixtureFetch);
 db.prepare('UPDATE rounds SET lock_at=?,ends_at=? WHERE id=?').run(now-9000,now-1000,second.id);
 db.prepare('UPDATE snapshots SET raw_points=100.5,changes_count=1,declared_at=1,manual_penalty=25 WHERE round_id=?').run(second.id);
 const future=await action(env,owner,'round',{label:'J3',lockAt:now+300000,endsAt:now+400000});await importLineup(env,owner,future.id,fixtureFetch);
 db.prepare('UPDATE snapshots SET raw_points=999,changes_count=9 WHERE round_id=?').run(future.id);
 let view=await state(env,friend);assert.equal(view.hidden,true);assert.equal(view.lineups.length,0);let total=view.overall.find(r=>r.userId==='owner');assert.equal(total.rawPoints,303.5);assert.equal(total.penalty,75);assert.equal(total.netPoints,228.5);assert.equal(total.counted,2);assert.equal(view.overall.find(r=>r.userId==='friend').pending,2);assert(!JSON.stringify(view.overall).includes('players'));
 await action(env,owner,'score',{roundId:round.id,userId:'owner',points:210});assert.equal((await state(env,owner)).overall.find(r=>r.userId==='owner').netPoints,235.5);
 db.prepare('UPDATE snapshots SET raw_points=NULL WHERE round_id=?').run(second.id);total=(await state(env,owner)).overall.find(r=>r.userId==='owner');assert.equal(total.netPoints,160);assert.equal(total.pending,1);
 db.prepare("UPDATE snapshots SET raw_points=100,players_json='[]' WHERE round_id=?").run(second.id);assert.equal((await state(env,owner)).overall.find(r=>r.userId==='owner').netPoints,160);
 }finally{db.close();}
});
test('undeclared changes never charge; late declaration resets legacy charges and publishes only status before start',async()=>{
 const {env,db,round}=await setup();try{
 await importLineup(env,owner,round.id,fixtureFetch,true);const visible=await state(env,friend);assert.equal(visible.members.find(m=>m.id==='owner').declared,1);assert.equal(visible.lineups.length,0);assert(!JSON.stringify(visible).includes('Jugador 1'));
 db.prepare('UPDATE snapshots SET declared_at=NULL,changes_count=4').run();db.prepare('UPDATE rounds SET lock_at=?').run(Date.now()-1000);
 const changed=[{...rawPlayers[0],idPlayer:99},...rawPlayers.slice(1)];
 assert.equal((await importLineup(env,owner,round.id,async()=>Response.json(changed))).penalty,0);
 assert.equal((await importLineup(env,owner,round.id,fixtureFetch)).penalty,0);
 await importLineup(env,owner,round.id,fixtureFetch,true);
 assert.equal((await importLineup(env,owner,round.id,async()=>Response.json(changed))).penalty,0);
 await assert.rejects(importLineup(env,owner,round.id,fixtureFetch,true),{code:'ALREADY_DECLARED'});
 }finally{db.close();}
});
test('admin sets signed total adjustments; imports do not charge and other members cannot adjust',async()=>{
 const {env,db,round}=await setup();try{db.prepare('UPDATE rounds SET lock_at=?').run(Date.now()-1000);await importLineup(env,owner,round.id,fixtureFetch,true);
 const changed=[{...rawPlayers[0],idPlayer:99},{...rawPlayers[1],idPlayer:98},...rawPlayers.slice(2)];await importLineup(env,owner,round.id,async()=>Response.json(changed));
 await assert.rejects(action(env,friend,'penalty',{roundId:round.id,userId:'owner',penalty:0}),{code:'OWNER_ONLY'});
 await action(env,owner,'penalty',{roundId:round.id,userId:'owner',penalty:51});assert.equal((await state(env,owner)).lineups[0].penalty,51);
 await action(env,owner,'penalty',{roundId:round.id,userId:'owner',penalty:10});assert.equal((await state(env,owner)).lineups[0].penalty,10);
 await action(env,owner,'penalty',{roundId:round.id,userId:'owner',penalty:0});assert.equal((await state(env,owner)).lineups[0].penalty,0);
 await importLineup(env,owner,round.id,async()=>Response.json([rawPlayers[0],...changed.slice(1)]));assert.equal((await state(env,owner)).lineups[0].penalty,0);
 await action(env,owner,'close-round',{roundId:round.id});await action(env,owner,'score',{roundId:round.id,userId:'owner',points:203});assert.equal((await state(env,owner)).overall[0].netPoints,203);
 }finally{db.close();}
});
test('audit is admin-only, paginated and contains counts not player details, including after-round observation',async()=>{
 const {env,db,round}=await setup();try{db.prepare('UPDATE rounds SET lock_at=?').run(Date.now()-1000);await importLineup(env,owner,round.id,fixtureFetch,true);
 await action(env,owner,'ping',{});await action(env,owner,'close-round',{roundId:round.id});
 await action(env,owner,'refresh-team',{},async()=>Response.json([{...rawPlayers[0],idPlayer:99,shortName:'SECRET_PLAYER_NAME'},...rawPlayers.slice(1)]));
 const result=await action(env,owner,'audit',{});const encoded=JSON.stringify(result);assert(encoded.includes('Ping'));assert(encoded.includes('posible penalización'));assert(encoded.includes('Actualización automática'));assert(!encoded.includes('SECRET_PLAYER_NAME'));assert(!encoded.includes('Jugador'));assert(!encoded.includes(jwt));
 assert.equal((await state(env,owner)).lineups[0].penalty,0);assert.equal((await state(env,friend)).events,undefined);
 await assert.rejects(action(env,friend,'audit',{}),{code:'OWNER_ONLY'});
 const before=result.events[0].id;const older=await action(env,owner,'audit',{before});assert(older.events.every(e=>e.id<before));
 }finally{db.close();}
});
test('ACB scores match exact journey, persist per-player points including victory value, and fail without overwriting on errors',async()=>{
 const {env,db,round}=await setup();try{db.prepare('UPDATE rounds SET lock_at=?').run(Date.now()-1000);await importLineup(env,owner,round.id,fixtureFetch,true);
 const scoreFetch=async url=>Response.json(url.includes('/journey/')?[{journeyList:[{idJourney:123,number:2}]}]:{idPlayer:Number(url.split('/').at(-1)),playerStats:[{numberJourney:1,pointsJourney:999,bonusVictory:0},{numberJourney:2,pointsJourney:10,bonusVictory:12} ]});
 await assert.rejects(action(env,friend,'refresh-scores',{roundId:round.id,journeyId:'123'},scoreFetch),{code:'OWNER_ONLY'});
 const result=await action(env,owner,'refresh-scores',{roundId:round.id,journeyId:'123'},scoreFetch);assert.equal(result.updated,1);let row=(await state(env,owner)).lineups[0];assert.equal(row.rawPoints,120);assert.equal(row.scores.length,10);assert.equal(row.scores[0].valuation,10);assert.equal(row.scores[0].points,12);
 const before=db.prepare('SELECT raw_points,scores_json,scores_at FROM snapshots').get();await assert.rejects(action(env,owner,'refresh-scores',{roundId:round.id},async url=>url.includes('/journey/')?scoreFetch(url):new Response('unavailable',{status:500})));assert.deepEqual(db.prepare('SELECT raw_points,scores_json,scores_at FROM snapshots').get(),before);
 await action(env,owner,'refresh-scores',{roundId:round.id},async url=>url.includes('/journey/')?scoreFetch(url):Response.json({playerStats:[]}));row=(await state(env,owner)).lineups[0];assert.equal(row.rawPoints,120);assert(row.scores.every(s=>s.points===null));
 assert.throws(()=>normalizeScore({playerStats:[{numberJourney:2,pointsJourney:'bad'}]},'1',2));assert.equal(normalizeScore({playerStats:[{numberJourney:2,pointsJourney:-3,bonusVictory:0}]},'1',2).points,-3);
 }finally{db.close();}
});
test('automatic score polling stops before ACB calls after end or manual close; manual final refresh remains available',async()=>{
 const {env,db,round}=await setup();try{
 await importLineup(env,owner,round.id,fixtureFetch,true);
 db.prepare('UPDATE rounds SET lock_at=?,ends_at=? WHERE id=?').run(Date.now()-2000,Date.now()-1000,round.id);
 let calls=0;const fetcher=async url=>{calls++;return Response.json(url.includes('/journey/')?[{journeyList:[{idJourney:123,number:2}]}]:{playerStats:[{numberJourney:2,pointsJourney:10,bonusVictory:0}]});};
 await assert.rejects(action(env,owner,'refresh-scores',{roundId:round.id,journeyId:'123',automatic:true},fetcher));assert.equal(calls,0);
 db.prepare('UPDATE rounds SET ends_at=?,closed_at=? WHERE id=?').run(Date.now()+100000,Date.now(),round.id);
 await assert.rejects(action(env,owner,'refresh-scores',{roundId:round.id,journeyId:'123',automatic:true},fetcher));assert.equal(calls,0);
 await action(env,owner,'refresh-scores',{roundId:round.id,journeyId:'123'},fetcher);assert(calls>0);assert.equal((await state(env,owner,round.id)).lineups[0].rawPoints,100);
 await action(env,owner,'score',{roundId:round.id,userId:owner.userId,points:203});const row=(await state(env,owner,round.id)).lineups[0];assert.equal(row.rawPoints,203);assert.equal(row.scoresAt,null);assert.equal(row.scores.length,10);
 }finally{db.close();}
});

test('signed manual adjustment replaces prior total, survives refresh, affects overall, and requires started declared own-league snapshot',async()=>{
 const {env,db,round}=await setup();try{
 await importLineup(env,owner,round.id,fixtureFetch,true);
 await assert.rejects(action(env,owner,'penalty',{roundId:round.id,userId:'owner',penalty:-4}),{code:'PENALTY'});
 db.prepare('UPDATE rounds SET lock_at=?').run(Date.now()-1000);
 db.prepare('UPDATE snapshots SET raw_points=203,changes_count=9,penalty_reduction=20').run();
 assert.equal((await state(env,owner)).lineups[0].penalty,0);
 await action(env,owner,'penalty',{roundId:round.id,userId:'owner',penalty:-4});
 let row=(await state(env,owner)).lineups[0];assert.equal(row.netPoints,207);assert.equal(row.penalty,-4);
 await importLineup(env,owner,round.id,async()=>Response.json([{...rawPlayers[0],idPlayer:99},...rawPlayers.slice(1)]));assert.equal((await state(env,owner)).lineups[0].penalty,-4);
 await action(env,owner,'penalty',{roundId:round.id,userId:'owner',penalty:1.1});assert.equal((await state(env,owner)).lineups[0].netPoints,201.9);
 await action(env,owner,'penalty',{roundId:round.id,userId:'owner',penalty:-4});
 await action(env,owner,'close-round',{roundId:round.id});assert.equal((await state(env,owner)).overall[0].netPoints,207);
 for(const penalty of ['',null,true,1.111,10001,Infinity])await assert.rejects(action(env,owner,'penalty',{roundId:round.id,userId:'owner',penalty}));
 const other=await action(env,{userId:'other'},'create',{name:'Other',leagueName:'Other league'});assert(other);
 await assert.rejects(action(env,{userId:'other'},'penalty',{roundId:round.id,userId:'owner',penalty:7}),{code:'PENALTY'});
 db.prepare('UPDATE snapshots SET declared_at=NULL').run();await assert.rejects(action(env,owner,'penalty',{roundId:round.id,userId:'owner',penalty:5}),{code:'PENALTY'});
 }finally{db.close();}
});

test('ACB login uses form credentials and exchanges code as uuid; refresh is never returned',async()=>{
 const calls=[];const fetcher=async(u,i)=>{calls.push({u,i});return fixtureFetch(u,i);};assert.equal(await signIn('fake','password',fetcher),jwt);
 assert.equal(calls[0].i.headers['Content-Type'],'application/x-www-form-urlencoded');assert.equal(calls[0].i.body.get('username'),'fake');assert.deepEqual(JSON.parse(calls[1].i.body),{uuid:'temporary-code',deviceId:''});
});
test('strict normalization prevents incomplete, duplicate, malformed or sold-slot snapshots',()=>{
 assert.equal(normalizePlayers(rawPlayers).length,10);assert.throws(()=>normalizePlayers(rawPlayers.slice(0,9)));assert.throws(()=>normalizePlayers([...rawPlayers.slice(0,9),rawPlayers[0]]));assert.throws(()=>normalizePlayers([{...rawPlayers[0],statusTeamSquad:'empty'},...rawPlayers.slice(1)]));assert.throws(()=>normalizeTeams([{teams:[]}])) ;
 assert.equal(normalizeTeams([{userTeamList:[{idUserTeam:12,nameTeam:'Equipo'}]}])[0].id,'12');
});
test('AES-GCM uses distinct nonces, authenticates owner and rejects tampering',async()=>{
 const a=await encrypt(jwt,key,'one'),b=await encrypt(jwt,key,'one');assert.notEqual(a,b);assert(!a.includes(jwt));assert.equal(await decrypt(a,key,'one'),jwt);await assert.rejects(decrypt(a,key,'two'));await assert.rejects(decrypt(a.slice(0,-5)+'AAAAA',key,'one'));
});
test('full flow persists a roster and exposes neither tokens nor invitations in state',async()=>{
 const {env,db,round}=await setup();await importLineup(env,owner,round.id,fixtureFetch);const view=await state(env,owner);assert.equal(view.lineups[0].players.length,10);assert.equal(view.members.length,2);assert(!JSON.stringify(view).includes(jwt));assert(!JSON.stringify(view).includes('discard-me'));assert(!JSON.stringify(view).includes('invite_hash'));const stored=db.prepare('SELECT jwt FROM acb_links').get().jwt;assert(!stored.includes(jwt));db.close();
});
test('ownership and league boundaries reject another team and another league round',async()=>{
 const {env,db,round}=await setup();await assert.rejects(action(env,owner,'select-team',{teamId:'999'},fixtureFetch),e=>e.code==='TEAM_NOT_OWNED');await assert.rejects(action(env,friend,'round',{label:'x',lockAt:Date.now()+3600000,endsAt:Date.now()+7200000}),e=>e.status===403);
 const other={userId:'other',displayName:'Other'};await action(env,other,'create',{name:'Otro',leagueName:'Otra liga'});await assert.rejects(importLineup(env,other,round.id,fixtureFetch));assert.equal((await state(env,other,round.id)).lineups.length,0);db.close();
});
test('cutoff is rechecked after network; failure preserves last good snapshot',async()=>{
 const {env,db,round}=await setup();await importLineup(env,owner,round.id,fixtureFetch);const before=db.prepare('SELECT * FROM snapshots').get();
 const lateFetch=async(u,i)=>{db.prepare('UPDATE rounds SET closed_at=? WHERE id=?').run(Date.now()-1,round.id);return fixtureFetch(u,i);};await assert.rejects(importLineup(env,owner,round.id,lateFetch),e=>e.code==='IMPORT_CONFLICT');assert.deepEqual(db.prepare('SELECT * FROM snapshots').get(),before);await assert.rejects(importLineup(env,owner,round.id,fixtureFetch),e=>e.code==='ROUND_LOCKED');db.close();
});
test('disconnect during import cannot save an in-flight account snapshot',async()=>{
 const {env,db,round}=await setup();const disconnecting=async(u,i)=>{await action(env,owner,'disconnect',{});return fixtureFetch(u,i);};await assert.rejects(importLineup(env,owner,round.id,disconnecting),e=>e.code==='IMPORT_CONFLICT');assert.equal(db.prepare('SELECT count(*) AS n FROM snapshots').get().n,0);db.close();
});
test('malformed upstream roster preserves existing snapshot',async()=>{
 const {env,db,round}=await setup();await importLineup(env,owner,round.id,fixtureFetch);const before=db.prepare('SELECT players_json FROM snapshots').get();await assert.rejects(importLineup(env,owner,round.id,async()=>Response.json(rawPlayers.slice(0,9))));assert.deepEqual(db.prepare('SELECT players_json FROM snapshots').get(),before);db.close();
});
test('invitation rotation revokes old codes and login is rate limited',async()=>{
 const {env,db,invite}=await setup();await action(env,owner,'invite',{});await assert.rejects(action(env,{userId:'new',displayName:'New'},'join',{name:'new',code:invite.inviteCode}),e=>e.code==='INVALID_INVITE');
 for(let n=0;n<4;n++)await action(env,owner,'connect',{username:'fake',password:'x'},fixtureFetch);await assert.rejects(action(env,owner,'connect',{username:'fake',password:'x'},fixtureFetch),e=>e.code==='RATE_LIMIT');db.close();
});
test('comparison uses IDs and distinguishes shared from unique players',()=>{
 const p=id=>({id,name:'Same name',position:'Jugador'});const a={userId:'a',players:[p('1'),p('2')]},b={userId:'b',players:[p('2'),p('3')]};assert.equal(overlap(a,b),1);assert.equal(compare([a,b]).filter(p=>p.owners.length===1).length,2);assert.equal(compare([]).length,0);
});
test('token retention never exceeds 24 hours',()=>{assert(tokenExpiry(jwt)<=Date.now()+86400000);assert.equal(tokenExpiry('opaque',1000),3601000);});
test('before start neither opponent roster nor penalty history is returned, even to owner',async()=>{
 const {env,db,round}=await setup();await importLineup(env,owner,round.id,fixtureFetch);await action(env,friend,'connect',{username:'fake',password:'test'},fixtureFetch);await action(env,friend,'select-team',{teamId:'12'},fixtureFetch);await importLineup(env,friend,round.id,fixtureFetch);
 const a=await state(env,owner,round.id),b=await state(env,friend,round.id);assert.equal(a.hidden,true);assert.deepEqual(a.lineups.map(t=>t.userId),['owner']);assert.deepEqual(b.lineups.map(t=>t.userId),['friend']);
 db.prepare('UPDATE rounds SET lock_at=?').run(Date.now()-1000);const after=await state(env,owner,round.id);assert.equal(after.hidden,false);assert.equal(after.lineups.length,2);db.close();
});
test('after start replacements and reversals are counted without automatic charges',async()=>{
 const {env,db,round}=await setup();await importLineup(env,owner,round.id,fixtureFetch);db.prepare('UPDATE rounds SET lock_at=?').run(Date.now()-1000);await importLineup(env,owner,round.id,fixtureFetch,true);
 const changed=[{idPlayer:21,shortName:'Nuevo uno'},{idPlayer:22,shortName:'Nuevo dos'},...rawPlayers.slice(2)];
 const first=await importLineup(env,owner,round.id,async()=>Response.json(changed));assert.equal(first.penalty,0);assert.equal(first.changes,2);assert(first.baselineKnown);
 const repeated=await importLineup(env,owner,round.id,async()=>Response.json(changed));assert.equal(repeated.penalty,0);
 const undone=await importLineup(env,owner,round.id,async()=>Response.json([rawPlayers[0],...changed.slice(1)]));assert.equal(undone.penalty,0);assert.equal(undone.changes,3);
 const view=await state(env,owner);assert.equal(view.lineups[0].history.length,2);assert.equal(view.lineups[0].changes,3);db.close();
});
test('free pre-start substitutions update baseline; late first imports are flagged as unverified',async()=>{
 const {env,db,round}=await setup();await importLineup(env,owner,round.id,fixtureFetch);const changed=[{idPlayer:21,shortName:'Otro'},...rawPlayers.slice(1)];assert.equal((await importLineup(env,owner,round.id,async()=>Response.json(changed))).penalty,0);
 db.prepare('UPDATE rounds SET lock_at=?').run(Date.now()-1000);await action(env,friend,'connect',{username:'fake',password:'test'},fixtureFetch);await action(env,friend,'select-team',{teamId:'12'},fixtureFetch);const late=await importLineup(env,friend,round.id,fixtureFetch);assert.equal(late.baselineKnown,false);db.close();
});
test('simultaneous post-start imports count one replacement only once',async()=>{
 const {env,db,round}=await setup();db.prepare('UPDATE rounds SET lock_at=?').run(Date.now()-1000);await importLineup(env,owner,round.id,fixtureFetch,true);
 let release;const gate=new Promise(resolve=>{release=resolve;});let n=0;const fetcher=async()=>{n++;if(n===2)release();await gate;return Response.json([{idPlayer:99,shortName:'Nuevo'},...rawPlayers.slice(1)]);};
 const results=await Promise.allSettled([importLineup(env,owner,round.id,fetcher),importLineup(env,owner,round.id,fetcher)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await state(env,owner)).lineups[0].penalty,0);db.close();
});
test('a difference across the start boundary is pending, never automatically penalized',async()=>{
 const {env,db,round}=await setup();await importLineup(env,owner,round.id,fixtureFetch);
 const previous=db.prepare('SELECT imported_at FROM snapshots').get().imported_at;
 db.prepare('UPDATE rounds SET lock_at=?').run(previous+1);await new Promise(r=>setTimeout(r,5));
 const changed=[{idPlayer:21,shortName:'Cambio sin hora'},...rawPlayers.slice(1)];const imported=await importLineup(env,owner,round.id,async()=>Response.json(changed));assert.equal(imported.penalty,0);const view=await state(env,owner);assert.equal(view.lineups[0].history[0].pending,true);db.close();
});
test('honor declaration after start sets initial lineup; subsequent substitution is recorded without a charge and cannot reset',async()=>{
 const {env,db,round}=await setup();db.prepare('UPDATE rounds SET lock_at=?').run(Date.now()-1000);
 await importLineup(env,owner,round.id,fixtureFetch,true);assert.equal((await state(env,owner)).lineups[0].baselineKnown,true);
 const result=await importLineup(env,owner,round.id,async()=>Response.json([{idPlayer:99,shortName:'Nuevo'},...rawPlayers.slice(1)]));assert.equal(result.penalty,0);
 await assert.rejects(importLineup(env,owner,round.id,fixtureFetch,true),e=>e.code==='ALREADY_DECLARED');assert.equal((await state(env,owner)).lineups[0].penalty,0);db.close();
});
test('Pedro manual adjustment gives 203 - 50 = 153 and next round starts with zero penalties',async()=>{
 const {env,db,round}=await setup();db.prepare('UPDATE rounds SET lock_at=?').run(Date.now()-1000);await importLineup(env,owner,round.id,fixtureFetch,true);
 const changed=[{idPlayer:21,shortName:'Nuevo uno'},{idPlayer:22,shortName:'Nuevo dos'},...rawPlayers.slice(2)];await importLineup(env,owner,round.id,async()=>Response.json(changed));await action(env,owner,'close-round',{roundId:round.id});await action(env,owner,'score',{roundId:round.id,userId:owner.userId,points:203});await action(env,owner,'penalty',{roundId:round.id,userId:owner.userId,penalty:50});const scored=(await state(env,owner,round.id)).lineups[0];assert.equal(scored.rawPoints,203);assert.equal(scored.netPoints,153);
 const next=await action(env,owner,'round',{label:'J2',lockAt:Date.now()+3600000,endsAt:Date.now()+7200000});const second=await importLineup(env,owner,next.id,fixtureFetch);assert.equal(second.penalty,0);assert.equal((await state(env,owner,round.id)).lineups[0].netPoints,153);db.close();
});
test('after scheduled end imports cannot add between-round penalties',async()=>{
 const {env,db,round}=await setup();await importLineup(env,owner,round.id,fixtureFetch);db.prepare('UPDATE rounds SET ends_at=?').run(Date.now()-1);await assert.rejects(importLineup(env,owner,round.id,fixtureFetch),e=>e.code==='ROUND_LOCKED');assert.equal((await state(env,owner)).lineups[0].penalty,0);db.close();
});
test('Galician quota permits mixed clubs, normalizes accents and counts distinct players',()=>{
 assert.equal(quota([{id:'1',club:'Río Breogán'},{id:'2',club:'Leyma Coruña'}]).status,'valid');assert.equal(quota([{id:'1',club:'Obradoiro'},{id:'1',club:'Obradoiro'}]).status,'invalid');assert.equal(quota([{id:'1',club:'Otro club'},{id:'2'}]).status,'unknown');assert.equal(galicianClub('RIO BREOGAN'),'Río Breogán');
});
test('initial registration without the minimum quota fails without storing a valid lineup',async()=>{
 const {env,db,round}=await setup();await assert.rejects(importLineup(env,owner,round.id,async()=>Response.json(rawPlayers.map(p=>({...p,nameTeam:'Otro club'})))),e=>e.code==='GALICIAN_QUOTA');assert.equal(db.prepare('SELECT count(*) AS n FROM snapshots').get().n,0);db.close();
});
test('later quota breach is recorded to preserve changes but is not classified as valid',async()=>{
 const {env,db,round}=await setup();db.prepare('UPDATE rounds SET lock_at=?').run(Date.now()-1000);await importLineup(env,owner,round.id,fixtureFetch,true);await importLineup(env,owner,round.id,async()=>Response.json(rawPlayers.map((p,i)=>i<4?{...p,idPlayer:100+i,nameTeam:'Otro club'}:p)));await action(env,owner,'close-round',{roundId:round.id});await action(env,owner,'score',{roundId:round.id,userId:owner.userId,points:203});const lineup=(await state(env,owner)).lineups[0];assert.equal(lineup.quota.status,'invalid');assert.equal(lineup.netPoints,null);assert.equal(lineup.penalty,0);db.close();
});
