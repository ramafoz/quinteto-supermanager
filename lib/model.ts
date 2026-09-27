export type Player = { id: string; name: string; position: string; club?:string };
export type Lineup = { userId: string; name: string; team: string; players: Player[]; importedAt: number; scores?:Score[]|null;scoresAt?:number|null;declaredAt?:number|null;rawPoints?:number|null;netPoints?:number|null;changes?:number; penalty?:number; baselineKnown?:boolean; history?:{at:number;incoming:Player[];outgoing:Player[];penalty:number;pending?:boolean}[] };
export type Score={id:string;valuation:number|null;points:number|null;source?:string;observedAt?:number;stale?:boolean;broker?:number|null;brokerDelta?:number|null;brokerKind?:string|null;brokerStale?:boolean;playing?:boolean};
export type Round = {rinconJourneyNumber?:number|null;rinconSeason?:string|null; acbJourneyId?:string|null;acbJourneyNumber?:number|null; id: string; label: string; lockAt: number; closedAt:number|null;endsAt:number };
export type OverallRow={userId:string;name:string;rawPoints:number;penalty:number;netPoints:number;counted:number;pending:number;provisional:boolean};
export function compare(lineups: Lineup[]) {
  const players = new Map<string, Player & { owners: string[] }>();
  for (const lineup of lineups) for (const p of lineup.players) {
    const row = players.get(p.id) ?? { ...p, owners: [] };
    if (!row.owners.includes(lineup.userId)) row.owners.push(lineup.userId);
    players.set(p.id, row);
  }
  return [...players.values()].sort((a,b) => b.owners.length-a.owners.length || a.name.localeCompare(b.name));
}
export function overlap(a: Lineup, b: Lineup) {
  const ids = new Set(b.players.map(p => p.id));
  return a.players.filter(p => ids.has(p.id)).length;
}
