import type { Lineup } from './model';
const names = ['Bruno Martín','Leo Vidal','Álex Costa','Nico Torres','Hugo Serra','Dani Soler','Pablo Ríos','Eric Molina','Iván Lago','Mario Vela','Lucas Rey','Óscar Gil','Adrián Soto','Raúl Cano','Jorge Roca','Sergio Paz'];
const players = names.map((name,i)=>({id:`demo-${i}`,name,club:i===0||i===6?'Río Breogán':i===2||i===7?'Leyma Coruña':i===3?'Obradoiro':'Outro club',position:i<2?'Base':i<6?'Alero':i<10?'Pívot':i<12?'Base':i<14?'Alero':'Pívot'}));
export const demoLineups: Lineup[] = [
  {userId:'javier',name:'Javier',team:'Os Ramosinos',ids:[0,1,2,3,4,5,6,7,8,9]},
  {userId:'pedro',name:'Pedro',team:'A lousa de Pedro',ids:[0,10,2,3,4,12,6,7,8,14]},
  {userId:'pablo',name:'Pablo',team:'Tripla ou nada',ids:[0,11,2,3,5,13,6,7,9,15]},
  {userId:'dani',name:'Dani',team:'Os do rebote',ids:[0,1,2,3,4,13,6,7,8,15]},
].map(t=>({userId:t.userId,name:t.name,team:t.team,players:t.ids.map(i=>players[i]),rawPoints:t.userId==='pedro'?203:180,changes:t.userId==='pedro'?2:0,penalty:t.userId==='pedro'?50:0,netPoints:t.userId==='pedro'?153:180,baselineKnown:true,importedAt:1790330400000}));
