import {hash} from './crypto.ts';
import type {Runtime,Identity} from './service.ts';
export const COOKIE='__Host-quinteto';
export const SESSION_MS=30*86400000;
export const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
export function sessionCookie(value:string){return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS/1000}`;}
export function cookieToken(request:Request){return (request.headers.get('cookie')??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);}
export async function sessionIdentity(env:Runtime,value:string){if(!/^[a-f0-9]{64}$/.test(value))return null;return env.DB.prepare('SELECT m.user_id AS userId,m.name AS displayName FROM sessions s JOIN members m ON m.user_id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await hash(value),Date.now()).first<Identity>();}
export async function logout(env:Runtime,request:Request){const value=cookieToken(request);if(value)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(value)).run();}
