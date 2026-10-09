import type { Draft, Manifest, Profile } from '../game/types.ts';
import type { WarRankings } from '../rankings/types.ts';
import type { SharePublication } from '../share/types.ts';
import { prepareSeasonInput, simulateSeason } from '../sim/season.ts';
import type { SeasonResult } from '../sim/types.ts';
import { createExampleFixtures } from './fixtures.ts';

export interface ExampleSeason {
 draft: Draft;
 profiles: Profile[];
 manifest: Manifest;
 rankings: WarRankings;
 result: SeasonResult;
}

interface ExamplePublicationOptions {
 replayId: string;
 replayUrl: string;
 modelDigest: string;
 imageUrl: string;
 imageDigest: string;
}

export function createExamplePublication(result: SeasonResult | null, options: ExamplePublicationOptions): SharePublication {
 return {
  schemaVersion: 1,
  replayId: options.replayId,
  replayUrl: options.replayUrl,
  modelDigest: options.modelDigest,
  record: {
   wins: result?.wins ?? 0,
   losses: result?.losses ?? 0,
   firstLoss: result?.firstLoss ?? null,
   longestWinningStreak: result?.longestWinningStreak ?? 0,
   runsFor: result?.runsFor ?? 0,
   runsAgainst: result?.runsAgainst ?? 0
  },
  images: {
   scorecard: { url: options.imageUrl, width: 1080, height: 1350, sha256: options.imageDigest },
   diamond: { url: options.imageUrl, width: 1080, height: 1350, sha256: options.imageDigest },
   wide: { url: options.imageUrl, width: 1200, height: 630, sha256: options.imageDigest }
  }
 };
}

let cachedResult: Promise<SeasonResult> | null = null;

function resultForExamples(): Promise<SeasonResult> {
 if (!cachedResult) {
  cachedResult = new Promise<void>(resolve => setTimeout(resolve, 0)).then(() => {
   const fixtures = createExampleFixtures();
   return simulateSeason(prepareSeasonInput(fixtures.completeDraft, fixtures.profiles, fixtures.simulationData));
  });
 }
 return cachedResult;
}

/**
 * Produces fresh mutable draft and profile fixtures alongside one cached real
 * 162-game simulation. The cached result is never fabricated or recomputed by
 * consumers; createExampleFixtures supplies independent editable state.
 */
export async function getExampleSeason(): Promise<ExampleSeason> {
 const result = await resultForExamples();
 const fixtures = createExampleFixtures();
 const selected = new Set(fixtures.completeDraft.picks.map(pick => pick.seasonId));
 return {
  draft: fixtures.completeDraft,
  profiles: fixtures.profiles.filter(profile => selected.has(profile.seasonId)),
  manifest: fixtures.manifest,
  rankings: fixtures.rankings,
  result
 };
}
