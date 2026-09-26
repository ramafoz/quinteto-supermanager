import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {Miniflare} from 'miniflare';

test('ACB adapter runs in Workers and never forwards credentials through redirects',async()=>{
 const source=stripTypeScriptTypes(readFileSync(new URL('../server/acb.ts',import.meta.url),'utf8')).replace("import { AppError } from './errors.ts';",'');
 const errors=stripTypeScriptTypes(readFileSync(new URL('../server/errors.ts',import.meta.url),'utf8'));
 let mode='success';const calls=[];
 const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-22',script:errors+'\n'+source+`\nexport default {async fetch(){try{return Response.json({jwt:await signIn('fixture-user','fixture-password')});}catch(e){return Response.json({code:e.code,message:e.message},{status:e.status??500});}}};`,outboundService:async request=>{
  calls.push({url:request.url,body:await request.text()});
  if(mode==='redirect')return new Response(null,{status:307,headers:{Location:'https://unexpected.example.test/collect'}});
  return Response.json(request.url.endsWith('/signIn')?{code:'fixture-code'}:{jwt:'fixture-jwt',type:'Bearer'});
 }});
 try{
  const ok=await mf.dispatchFetch('https://local.test/');assert.equal(ok.status,200);assert.deepEqual(await ok.json(),{jwt:'fixture-jwt'});
  assert.equal(calls.length,2);assert.equal(new URLSearchParams(calls[0].body).get('password'),'fixture-password');assert.deepEqual(JSON.parse(calls[1].body),{uuid:'fixture-code',deviceId:''});
  calls.length=0;mode='redirect';const blocked=await mf.dispatchFetch('https://local.test/');assert.equal(blocked.status,502);assert.equal((await blocked.json()).code,'ACB_REDIRECT');assert.equal(calls.length,1);assert.equal(calls[0].url,'https://id.acb.com/api/signIn');
 }finally{await mf.dispose();}
});
