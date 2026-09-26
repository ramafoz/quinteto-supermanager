import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';
test('additive upgrade preserves four existing members, accounts, sessions, teams, declarations and scores',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec('PRAGMA foreign_keys=ON');const files=readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort();for(const f of files.filter(f=>f<'0005'))db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 db.exec("INSERT INTO leagues VALUES('league','Friends','u0','hash');INSERT INTO rounds(id,league_id,label,lock_at,ends_at) VALUES('r','league','J1',1,9999999999999)");
 for(let i=0;i<4;i++){db.prepare('INSERT INTO members VALUES(?,?,?)').run('u'+i,'league','User '+i);db.prepare('INSERT INTO acb_identities VALUES(?,?)').run('acb'+i,'u'+i);db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('sessionhash'+i,'u'+i,9999999999999);db.prepare('INSERT INTO acb_links(user_id,jwt,expires_at,team_id,teams_json) VALUES(?,?,?,?,?)').run('u'+i,'encrypted'+i,9999999999999,''+i,'[]');db.prepare('INSERT INTO snapshots(round_id,user_id,team_id,team_name,players_json,imported_at,declared_at,raw_points,changes_count) VALUES(?,?,?,?,?,?,?,?,?)').run('r','u'+i,''+i,'Team','[]',10,i?11:null,203,2);}
 const tables=['members','acb_identities','sessions','acb_links','snapshots','rounds'];const before=Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t).all()]));
 for(const f of files.filter(f=>f>='0005'))db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 for(const t of tables){const after=db.prepare('SELECT * FROM '+t).all();assert.equal(after.length,before[t].length);for(let i=0;i<after.length;i++)for(const key of Object.keys(before[t][i]))assert.equal(after[i][key],before[t][i][key]);}
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{db.close();}
});
