import { AppError } from './errors.ts';
const bytes = (s: string) => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
const base64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
async function key(secret: string | undefined) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new AppError(503,'KEY_MISSING','A conexión ACB aínda non está configurada.');
  return crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g)!,v=>parseInt(v,16)), 'AES-GCM', false,['encrypt','decrypt']);
}
export async function encrypt(value: string, secret: string | undefined, owner: string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(owner)},await key(secret),new TextEncoder().encode(value));
  return `v1.${base64(iv)}.${base64(new Uint8Array(data))}`;
}
export async function decrypt(value: string, secret: string | undefined, owner: string) {
  const [version,iv,data]=value.split('.');
  if(version!=='v1') throw new AppError(409,'RECONNECT','Volve conectar a túa conta ACB.');
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:new TextEncoder().encode(owner)},await key(secret),bytes(data))); }
  catch { throw new AppError(409,'RECONNECT','Volve conectar a túa conta ACB.'); }
}
export async function hash(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function invitation(){return [...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('');}
