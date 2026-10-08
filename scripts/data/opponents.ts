import { compareId, POSITIONS, type Opponent, type PitchingCounts, type Profile, type Rates } from '../../src/lib/game/types.ts';
import { normalize } from '../../src/lib/sim/rates.ts';
import type { CompiledProfiles } from './profiles.ts';
import { opponentSlots } from './profiles.ts';

/** Maximum-weight matching, processing each athlete once so no greedy position trap exists. */
export function assignHitters(profiles: Profile[]): Profile[] {
 const slots = [...POSITIONS, 'DH'];
 const scores = new Float64Array(512).fill(-Infinity);
 const selections: (Profile[] | undefined)[] = new Array(512);
 scores[0] = 0; selections[0] = [];
 for (const profile of [...profiles].sort((a, b) => compareId(a.seasonId, b.seasonId))) {
  const legal = opponentSlots(profile);
  for (let mask = 511; mask >= 0; mask--) {
   if (!Number.isFinite(scores[mask])) continue;
   for (let slot = 0; slot < 9; slot++) {
    if (mask & (1 << slot) || !legal.includes(slots[slot] as typeof legal[number])) continue;
    const next = mask | (1 << slot);
    const score = scores[mask] + profile.batting!.PA;
    if (score > scores[next]) {
     scores[next] = score;
     const selection = selections[mask]!.slice();
     selection[slot] = profile;
     selections[next] = selection;
    }
   }
  }
 }
 if (!selections[511]) throw new Error('Opponent cannot field nine distinct legal hitters');
 return selections[511]!;
}

export function historicalOPS(profile: Profile): number {
 const b = profile.batting!;
 const obpDenominator = b.AB + b.BB + b.HBP + b.SF;
 return (obpDenominator ? (b.H + b.BB + b.HBP) / obpDenominator : 0) + (b.AB ? (b.H + b.doubles + 2 * b.triples + 3 * b.HR) / b.AB : 0);
}

export function isReliefProfile(profile: Profile): boolean {
 return Boolean(profile.pitching && profile.pitching.G > 0 && profile.pitching.GS / profile.pitching.G <= 0.2);
}

export function poolBullpen(profiles: Profile[], id: string): Profile {
 if (!profiles.length) throw new Error(`No relief evidence for ${id}`);
 const counts: PitchingCounts = { G: 0, GS: 0, IPouts: 0, H: 0, HR: 0, BB: 0, HBP: 0, SO: 0, BFP: 0, ER: 0, SV: 0 };
 const rates: Rates = [0, 0, 0, 0, 0, 0, 0, 0];
 for (const profile of profiles) {
  const source = profile.pitching!;
  for (const key of Object.keys(counts) as (keyof PitchingCounts)[]) counts[key] += source[key];
  for (let i = 0; i < 8; i++) rates[i] += profile.pitchingRates![i] * source.BFP;
 }
 if (!counts.BFP) throw new Error(`Empty bullpen evidence: ${id}`);
 return { ...profiles[0], seasonId: id, playerId: id, displayName: 'Support bullpen', bats: '', throws: '', eligibleSlots: [], primaryHitterSlot: null, appearances: {}, batting: undefined, battingRates: undefined, pitching: counts, pitchingRates: normalize(rates), estimatedFields: ['pooledRelief.BFPWeighted', 'throws.neutral'], fielding: {}, defense: { positions: {} }, historicalTeam: id === 'league:bullpen' ? 'League relief pool' : profiles[0].historicalTeam };
}

export function buildOpponents(compiled: CompiledProfiles): { opponents: Opponent[]; bullpen: Profile } {
 const contemporary = compiled.profiles.filter(profile => profile.year === 2025);
 const bullpen = poolBullpen(contemporary.filter(isReliefProfile), 'league:bullpen');
 const opponents = compiled.currentTeams.map(team => {
  const players = contemporary.filter(profile => profile.teamId === team.teamID && profile.league === team.lgID);
  const assigned = assignHitters(players);
  // Keep the exact defensive assignment on cloned opponent profiles even after batting-order sorting.
  const hitters = assigned.map((profile, index) => ({ ...profile, eligibleSlots: [index === 8 ? 'DH' : POSITIONS[index]] as Profile['eligibleSlots'] })).sort((a, b) => historicalOPS(b) - historicalOPS(a) || b.batting!.PA - a.batting!.PA || compareId(a.seasonId, b.seasonId));
  const starters = players.filter(profile => profile.pitching && profile.pitching.GS > 0).sort((a, b) => b.pitching!.GS - a.pitching!.GS || b.pitching!.IPouts - a.pitching!.IPouts || compareId(a.seasonId, b.seasonId)).slice(0, 5);
  if (starters.length !== 5) throw new Error(`Opponent lacks five starters: ${team.franchID}`);
  const relief = players.filter(isReliefProfile).sort((a, b) => b.pitching!.SV - a.pitching!.SV || b.pitching!.IPouts - a.pitching!.IPouts || compareId(a.seasonId, b.seasonId));
  if (relief.length < 2) throw new Error(`Opponent lacks closer/support relief: ${team.franchID}`);
  const park = team.BPF?.trim() ? Number(team.BPF) : 100;
  if (!Number.isFinite(park) || park <= 0) throw new Error(`Invalid opponent park: ${team.franchID}`);
  return { id: team.franchID, name: team.name, park: Math.max(0.8, Math.min(1.2, park / 100)), hitters, starters, closer: relief[0], bullpen: poolBullpen(relief.slice(1), `${team.franchID}:bullpen`) };
 });
 return { opponents, bullpen };
}
