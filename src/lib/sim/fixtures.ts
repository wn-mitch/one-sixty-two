import { POSITIONS, type Profile, type Rates } from '../game/types.ts';
export const AVERAGE_RATES: Rates = [0.08, 0.012, 0.225, 0.145, 0.044, 0.004, 0.033, 0.457];
/** Anonymous neutral profile shared by deterministic model checks. */
export function syntheticProfile(id: string, rates: Rates = AVERAGE_RATES): Profile {
 return {
  seasonId: `${id}:2025:AL:T`, playerId: id, displayName: `Player ${id}`, franchiseId: 'T', teamId: 'T', year: 2025, league: 'AL', historicalTeam: 'Synthetic Club', teamGames: 162, bats: '', throws: '', eligibleSlots: ['DH'], appearances: {},
  batting: { AB: 600, H: 180, doubles: 30, triples: 3, HR: 20, BB: 60, HBP: 5, SO: 150, SH: 0, SF: 5, SB: 0, CS: 0, GIDP: 0, PA: 670 },
  pitching: { G: 30, GS: 30, IPouts: 540, H: 150, HR: 20, BB: 40, HBP: 5, SO: 180, BFP: 720, ER: 60, SV: 0 },
  battingRates: [...rates], pitchingRates: [...rates], fielding: {}, errorRates: Object.fromEntries(POSITIONS.map(position => [position, 0.01])) as Profile['errorRates'], catcherCS: 0.25,
  speed: 0.5, stealAttempt: 0.03, stealSuccess: 0.75, doublePlay: 0.08, estimatedFields: []
 };
}
