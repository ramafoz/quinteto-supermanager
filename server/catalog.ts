import type {Runtime,Identity} from './service.ts';
import type {Fetcher} from './acb.ts';
import {AppError,ensure} from './errors.ts';
import {decrypt} from './crypto.ts';
import {audit} from './audit.ts';
import {approvedCatalogPairs} from './catalog-seed.ts';
import {readCatalogSources} from './catalog-sources.ts';
import {CATALOG_SEASON,catalogRows,normalizeName,type CatalogPair,type CatalogDocument,type CatalogEntry,type CatalogPlayer,type CatalogView} from '../lib/catalog.ts';
type Saved={revision:number;checked_at:number|null;document_json:string;confirmed_json:string;history_json:string};
const initial=():Saved=>({revision:0,checked_at:null,document_json:JSON.stringify({acb:approvedCatalogPairs.map(p=>({player:p.acb,present:true,lastSeenAt:p.confirmedAt})),rincon:approvedCatalogPairs.map(p=>({player:p.rincon,present:true,lastSeenAt:p.confirmedAt}))}),confirmed_json:JSON.stringify(approvedCatalogPairs),history_json:'[]'});
function view(saved:Saved):CatalogView{
 const document=JSON.parse(saved.document_json) as CatalogDocument;const pairs=JSON.parse(saved.confirmed_json) as CatalogPair[];
 return {season:CATALOG_SEASON,revision:saved.revision,checkedAt:saved.checked_at,reviewDue:saved.checked_at===null||Date.now()-saved.checked_at>=7*86400000,rows:catalogRows(document,pairs),rincon:document.rincon.filter(e=>e.present).map(e=>e.player),acbCount:document.acb.filter(e=>e.present).length,rinconCount:document.rincon.filter(e=>e.present).length,seedOnly:saved.checked_at===null};
}
function merge(previous:CatalogEntry[],players:CatalogPlayer[],at:number){
 const entries=new Map(previous.map(e=>[e.player.ref,{...e,present:false}]));
 for(const player of players)entries.set(player.ref,{player,present:true,lastSeenAt:at});return [...entries.values()];
}
export async function catalogAction(env:Runtime,user:Identity,action:string,body:Record<string,unknown>,fetcher:Fetcher=fetch){
 const owner=await env.DB.prepare('SELECT l.id FROM leagues l JOIN members m ON m.league_id=l.id WHERE m.user_id=? AND l.owner_id=?').bind(user.userId,user.userId).first<{id:string}>();
 if(!owner)throw new AppError(403,'OWNER_ONLY','Só o administrador pode revisar o catálogo.');
 const existing=await env.DB.prepare('SELECT * FROM league_catalogs WHERE league_id=? AND season=?').bind(owner.id,CATALOG_SEASON).first<Saved>();const saved=existing??initial();
 if(action==='catalog-read')return view(saved);
 ensure(Number.isInteger(body.revision)&&body.revision===saved.revision,'O catálogo cambiou noutra pestana. Preme «Ver catálogo» para recargalo.');
 const document=JSON.parse(saved.document_json) as CatalogDocument;let pairs=JSON.parse(saved.confirmed_json) as CatalogPair[];const history=JSON.parse(saved.history_json) as unknown[];
 const at=Date.now();let nextDocument=document;let checkedAt=saved.checked_at;let message='';
 if(action==='catalog-refresh'){
  const link=await env.DB.prepare('SELECT jwt,expires_at FROM acb_links WHERE user_id=?').bind(user.userId).first<{jwt:string;expires_at:number}>();
  if(!link||link.expires_at<=Date.now())throw new AppError(409,'RECONNECT','Conecta de novo a túa conta ACB para actualizar o catálogo.');
  const jwt=await decrypt(link.jwt,env.TOKEN_ENCRYPTION_KEY,user.userId);const fetched=await readCatalogSources(jwt,fetcher);
  // Active-edition filter plus named anchors guards against season-wide ID reuse.
  const anchors=approvedCatalogPairs.filter(p=>fetched.acb.some(a=>a.ref===p.acb.ref&&(normalizeName(a.name)===normalizeName(p.acb.name)||normalizeName(a.name)===normalizeName(p.rincon.shortName))));
  ensure(anchors.length>=5,'Non se pode verificar que o catálogo ACB corresponda á tempada 2026/27. Conservamos os datos anteriores.');
  if(saved.checked_at!==null)for(const key of ['acb','rincon'] as const){const count=document[key].filter(e=>e.present).length;ensure(fetched[key].length>=count*0.7,'A fonte devolveu moitos menos xogadores. Conservamos o catálogo para evitar baixas por unha resposta incompleta.');}
  nextDocument={acb:merge(document.acb,fetched.acb,at),rincon:merge(document.rincon,fetched.rincon,at)};checkedAt=at;
  message=`Catálogo consultado: ${fetched.acb.length} xogadores ACB e ${fetched.rincon.length} de Rincón. Equivalencias confirmadas conservadas.`;
 }else if(action==='catalog-confirm'){
  ensure(saved.checked_at!==null,'Actualiza primeiro o catálogo.');
  const selections=body.selections as {acbId:string;rinconRef:string}[];
  ensure(Array.isArray(selections)&&selections.length>0&&selections.length<=50&&selections.every(s=>s&&typeof s.acbId==='string'&&typeof s.rinconRef==='string'),'Escolle entre 1 e 50 correspondencias.');
  ensure(new Set(selections.map(s=>s.acbId)).size===selections.length,'Non repitas xogadores na mesma confirmación.');
  const next=new Map(pairs.map(p=>[p.acb.ref,p]));
  for(const selection of selections){
   const acb=document.acb.find(e=>e.present&&e.player.ref===selection.acbId)?.player;const rincon=document.rincon.find(e=>e.present&&e.player.ref===selection.rinconRef)?.player;
   ensure(acb&&rincon,'Un dos xogadores xa non está no catálogo actual. Revisa a correspondencia.');
   const pair={acb,rincon,confirmedAt:at,confirmedBy:user.userId};history.push({at,by:user.userId,acbId:acb.ref,previous:next.get(acb.ref)??null,next:pair});next.set(acb.ref,pair);
  }
  pairs=[...next.values()];ensure(new Set(pairs.map(p=>p.rincon.ref)).size===pairs.length,'Un xogador de Rincón xa está vinculado a outra ID ACB. Non se gardaron cambios.');
  message=`O administrador confirmou ${selections.length} equivalencias do catálogo.`;
 }else throw new AppError(400,'INVALID_INPUT','Acción de catálogo non válida.');
 const next:Saved={revision:saved.revision+1,checked_at:checkedAt,document_json:JSON.stringify(nextDocument),confirmed_json:JSON.stringify(pairs),history_json:JSON.stringify(history)};
 const stored=await env.DB.prepare(`INSERT INTO league_catalogs(league_id,season,revision,checked_at,document_json,confirmed_json,history_json)
 SELECT ?,?,?,?,?,?,? WHERE COALESCE((SELECT revision FROM league_catalogs WHERE league_id=? AND season=?),0)=?
 ON CONFLICT(league_id,season) DO UPDATE SET revision=excluded.revision,checked_at=excluded.checked_at,document_json=excluded.document_json,confirmed_json=excluded.confirmed_json,history_json=excluded.history_json WHERE league_catalogs.revision=? RETURNING revision`).bind(owner.id,CATALOG_SEASON,next.revision,next.checked_at,next.document_json,next.confirmed_json,next.history_json,owner.id,CATALOG_SEASON,saved.revision,saved.revision).first();
 if(!stored)throw new AppError(409,'CATALOG_CONFLICT','Outra actualización cambiou o catálogo. Recarga e revisa de novo.');
 await audit(env,user.userId,message);return view(next);
}
