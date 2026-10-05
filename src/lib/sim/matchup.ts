import type { Profile, Rates } from '../game/types.ts';
import { HIT_INDICES, matchupRates, normalize } from './rates.ts';

export function matchup(batter: Profile, pitcher: Profile, league: Rates, park = 1): Rates {
 if (!batter.battingRates || !pitcher.pitchingRates) throw new Error('Matchup requires batting and pitching rates');
 if (!Number.isFinite(park) || park <= 0) throw new Error('Invalid matchup park');
 const weights = matchupRates(batter.battingRates, pitcher.pitchingRates, league);
 let side = batter.bats;
 if (side === 'B') side = pitcher.throws === 'L' ? 'R' : pitcher.throws === 'R' ? 'L' : '';
 const known = (side === 'L' || side === 'R') && (pitcher.throws === 'L' || pitcher.throws === 'R');
 const same = side === pitcher.throws;
 const hitAndWalk = known ? same ? 0.95 : 1.025 : 1;
 const strikeout = known ? same ? 1.05 : 0.975 : 1;
 const parkMultiplier = Math.max(0.8, Math.min(1.2, park));
 weights[0] *= hitAndWalk;
 weights[2] *= strikeout;
 for (const event of HIT_INDICES) weights[event] *= hitAndWalk * parkMultiplier;
 return normalize(weights);
}
/** Flat cumulative tables avoid allocation and string-key lookups inside a PA. */
export function buildMatchups(batters: readonly Profile[], pitchers: readonly Profile[], league: Rates, park = 1): Float64Array {
 const table = new Float64Array(batters.length * pitchers.length * 8);
 for (let hitter = 0; hitter < batters.length; hitter++) for (let pitcher = 0; pitcher < pitchers.length; pitcher++) {
  const rates = matchup(batters[hitter], pitchers[pitcher], league, park);
  const offset = (hitter * pitchers.length + pitcher) * 8;
  let total = 0;
  for (let event = 0; event < 8; event++) { total += rates[event]; table[offset + event] = total; }
  table[offset + 7] = 1;
 }
 return table;
}
export function sampleEvent(table: Float64Array, offset: number, value: number): number {
 if (value < 0 || value >= 1 || !Number.isFinite(value)) throw new Error('Invalid random sample');
 for (let event = 0; event < 8; event++) if (value < table[offset + event]) return event;
 throw new Error('Invalid categorical table');
}
