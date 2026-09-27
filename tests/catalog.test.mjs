import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {catalogAction} from '../server/catalog.ts';
import {approvedCatalogPairs as seed} from '../server/catalog-seed.ts';
import {parseRincon,readCatalogSources} from '../server/catalog-sources.ts';
import {encrypt} from '../server/crypto.ts';
const owner={userId:'owner'},friend={userId:'friend'},key='a1'.repeat(32);
const acb=[...seed.map(p=>p.acb),...Array.from({length:100},(_,i)=>({ref:String(1000+i),name:`Test ${i}`,shortName:`Test ${i}`,club:'BRE',position:'B'}))];
const rincon=[...seed.map(p=>p.rincon),...acb.slice(seed.length).map((p,i)=>({...p,ref:`test-${i}`}))];
const html=players=>`<title>Broker 2026/27</title>${players.map(p=>`<tr><td><span class="pos-badge">${p.position||'B'}</span><img alt="${p.club}"><a href="/smgr/jugador/${p.ref}"><span class="pname-full">${p.name}</span><span class="pname-abbr">${p.shortName}</span></a></td></tr>`).join('')}`;
test('unmatched league player can be manually linked to a full-source option without adding unrelated ACB rows',async()=>{
 const {db,env}=await setup();try{
 db.prepare('UPDATE snapshots SET players_json=?').run(JSON.stringify([{id:'57',name:'W. Tavares',club:'RMA',position:'Pívot'}]));
 const a={ref:'57',name:'W. Tavares',shortName:'W. Tavares',club:'RMA',position:'P'};
 const r={ref:'edy-tavares',name:'Edy Tavares',shortName:'E. Tavares',club:'RMA',position:'P'};
 let v=await catalogAction(env,owner,'catalog-refresh',{revision:0},fixture([...acb,a],[...rincon,r]));
 assert.equal(v.rows.length,1);assert.equal(v.rows[0].status,'pending');assert.ok(v.rincon.some(p=>p.ref===r.ref));
 v=await catalogAction(env,owner,'catalog-confirm',{revision:1,selections:[{acbId:'57',rinconRef:r.ref}]});
 assert.equal(v.rows.length,1);assert.equal(v.rows[0].confirmed.rincon.ref,r.ref);
 v=await catalogAction(env,owner,'catalog-read',{});assert.equal(v.rows[0].status,'confirmed');
 const saved=db.prepare('SELECT * FROM league_catalogs').get();assert.equal(JSON.parse(saved.confirmed_json).length,1);assert.equal(JSON.parse(saved.document_json).acb.length,1);
 }finally{db.close();}
});
test('league scope covers saved, initial and historical rosters; old broad catalogs are filtered and unrelated confirmations denied',async()=>{
 const {db,env}=await setup();try{
 await catalogAction(env,owner,'catalog-refresh',{revision:0},fixture());
 const player=p=>({id:p.ref,name:p.name,club:p.club,position:'Base'});
 db.prepare('UPDATE snapshots SET players_json=?,baseline_json=?,history_json=?').run(JSON.stringify([player(acb[0])]),JSON.stringify([player(acb[1])]),JSON.stringify([{incoming:[player(acb[2])],outgoing:[player(acb[3])]}]));
 let v=await catalogAction(env,owner,'catalog-read',{});assert.equal(v.rows.length,4);assert.equal(v.rincon.length,rincon.length);
 await assert.rejects(catalogAction(env,owner,'catalog-confirm',{revision:1,selections:[{acbId:'1000',rinconRef:'test-0'}]}),/xa non está/);
 v=await catalogAction(env,owner,'catalog-refresh',{revision:1},fixture());assert.equal(v.rows.length,4);
 const doc=JSON.parse(db.prepare('SELECT document_json FROM league_catalogs').get().document_json);assert.equal(doc.acb.length,4);assert.equal(doc.rincon.length,rincon.length);
 db.prepare('UPDATE snapshots SET players_json=?').run(JSON.stringify([player(acb[0]),player(acb[31])]));
 v=await catalogAction(env,owner,'catalog-read',{});assert.equal(v.rows.length,5);assert.equal(v.rows.find(r=>r.acb.ref==='1000').status,'missing');
 v=await catalogAction(env,owner,'catalog-refresh',{revision:2},fixture());assert.equal(v.rows.find(r=>r.acb.ref==='1000').status,'new');
 }finally{db.close();}
});
function fixture(a=acb,r=rincon){return async(url,init)=>{if(url.includes('rincondelmanager')){assert.equal(init.headers.Authorization,undefined);return new Response(html(r));}assert.equal(init.headers.Authorization,'Bearer test-jwt');assert.equal(init.redirect,'manual');return Response.json(a.map(p=>({idPlayer:Number(p.ref),shortName:p.name,nameTeam:p.club,position:{B:1,A:3,P:5}[p.position]})));};}
async function setup(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));db.exec("INSERT INTO leagues VALUES('league','Friends','owner','hash');INSERT INTO members VALUES('owner','league','Owner'),('friend','league','Friend')");const DB={prepare(sql){let args=[];return {bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};}};db.prepare('INSERT INTO acb_links(user_id,jwt,expires_at,teams_json) VALUES(?,?,?,?)').run('owner',await encrypt('test-jwt',key,'owner'),Date.now()+3600000,'[]');db.exec("INSERT INTO rounds(id,league_id,label,lock_at,ends_at) VALUES('r','league','J1',1,2)");db.prepare("INSERT INTO snapshots(round_id,user_id,team_id,team_name,players_json,imported_at) VALUES(?,?,?,?,?,?)").run("r","owner","1","Test",JSON.stringify(acb.map(p=>({id:p.ref,name:p.name,club:p.club,position:p.position}))),1);return {db,env:{DB,TOKEN_ENCRYPTION_KEY:key}};}
test('approved seed is admin-only, read-only and has 31 unique confirmed identities',async()=>{const {db,env}=await setup();try{const view=await catalogAction(env,owner,'catalog-read',{});assert.equal(view.rows.length,131);assert.equal(view.rows.filter(r=>r.status==='confirmed').length,31);assert.equal(view.seedOnly,true);assert.equal(db.prepare('SELECT count(*) n FROM league_catalogs').get().n,0);await assert.rejects(catalogAction(env,friend,'catalog-read',{}),/administrador/);}finally{db.close();}});
test('refresh preserves approved pairs; confirm is explicit, versioned and audited without player names',async()=>{const {db,env}=await setup();try{let v=await catalogAction(env,owner,'catalog-refresh',{revision:0},fixture());assert.equal(v.revision,1);assert.equal(v.rows.filter(r=>r.status==='new').length,100);assert.equal(v.rows.filter(r=>r.confirmed).length,31);v=await catalogAction(env,owner,'catalog-confirm',{revision:1,selections:[{acbId:'1000',rinconRef:'test-0'}]});assert.equal(v.rows.find(r=>r.acb.ref==='1000').status,'confirmed');await assert.rejects(catalogAction(env,owner,'catalog-confirm',{revision:1,selections:[{acbId:'1001',rinconRef:'test-1'}]}),/catálogo cambiou/);await assert.rejects(catalogAction(env,owner,'catalog-confirm',{revision:2,selections:[{acbId:'1001',rinconRef:'test-0'}]}),/xa está vinculado/);await assert.rejects(catalogAction(env,owner,'catalog-confirm',{revision:2,selections:[{acbId:'1001',rinconRef:'unknown'}]}),/xa non está/);const saved=db.prepare('SELECT * FROM league_catalogs').get();assert.equal(saved.revision,2);assert.equal(JSON.parse(saved.history_json).length,1);assert.ok(db.prepare('SELECT message FROM audit_events').all().every(r=>!r.message.includes('Test 0')));}finally{db.close();}});
test('missing and changed source records remain reviewable without deleting or remapping approved identities',async()=>{const {db,env}=await setup();try{await catalogAction(env,owner,'catalog-refresh',{revision:0},fixture());const changed=acb.map((p,i)=>i===1?{...p,club:'UNI'}:p);const v=await catalogAction(env,owner,'catalog-refresh',{revision:1},fixture(changed,rincon.slice(1)));const absent=v.rows.find(r=>r.acb.ref===seed[0].acb.ref);assert.equal(absent.status,'missing');assert.equal(absent.confirmed.rincon.ref,seed[0].rincon.ref);assert.equal(v.rows.find(r=>r.acb.ref===seed[1].acb.ref).status,'changed');assert.equal(v.rows.filter(r=>r.confirmed).length,31);}finally{db.close();}});
test('source or season errors preserve the previously stored catalog',async()=>{const {db,env}=await setup();try{await catalogAction(env,owner,'catalog-refresh',{revision:0},fixture());const before=JSON.stringify(db.prepare('SELECT * FROM league_catalogs').get());for(const fetcher of [async()=>new Response('error',{status:503}),async()=>new Response(html(rincon).replace('2026/27','2025/26')),async(url,init)=>url.includes('rincondelmanager')?fixture()(url,init):new Response('',{status:401}),fixture(acb.map(p=>({...p,ref:String(Number(p.ref)+5000)})))]){await assert.rejects(catalogAction(env,owner,'catalog-refresh',{revision:1},fetcher));assert.equal(JSON.stringify(db.prepare('SELECT * FROM league_catalogs').get()),before);}}finally{db.close();}});
test('source parsing rejects duplicate IDs and suspiciously incomplete catalogs',async()=>{assert.throws(()=>parseRincon(html(rincon.slice(0,31))));assert.throws(()=>parseRincon(html([...rincon,rincon[0]])));await assert.rejects(readCatalogSources('test-jwt',fixture([...acb,acb[0]])));});
test('repeated ACB pages are rejected and bearer is never sent to Rincon',async()=>{const large=[...acb,...Array.from({length:300-acb.length},(_,i)=>({ref:String(3000+i),name:`Extra ${i}`,club:'BRE',position:'B'}))];await assert.rejects(readCatalogSources('test-jwt',fixture(large)),/repetiu/);});
test('manual confirmation requires a fetched catalog and non-owner mutations are denied',async()=>{const {db,env}=await setup();try{await assert.rejects(catalogAction(env,owner,'catalog-confirm',{revision:0,selections:[{acbId:seed[0].acb.ref,rinconRef:seed[0].rincon.ref}]}),/primeiro/);await assert.rejects(catalogAction(env,friend,'catalog-refresh',{revision:0},fixture()),/administrador/);}finally{db.close();}});
