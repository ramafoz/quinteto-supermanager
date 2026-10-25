import {CATALOG_SEASON} from './catalog.ts';
// The only explicitly verified postponed-game exclusion. Do not generalize it.
export function excludedFromSuperManager(journey:number,club:string|undefined){
 return CATALOG_SEASON==='2026/27'&&journey===2&&(club==='JOV'||club==='AND');
}
