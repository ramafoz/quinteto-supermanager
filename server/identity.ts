import {getChatGPTUser} from '../app/chatgpt-auth';
import {cookieToken,sessionIdentity} from './sessions';
import type {Runtime,Identity} from './service';
export async function identity(env:Runtime,request:Request):Promise<Identity|null>{
 const cookie=cookieToken(request);if(cookie!==undefined)return sessionIdentity(env,cookie);
 // Transitional recovery for the existing league owner only; friends use links.
 const old=await getChatGPTUser();if(!old)return null;
 const member=await env.DB.prepare('SELECT m.user_id FROM members m JOIN leagues l ON l.id=m.league_id WHERE m.user_id=? AND l.owner_id=?').bind(old.userId,old.userId).first();
 return member?old:null;
}
