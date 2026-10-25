import type {Score} from './model.ts';
import {brokerObservation,type ScoreContext,inContext} from './score-data.ts';
export function participationLabel(score:Score|undefined,context?:ScoreContext){
 const raw=brokerObservation(score),s=inContext(raw,context)?raw:undefined;if(!s)return '';
 if(s.readStatus==='failed')return 'Consulta fallida';
 if(s.readStatus==='conflict')return 'Datos contraditorios · pendente';
 if(s.stale||s.brokerStale)return '';
 if(s.participation==='excluded')return 'Non computa en SM · 0 definitivo';
 if(s.participation==='not-yet-played')return 'Aínda sen participar · 0 provisional';
 if(s.participation==='did-not-play')return 'Non participou · 0 definitivo';
 if(s.matchState==='postponed')return 'Aprazado · regra SM pendente';
 if(s.matchState==='scheduled')return 'Partido non comezado';
 if(s.matchState==='live')return s.participation==='played'?'En xogo':'En xogo · dato pendente';
 if(s.matchState==='final'&&s.points===null)return 'Partido finalizado · dato pendente';
 if(s.matchState==='unknown'&&s.points===null)return 'Estado sen confirmar';
 return '';
}
