import catalog from '../../../scripts/data/stadiums.json';
import teams from '../../../scripts/media/team-sources.json';
import type { Manifest } from '../game/types.ts';
import { buildStadium, stadiumSummary, type StadiumSource } from '../sim/park.ts';
import { STADIUM_REFERENCE_YEAR, type StadiumSummary } from '../sim/park-types.ts';

/** The real 2025 reference parks, summarized in the browser; versions are workshop-only labels. */
export function exampleStadiums(): StadiumSummary[] {
 return (catalog.venues as StadiumSource[]).map(source => {
  const id = `${source.franchiseId}-${STADIUM_REFERENCE_YEAR}`;
  return stadiumSummary({ ...buildStadium(source, id), version: `storybook-${id}` }, source.elevationFt?.value ?? null);
 });
}

/** A manifest carrying only what the stadium deck reads: the parks and their franchise names. */
export function stadiumManifest(base: Manifest): Manifest {
 const names = teams as Record<string, { name: string }>;
 const stadiums = exampleStadiums();
 return {
  ...base,
  stadiums,
  franchises: stadiums.map(stadium => ({ id: stadium.franchiseId, name: names[stadium.franchiseId]?.name ?? stadium.franchiseId, decades: [] }))
 };
}
