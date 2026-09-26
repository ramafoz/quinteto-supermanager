import {authenticate,teams,tokenExpiry,type Fetcher} from './acb.ts';
import {encrypt,hash} from './crypto.ts';
import {AppError,ensure} from './errors.ts';
import {rateLimit,type Runtime,type Identity} from './service.ts';
import {randomToken,SESSION_MS} from './sessions.ts';
import {auditStatement} from './audit.ts';
const sql=(env:Runtime,q:string,...args:unknown[])=>env.DB.prepare(q).bind(...args);
export async function acbLogin(env:Runtime,body:Record<string,unknown>,current:Identity|null,fetcher:Fetcher=fetch){
 ensure(typeof body.username==='string'&&body.username.trim().length>0&&body.username.length<=200,'Introduce o correo da túa conta ACB.');
 ensure(typeof body.password==='string'&&body.password.length>0&&body.password.length<=512,'Introduce o teu contrasinal ACB.');
 const username=body.username.trim();await rateLimit(env,await hash(username.toLowerCase()),'acb-login',5);
 await encrypt('configuration-check',env.TOKEN_ENCRYPTION_KEY,'check');
 let account;try{account=await authenticate(username,body.password,fetcher);}finally{delete body.password;}
 const list=await teams(account.jwt,fetcher);
 const existing=await sql(env,'SELECT user_id FROM acb_identities WHERE acb_id=?',account.acbId).first<{user_id:string}>();
 let userId=existing?.user_id;let leagueId:string|undefined;let migration=false;
 if(body.migrate===true){
  if(!current)throw new AppError(401,'SIGN_IN','Entra coa túa conta actual antes de activar o acceso ACB.');
  const owner=await sql(env,'SELECT id FROM leagues WHERE owner_id=?',current.userId).first();if(!owner)throw new AppError(403,'OWNER_ONLY','Só o administrador pode migrar a conta existente.');
  if(userId&&userId!==current.userId)throw new AppError(409,'ACCOUNT_LINKED','Esta conta ACB xa está vinculada a outro participante.');
  const linked=await sql(env,'SELECT acb_id FROM acb_identities WHERE user_id=?',current.userId).first<{acb_id:string}>();if(linked&&linked.acb_id!==account.acbId)throw new AppError(409,'ACCOUNT_MISMATCH','Usa a mesma conta ACB coa que activaches este acceso.');
  const selected=await sql(env,'SELECT team_id FROM acb_links WHERE user_id=?',current.userId).first<{team_id:string|null}>();if(selected?.team_id&&!list.some(t=>t.id===selected.team_id))throw new AppError(409,'ACCOUNT_MISMATCH','Esta conta ACB non contén o equipo que xa tes seleccionado. Usa a conta dese equipo.');
  userId=current.userId;migration=!existing;
 }
 if(!userId){
  ensure(typeof body.code==='string'&&body.code.length>0&&body.code.length<=64,'Para entrar por primeira vez necesitas o código de convite da liga.');
  const league=await sql(env,'SELECT id FROM leagues WHERE invite_hash=?',await hash(body.code.trim())).first<{id:string}>();if(!league)throw new AppError(400,'INVALID_INVITE','O código de convite non é válido. Pídelle un novo ao administrador.');
  leagueId=league.id;userId='acb:'+crypto.randomUUID();
 }
 const session=randomToken();const statements=[];
 if(leagueId)statements.push(sql(env,'INSERT INTO members(user_id,league_id,name) VALUES(?,?,?)',userId,leagueId,account.name));
 if(leagueId||migration)statements.push(sql(env,'INSERT INTO acb_identities(acb_id,user_id) VALUES(?,?)',account.acbId,userId));
 const cipher=await encrypt(account.jwt,env.TOKEN_ENCRYPTION_KEY,userId);const old=await sql(env,'SELECT team_id,team_name FROM acb_links WHERE user_id=?',userId).first<{team_id:string|null;team_name:string|null}>();const selected=list.find(t=>t.id===old?.team_id);
 statements.push(sql(env,'INSERT INTO acb_links(user_id,jwt,expires_at,teams_json,team_id,team_name) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET jwt=excluded.jwt,expires_at=excluded.expires_at,teams_json=excluded.teams_json,team_id=excluded.team_id,team_name=excluded.team_name',userId,cipher,tokenExpiry(account.jwt),JSON.stringify(list),selected?.id??null,selected?.name??null),sql(env,'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',await hash(session),userId,Date.now()+SESSION_MS));
 statements.push(auditStatement(env,userId,'Inicio de sesión con ACB.'));
 try{await env.DB.batch(statements);}catch{throw new AppError(409,'LOGIN_CONFLICT','Non se puido completar o acceso. Téntao de novo; pode haber outra entrada simultánea.');}
 return {session,userId};
}
