import { createHash } from 'node:crypto';
import { compareId } from '../../src/lib/game/types.ts';
import { buildStadium, stadiumSummary, validateStadium, type StadiumSource } from '../../src/lib/sim/park.ts';
import { STADIUM_REFERENCE_YEAR, type StadiumConfig, type StadiumSummary } from '../../src/lib/sim/park-types.ts';
import { canonicalJSON } from './compile.ts';

export interface StadiumCatalog { catalogVersion: string; referenceYear: number; venues: StadiumSource[] }

/**
 * Compiles one 2025 reference venue per current franchise. Ids are `{franchiseId}-2025`;
 * versions are the SHA-256 of the canonical configuration without its version.
 */
export function compileStadiums(catalog: StadiumCatalog, franchiseIds: readonly string[]): { configs: StadiumConfig[]; summaries: StadiumSummary[] } {
 if (catalog.catalogVersion !== 'stadium-sources-v1' || catalog.referenceYear !== STADIUM_REFERENCE_YEAR || !Array.isArray(catalog.venues)) throw new Error('Invalid stadium catalog');
 const byFranchise = new Map<string, StadiumSource>();
 for (const venue of catalog.venues) {
  if (byFranchise.has(venue.franchiseId)) throw new Error(`Duplicate stadium franchise: ${venue.franchiseId}`);
  if (!franchiseIds.includes(venue.franchiseId)) throw new Error(`Stadium for unknown franchise: ${venue.franchiseId}`);
  byFranchise.set(venue.franchiseId, venue);
 }
 const configs: StadiumConfig[] = [];
 const summaries: StadiumSummary[] = [];
 for (const franchiseId of [...franchiseIds].sort(compareId)) {
  const source = byFranchise.get(franchiseId);
  if (!source) throw new Error(`Missing reference stadium for ${franchiseId}`);
  const base = buildStadium(source, `${franchiseId}-${STADIUM_REFERENCE_YEAR}`);
  const config: StadiumConfig = { ...base, version: createHash('sha256').update(canonicalJSON(base)).digest('hex') };
  validateStadium(config);
  configs.push(config);
  summaries.push(stadiumSummary(config, source.elevationFt?.value ?? null));
 }
 return { configs, summaries };
}
