import { compareId, type Profile } from '../../src/lib/game/types.ts';
import { isReliefProfile, poolBullpen } from './opponents.ts';
import type { CompiledProfiles } from './profiles.ts';

/** Builds fixed team-season bullpen remainders from relief-dominant pitcher-seasons. */
export function buildBullpenCandidates(compiled: CompiledProfiles): Profile[] {
 const teams = new Map<string, Profile[]>();
 for (const profile of compiled.profiles) {
  const key = `${profile.year}:${profile.league}:${profile.teamId}`;
  const profiles = teams.get(key) ?? [];
  profiles.push(profile);
  teams.set(key, profiles);
 }

 const candidates: Profile[] = [];
 for (const [key, profiles] of [...teams].sort(([a], [b]) => compareId(a, b))) {
  const relief = profiles.filter(isReliefProfile).sort((a, b) =>
   b.pitching!.SV - a.pitching!.SV
   || b.pitching!.IPouts - a.pitching!.IPouts
   || compareId(a.seasonId, b.seasonId)
  );
  const id = `bullpen:${key}`;
  if (relief.length < 2) {
   compiled.diagnostics.push(`${id}: bullpen excluded: fewer than two relief-dominant pitcher-seasons`);
   continue;
  }

  const [excluded, ...members] = relief;
  if (!members.some(profile => profile.pitching!.BFP > 0)) {
   compiled.diagnostics.push(`${id}: bullpen excluded: remainder has no positive BFP`);
   continue;
  }

  const pooled = poolBullpen(members, id);
  const source = profiles[0];
  const propagatedEstimates = members.flatMap(profile => profile.estimatedFields.filter(field =>
   field.startsWith('pitching.') || field.startsWith('PPF.')
  ));
  candidates.push({
   ...pooled,
   seasonId: id,
   playerId: `bullpen:${source.franchiseId}`,
   displayName: `${source.historicalTeam} bullpen remainder`,
   franchiseId: source.franchiseId,
   teamId: source.teamId,
   year: source.year,
   league: source.league,
   historicalTeam: source.historicalTeam,
   teamGames: source.teamGames,
   appearances: {},
   eligibleSlots: ['BP'],
   estimatedFields: [...new Set(['pooledRelief.BFPWeighted', 'throws.neutral', ...propagatedEstimates])].sort(compareId),
   bullpen: {
    members: members.map(profile => ({ seasonId: profile.seasonId, playerId: profile.playerId, displayName: profile.displayName })),
    excluded: { seasonId: excluded.seasonId, playerId: excluded.playerId, displayName: excluded.displayName }
   }
  });
 }
 return candidates;
}
