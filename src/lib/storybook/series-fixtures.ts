import { libraryEntry, libraryLink, replayKeyDigest, type LibraryView } from '../game/library.ts';
import { replayInput } from '../game/draft.ts';
import { seriesHash } from '../game/replay-link.ts';
import { seriesRecord, type SeriesRecord } from '../game/series-history.ts';
import { HITTER_SLOTS, type Draft, type HitterSlot, type Manifest, type Profile } from '../game/types.ts';
import { prepareSeasonInput, simulateSeason } from '../sim/season.ts';
import { simulateSeries } from '../sim/series.ts';
import { SERIES_TEAM_IDS, type SeriesResult, type SeriesTeamId } from '../sim/series-types.ts';
import { createExampleFixtures } from './fixtures.ts';

export interface ExampleSeries {
 result: SeriesResult;
 manifest: Manifest;
 profiles: Record<SeriesTeamId, Profile[]>;
 drafts: Record<SeriesTeamId, Draft>;
 /** Saved-season entries for both clubs plus one retired memento, as the season library shows them. */
 library: LibraryView[];
 /** Season profiles by library key, for the playable clubs' cards. */
 libraryProfiles: Map<string, Profile[]>;
 /** The example series as the head-to-head history records it. */
 history: SeriesRecord[];
}

const NAMES: Record<SeriesTeamId, string> = { 'team-a': 'Example Aces', 'team-b': 'Example Rivals' };

let cached: Promise<ExampleSeries> | null = null;

/**
 * Two example clubs from the canonical fixture roster, played through a real best-of-five.
 * The rival hits weaker and calls a different park home, so seeding comes from their records.
 */
export function getExampleSeries(): Promise<ExampleSeries> {
 if (!cached) cached = new Promise<void>(resolve => setTimeout(resolve, 0)).then(buildSeries);
 return cached;
}

async function buildSeries(): Promise<ExampleSeries> {
 const fixtures = createExampleFixtures();
 const { manifest, simulationData } = fixtures;
 const draftA = fixtures.completeDraft;
 const draftB: Draft = { ...draftA, homeStadium: manifest.stadiums[1].ref };
 const selected = new Set(draftA.picks.map(pick => pick.seasonId));
 const hitters = new Set(draftA.picks.filter(pick => HITTER_SLOTS.includes(pick.slot as HitterSlot)).map(pick => pick.seasonId));
 const profilesA = fixtures.profiles.filter(profile => selected.has(profile.seasonId));
 const profilesB = profilesA.map(profile => hitters.has(profile.seasonId) ? weaker(profile) : profile);
 const teams = {
  'team-a': { id: 'team-a' as const, name: NAMES['team-a'], key: JSON.stringify(replayInput(draftA)), season: prepareSeasonInput(draftA, profilesA, simulationData) },
  'team-b': { id: 'team-b' as const, name: NAMES['team-b'], key: JSON.stringify(replayInput(draftB)), season: prepareSeasonInput(draftB, profilesB, simulationData) }
 };
 const result = simulateSeries({ teams: [teams['team-a'], teams['team-b']] });
 const drafts = { 'team-a': draftA, 'team-b': draftB };
 const profiles = { 'team-a': profilesA, 'team-b': profilesB };
 const keys = { 'team-a': await replayKeyDigest(teams['team-a'].key), 'team-b': await replayKeyDigest(teams['team-b'].key) };
 const library = SERIES_TEAM_IDS.map((id, index): LibraryView => ({
  ...libraryEntry(keys[id], new Date(Date.UTC(2026, 3, 12 - index * 5)).toISOString(), drafts[id], simulateSeason(teams[id].season), profiles[id], manifest),
  ...(id === 'team-a' ? { nickname: NAMES['team-a'] } : {}),
  status: 'playable'
 }));
 // The memento outscores both clubs but is the oldest save, so wins and date sorts disagree about it.
 const memento: LibraryView = { ...library[1], key: 'example-retired', savedAt: new Date(Date.UTC(2025, 9, 2)).toISOString(), dataVersion: 'retired-example', record: { wins: 112, losses: 50 }, runs: { scored: 861, allowed: 574 }, nickname: 'Last fall’s club', status: 'retired' };
 const record = await seriesRecord(result, `/h2h${seriesHash({ 'team-a': { link: libraryLink(library[0]), name: NAMES['team-a'] }, 'team-b': { link: libraryLink(library[1]), name: NAMES['team-b'] } })}`, new Date(Date.UTC(2026, 3, 13)).toISOString());
 return {
  result, manifest, profiles, drafts,
  library: [...library, memento],
  libraryProfiles: new Map([[keys['team-a'], profilesA], [keys['team-b'], profilesB]]),
  history: [record]
 };
}

/** Lower on-base and power so the rival's record differs without changing the roster's identity. */
function weaker(profile: Profile): Profile {
 return {
  ...profile,
  battingRates: [0.075, 0.01, 0.23, 0.145, 0.042, 0.004, 0.024, 0.47],
  contact: profile.contact ? { ...profile.contact, batting: [0.145 / 0.685, 0.042 / 0.685, 0.004 / 0.685, 0.024 / 0.685, 0.47 / 0.685] } : profile.contact
 };
}
