import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const root=fileURLToPath(new URL('../',import.meta.url));
const compiled=buildSync({entryPoints:[root+'components/league-board.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':root},external:['react','react/jsx-runtime']});
const mod={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const Board=mod.exports.default;
const context={season:'2026/27',journey:5};
const players=Array.from({length:10},(_,i)=>({id:String(i),name:'Player '+i,club:i<2?'Río Breogán':'FCB',position:'Base'}));
const team={userId:'u',name:'Fixture',team:'Team',players,importedAt:1,scoreContext:context};
const score=(id,delta)=>({id,source:'rincon',points:1,valuation:1,brokerDelta:delta,brokerKind:'provisional',...context});
const render=(t,tab='teams')=>renderToStaticMarkup(React.createElement(Board,{lineups:[t],tab,filter:'all'}));
test('team card renders partial signed broker and independent unchanged counts',()=>{
 const html=render({...team,scores:[score('0',107081),score('1',0)],noChanges:{points:15,brokerDelta:-2000,pointStatus:{count:3,expected:10,state:'partial'},brokerStatus:{count:2,expected:10,state:'partial'}}});
 assert.match(html,/Variación de broker:/);assert.match(html,/107\.081/);assert.match(html,/Parcial · 2\/10/);assert.match(html,/Parcial · 3\/10/);assert.match(html,/sen cambios/);
});
test('definitive zero is visible and mismatched player data is labelled as previous',()=>{
 const html=render({...team,scores:players.map(p=>({...score(p.id,0),brokerKind:'final'}))});
 assert.match(html,/Definitivo/);assert.doesNotMatch(html,/Datos de broker incompletos/);
 assert.match(render({...team,scores:[{...score('0',900),journey:4}]}),/Dato anterior/);
});
test('historical broker delta remains visible in player table when absolute price is unavailable',()=>{
 const html=render({...team,scores:[{...score('0',12345),broker:null,brokerKind:'final'}]},'players');
 assert.match(html,/12\.345/);assert.match(html,/Definitivo/);
});
test('nonparticipation zeros render as zero with provisional/final labels rather than a missing dash',()=>{
 for(const [participation,final,label] of [['not-yet-played',false,'0 provisional'],['did-not-play',true,'0 definitivo']]){
  const s={...score('0',0),points:0,didNotPlay:final,pointsFinal:final,brokerKind:final?'final':'provisional',matchState:final?'final':'live',participation};
  const html=render({...team,scores:[s]});assert.match(html,new RegExp(label));
  const player=html.match(/<li>Player 0[\s\S]*?<\/li>/)?.[0];assert.equal(typeof player,'string');assert.match(player,/>0 pt<\/b>/);assert.doesNotMatch(player,/>— pt<\/b>/);
  assert.match(render({...team,scores:[s]},'players'),new RegExp(label));
 }
});
test('team card shows the valid partial points and its count, excluding stale 17',()=>{
 const scores=players.map((p,i)=>({...score(p.id,0),points:i?5:17,stale:i===0}));
 const html=render({...team,scores,scoresAt:200,rawPoints:62,penalty:4});
 assert.match(html,/>45 puntos<\/b>/);assert.match(html,/Parcial · 9\/10/);assert.match(html,/41 tras penalizacións/);
 assert.doesNotMatch(html,/>62 puntos<\/b>/);
});
test('manual total does not acquire misleading player-completeness labels',()=>{
 const html=render({...team,scores:players.map(p=>({...score(p.id,0),points:17,stale:true})),scoresAt:null,rawPoints:203,penalty:4});
 assert.match(html,/>203 puntos<\/b>/);assert.match(html,/199 tras penalizacións/);
});
test('round standings sort by valid live/net totals rather than a stale raw cache, and show the same count',()=>{
 const output=buildSync({entryPoints:[root+'components/standings.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':root},external:['react','react/jsx-runtime']});
 const module={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const stale={...team,name:'Stale',scores:players.map((p,i)=>({...score(p.id,0),points:i?5:17,stale:i===0})),scoresAt:200,rawPoints:62,penalty:4};
 const complete={...team,userId:'v',name:'Valid',scores:players.map(p=>({...score(p.id,0),points:5})),scoresAt:200,rawPoints:50,penalty:4};
 for(const metric of ['acb','net']){
  const html=renderToStaticMarkup(React.createElement(module.exports.default,{lineups:[stale,complete],demo:false,editable:false,busy:false,onScore:async()=>{},metric}));
  assert(html.indexOf('<b>Valid</b>')<html.indexOf('<b>Stale</b>'));assert.match(html,/<strong>41<\/strong>/);assert.match(html,/<strong>46<\/strong>/);assert.match(html,/Parcial · 9\/10/);
 }
});
