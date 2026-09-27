type ScheduledRound={id:string;lockAt:number;endsAt:number;closedAt:number|null};
export function selectRound<T extends ScheduledRound>(rounds:T[],now:number,requestedId?:string):T|undefined{
 const manual=rounds.find(r=>r.id===requestedId);if(manual)return manual;
 const ordered=[...rounds].sort((a,b)=>b.lockAt-a.lockAt||a.id.localeCompare(b.id));
 const active=ordered.find(r=>r.closedAt===null&&r.lockAt<=now&&r.endsAt>now);if(active)return active;
 const next=ordered.filter(r=>r.closedAt===null&&r.lockAt>now&&r.lockAt<=now+86400000).sort((a,b)=>a.lockAt-b.lockAt)[0];
 return next??ordered.find(r=>r.lockAt<=now);
}
