import type { Draft, Profile, SimulationData } from './types.ts';
import type { SeasonInput } from '../sim/types.ts';
import { resolveStadium, validateDraftVersion, validateSeason } from '../sim/validation.ts';

/** Builds and validates the engine input for a completed draft against its loaded profiles. */
export function prepareSeasonInput(draft: Draft, profiles: Profile[], data: SimulationData): SeasonInput {
 validateDraftVersion(draft, data.dataVersion);
 const byId = new Map(profiles.map(profile => [profile.seasonId, profile]));
 if (byId.size !== profiles.length) throw new Error('Duplicate season profiles');
 const roster = draft.picks.map(pick => {
  const profile = byId.get(pick.seasonId);
  if (!profile || pick.franchiseId !== profile.franchiseId || pick.decade !== Math.floor(profile.year / 10) * 10) throw new Error('Missing or mismatched draft profile');
  return { profile, slot: pick.slot };
 });
 const stadium = resolveStadium(data, draft.homeStadium);
 const input: SeasonInput = {
  schemaVersion: draft.schemaVersion, modelVersion: draft.modelVersion, rulesVersion: draft.rulesVersion, seed: draft.seed,
  homeStadium: { id: stadium.id, version: stadium.version },
  roster, battingOrder: [...draft.battingOrder], starterOrder: [...draft.starterOrder],
  reliefRoles: draft.reliefRoles.map(assignment => ({ ...assignment })), data
 };
 validateSeason(input);
 return input;
}
