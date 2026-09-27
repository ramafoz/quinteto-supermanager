import { env } from 'cloudflare:workers';
import { identity } from '@/server/identity';
import { action,state,type Runtime } from '@/server/service';
import { AppError } from '@/server/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
function runtime(){if(!env.DB)throw new AppError(503,'DB_UNAVAILABLE','A liga non está dispoñible. Téntao máis tarde.');return env as Runtime;}
function failure(error:unknown){if(error instanceof AppError)return json({error:error.message,code:error.code},error.status);console.error('League operation failed; request and upstream payloads intentionally omitted.');return json({error:'Non se puido gardar ou cargar a liga. Téntao de novo.',code:'INTERNAL'},500);}
export async function GET(request:Request){try{const user=await identity(runtime(),request);if(!user)return json({signedIn:false});return json(await state(runtime(),user,new URL(request.url).searchParams.get('round')??undefined));}catch(e){return failure(e);}}
async function body(request:Request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new AppError(415,'CONTENT_TYPE','Requírese JSON.');
 const reader=request.body?.getReader();if(!reader)throw new AppError(400,'INVALID_INPUT','Faltan os datos.');
 const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();throw new AppError(413,'BODY_TOO_LARGE','Demasiados datos.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||Array.isArray(value)||typeof value!=='object')throw Error();return value as Record<string,unknown>;}catch{throw new AppError(400,'INVALID_INPUT','Datos non válidos.');}
}
export async function POST(request:Request){try{
 const user=await identity(runtime(),request);if(!user)return json({error:'Inicia sesión para continuar.',code:'SIGN_IN'},401);
 if(request.headers.get('Origin')!==new URL(request.url).origin)throw new AppError(403,'CSRF','Recarga a páxina e volve tentalo.');
 const payload=await body(request);const name=payload.action;
 if(typeof name!=='string'||!['create','join','connect','select-team','import','disconnect','invite','round','close-round','score','remove-member','ping','refresh-team','audit','penalty','acb-journeys','refresh-scores','refresh-rincon-scores','catalog-read','catalog-refresh','catalog-confirm'].includes(name))throw new AppError(400,'INVALID_INPUT','Acción non válida.');
 return json(await action(runtime(),user,name,payload));
 }catch(e){return failure(e);}}
