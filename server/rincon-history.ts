import {AppError} from './errors.ts';
import {CATALOG_SEASON,type CatalogPair} from '../lib/catalog.ts';
import {readRinconPage,type RinconScore} from './rincon.ts';
import type {Fetcher} from './acb.ts';
const fail=()=>new AppError(502,'RINCON_HISTORY','Non se puideron verificar os resultados finais de Rincón. Conservamos os datos anteriores.');
const plain=(s:string)=>s.replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim();
export function verifyFinishedJourney(html:string,journey:number){
 if(!html.includes(`<h1>Jornada ${journey} · ${CATALOG_SEASON}</h1>`))throw fail();
 const matches=[...html.matchAll(/aria-label="Acta del partido ([A-Z]{3}) (\d+)-(\d+) ([A-Z]{3})"/g)];
 if(matches.length!==9||new Set(matches.flatMap(m=>[m[1],m[4]])).size!==18||matches.some(m=>Number(m[2])<=0||Number(m[3])<=0))throw fail();
}
export function parsePlayerHistory(html:string,slug:string,journey:number){
 if(!/^[a-z0-9-]+$/.test(slug)||!html.includes(`/smgr/jugador/${slug}`)||!html.includes(`Estadísticas ACB ${CATALOG_SEASON}`))throw fail();
 const section=html.match(/<div id="tab-temporada"[^>]*>([\s\S]*?)<\/table>/)?.[1];
 const body=section?.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
 if(body===undefined||!section?.includes('data-sort-key="broker"')||!section.includes('data-sort-key="sm"'))throw fail();
 const rows=[...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>[...m[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)]);
 if(rows.some(c=>c.length!==12))throw fail();
 const matches=rows.filter(c=>c[0][1].includes(`data-sort="${journey}"`));
 // Absence of a row is not evidence of non-participation.
 if(matches.length!==1)throw fail();
 const c=matches[0];
 const absent=plain(c[4][2])==='—'&&plain(c[10][2])==='—'&&[5,6,7,8,9,11].every(i=>plain(c[i][2])==='')&&c[1][1].includes('data-sort=""');
 if(absent)return {points:0,valuation:0,delta:0,didNotPlay:true};
 const value=(i:number)=>{const s=c[i][1].match(/data-sort="([-+]?\d+(?:\.\d+)?)"/)?.[1];if(s===undefined)throw fail();return Number(s);};
 const points=value(10),valuation=value(9),delta=value(11);
 if(points < -100||points>200||Math.abs(delta)>10000000)throw fail();
 return {points,valuation,delta,didNotPlay:value(4)===0&&points===0&&delta===0};
}
export async function readRinconHistory(ids:string[],pairs:CatalogPair[],journey:number,fetcher:Fetcher,at=Date.now()){
 verifyFinishedJourney(await readRinconPage(`https://www.rincondelmanager.com/smgr/jornada/${journey}`,fetcher),journey);
 const result:RinconScore[]=[];
 // Four concurrent reads; each shared player is fetched once per league update.
 for(let start=0;start<ids.length;start+=4){
  result.push(...await Promise.all(ids.slice(start,start+4).map(async id=>{
   const pair=pairs.find(p=>p.acb.ref===id);if(!pair||!/^[a-z0-9-]+$/.test(pair.rincon.ref))throw fail();
   const url=`https://www.rincondelmanager.com/smgr/jugador/${pair.rincon.ref}`;
   const row=parsePlayerHistory(await readRinconPage(url,fetcher),pair.rincon.ref,journey);
   return {id,points:row.points,valuation:row.valuation,broker:null,brokerOpening:null,brokerDelta:row.delta,brokerKind:'final',didNotPlay:row.didNotPlay,playing:false,source:'rincon',sourceUrl:url,season:CATALOG_SEASON,journey,observedAt:at} satisfies RinconScore;
  })));
 }
 return result;
}
