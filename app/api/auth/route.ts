import {env} from 'cloudflare:workers';
import {identity} from '@/server/identity';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {audit} from '@/server/audit';
import {acbLogin} from '@/server/account';
import {logout,sessionCookie,randomToken,SESSION_MS} from '@/server/sessions';
import {hash} from '@/server/crypto';
import {rateLimit,type Runtime} from '@/server/service';
import {AppError} from '@/server/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200,cookie?:string)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...(cookie?{'Set-Cookie':cookie}:{})}});
export async function POST(request:Request){try{
 if(request.headers.get('Origin')!==new URL(request.url).origin)throw new AppError(403,'CSRF','Recarga a páxina e volve tentalo.');
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AppError(415,'INPUT','Formato non válido.');
 const reader=request.body?.getReader();if(!reader)throw new AppError(400,'INPUT','Faltan os datos.');
 const chunks=[];let size=0;for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4096){await reader.cancel();throw new AppError(413,'INPUT','Demasiados datos.');}chunks.push(part.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AppError(400,'INPUT','Datos non válidos.');}if(!body||typeof body!=='object'||Array.isArray(body))throw new AppError(400,'INPUT','Datos non válidos.');
 const runtime=env as Runtime;
 if(body.action==='logout'){await logout(runtime,request);return json({ok:true},200,sessionCookie('signedout'));}
 await rateLimit(runtime,await hash(request.headers.get('CF-Connecting-IP')??'unknown'),'auth-ip',15);
 if(body.action==='recover'){
  const previous=await getChatGPTUser();if(!previous)throw new AppError(401,'SIGN_IN','Identifícate coa conta orixinal do administrador.');
  const owner=await runtime.DB.prepare('SELECT id FROM leagues WHERE owner_id=?').bind(previous.userId).first();if(!owner)throw new AppError(403,'OWNER_ONLY','Acceso reservado ao administrador orixinal.');
  const raw=randomToken();await runtime.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await hash(raw),previous.userId,Date.now()+SESSION_MS).run();await audit(runtime,previous.userId,'Inicio de sesión mediante recuperación do administrador.');return json({ok:true},200,sessionCookie(raw));
 }
 if(body.action!=='login')throw new AppError(400,'INPUT','Acción non válida.');
 const current=body.migrate===true?await identity(runtime,request):null;
 const result=await acbLogin(runtime,body,current);return json({ok:true},200,sessionCookie(result.session));
 }catch(e){if(e instanceof AppError)return json({error:e.message,code:e.code},e.status);return json({error:'Non se puido completar o acceso. Téntao de novo.'},500);}}
