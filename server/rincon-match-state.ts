import type {MatchState} from '../lib/model.ts';
import {CATALOG_SEASON} from '../lib/catalog.ts';

export function explicitMatchState(text:string):MatchState{
 const state=text.trim();
 if(/^Final$/i.test(state))return 'final';
 if(/^min\s+\d+(?::\d+)?$/i.test(state))return 'live';
 if(/^aplazado$|^pospuesto$|^adiado$/i.test(state))return 'postponed';
 if(/^\d{1,2}:\d{2}$/.test(state))return 'scheduled';
 return 'unknown';
}
const plain=(s:string)=>s.replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim();
function scheduledTime(date:string,time:string){
 const d=/^(\d{2})\/(\d{2})$/.exec(date),t=/^(\d{1,2}):(\d{2})$/.exec(time);if(!d||!t)return null;
 const month=Number(d[2]),day=Number(d[1]),hour=Number(t[1]),minute=Number(t[2]);
 if(month<1||month>12||day<1||day>31||hour>23||minute>59)return null;
 const year=Number(CATALOG_SEASON.slice(0,4))+(month<8?1:0);
 const naive=Date.UTC(year,month-1,day,hour,minute);
 if(new Date(naive).getUTCMonth()!==month-1)return null;
 // Calendar display times are Europe/Madrid, including the autumn DST change.
 const offset=new Intl.DateTimeFormat('en',{timeZone:'Europe/Madrid',timeZoneName:'shortOffset'}).formatToParts(naive).find(p=>p.type==='timeZoneName')?.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
 if(!offset)return null;
 return naive-(offset[1]==='+'?1:-1)*(Number(offset[2])*60+Number(offset[3]??0))*60000;
}
// Only the requested season/round article is considered. An overdue schedule
// without a live/final status remains unknown; it is not proof of postponement.
export function parseCalendarStates(html:string,journey:number,at:number){
 if(!html.includes(`Calendario · ${CATALOG_SEASON}`))throw new Error('Unverified calendar season');
 const article=html.match(new RegExp(`<article\\b[^>]*id="j-${journey}"[^>]*>([\\s\\S]*?)<\\/article>`))?.[1];
 if(!article||!article.includes(`<h3>Jornada ${journey}</h3>`))throw new Error('Unverified calendar round');
 const result=new Map<string,MatchState>();
 const rows=[...article.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)];
 if(!rows.length||rows.length>9)throw new Error('Incomplete calendar');
 for(const row of rows){
  const clubs=[...row[1].matchAll(/class="team-code">([A-Z]{3})<\/span>/g)].map(m=>m[1]);
  if(clubs.length!==2||clubs[0]===clubs[1]||clubs.some(c=>result.has(c)))throw new Error('Ambiguous calendar match');
  const final=row[1].match(/aria-label="([A-Z]{3}) (\d+)-(\d+) ([A-Z]{3}): acta del partido"/);
  const visible=plain(row[1]);let state:MatchState='unknown';
  if(final&&final[1]===clubs[0]&&final[4]===clubs[1]&&Number(final[2])>0&&Number(final[3])>0)state='final';
  else if(/\b(?:Aplazado|Pospuesto|Adiado)\b/i.test(visible))state='postponed';
  else {
   const date=row[1].match(/class="cal-when__d">([^<]+)<\/span>/)?.[1];
   const time=row[1].match(/class="cal-when__t">([^<]+)<\/span>/)?.[1];
   const scheduled=date&&time?scheduledTime(date,time):null;
   if(scheduled!==null&&scheduled>at)state='scheduled';
  }
  for(const club of clubs)result.set(club,state);
 }
 return result;
}
