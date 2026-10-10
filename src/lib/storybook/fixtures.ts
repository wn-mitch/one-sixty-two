import { commitPick, createDraft, legalSlots, rollDraft, selectHomeStadium } from '../game/draft.ts';
import { syntheticStadiumSummaries } from '../sim/fixtures.ts';
import { HITTER_SLOTS, POSITIONS, SLOTS, type Candidate, type Draft, type HitterSlot, type Manifest, type Position, type Profile, type SimulationData, type Slot } from '../game/types.ts';
import type { WarSeasonRanking, WarRankings } from '../rankings/types.ts';
import { neutralDefensivePosition } from '../sim/defense.ts';
import { testSeason } from '../sim/test-fixtures.ts';

export interface ExampleFixtures {
 manifest: Manifest;
 profiles: Profile[];
 rankings: WarRankings;
 initialDraft: Draft;
 choosingDraft: Draft;
 partialDraft: Draft;
 completeDraft: Draft;
 simulationData: SimulationData;
}

const SEED = 162;
const F2 = 'F2';
const F2_DECADE = 2020;

type RosterProfile = { profile: Profile; slot: Slot };

export type ExampleCardRole = 'hitter' | 'starter' | 'closer' | 'bullpen';
export type ExampleCardFinish = 'base' | 'foil' | 'emboss' | 'gem';

const FINISH_WAR: Record<Exclude<ExampleCardRole, 'bullpen'>, Record<ExampleCardFinish, number>> = {
 hitter: { base: 0, foil: 2, emboss: 4, gem: 6 },
 starter: { base: 0, foil: 2, emboss: 4, gem: 6 },
 closer: { base: 0, foil: 0.5, emboss: 1.5, gem: 2.5 }
};

/** Produces the ranking input that selects a card material through real card logic. */
export function getExampleFinishRanking(role: ExampleCardRole, finish: ExampleCardFinish): WarSeasonRanking {
 if (role === 'bullpen') return { battingWAR162: null, pitchingWAR162: null };
 const value = FINISH_WAR[role][finish];
 return role === 'hitter'
  ? { battingWAR162: value, pitchingWAR162: null }
  : { battingWAR162: null, pitchingWAR162: value };
}

function cloneProfile(profile: Profile): Profile {
 return {
  ...profile,
  eligibleSlots: [...profile.eligibleSlots],
  appearances: { ...profile.appearances },
  batting: profile.batting && { ...profile.batting },
  pitching: profile.pitching && { ...profile.pitching },
  battingRates: profile.battingRates && [...profile.battingRates] as Profile['battingRates'],
  pitchingRates: profile.pitchingRates && [...profile.pitchingRates] as Profile['pitchingRates'],
  fielding: Object.fromEntries(Object.entries(profile.fielding).map(([position, values]) => [position, { ...values }])) as Profile['fielding'],
  defense: {
   positions: Object.fromEntries(Object.entries(profile.defense.positions).map(([position, value]) => [
    position,
    { ...value, evidence: { ...value.evidence } }
   ])) as Profile['defense']['positions']
  },
  estimatedFields: [...profile.estimatedFields],
  bullpen: profile.bullpen && {
   members: profile.bullpen.members.map(member => ({ ...member })),
   excluded: { ...profile.bullpen.excluded }
  }
 };
}

function fixtureName(index: number, slot: Slot): string {
 if (slot === 'BP') return 'Example Club bullpen';
 if (slot === 'CL' || slot.startsWith('SP')) return `Example Pitcher ${String(index + 1).padStart(2, '0')}`;
 return `Example Batter ${String(index + 1).padStart(2, '0')}`;
}

function withOutfieldFlexibility(profile: Profile, slot: Slot): Profile {
 if (slot !== 'LF' && slot !== 'CF' && slot !== 'RF') return profile;
 const eligibleSlots: HitterSlot[] = ['LF', 'CF', 'RF', 'DH'];
 return {
  ...profile,
  eligibleSlots,
  appearances: { LF: 96, CF: 88, RF: 92, DH: 14 },
  defense: {
   positions: Object.fromEntries(
    POSITIONS.filter(position => eligibleSlots.includes(position)).map(position => [position, neutralDefensivePosition(position)])
   )
  }
 };
}

function canonicalProfiles(): { roster: RosterProfile[]; simulationData: SimulationData } {
 const season = testSeason(SEED);
 const roster = season.roster.map(({ profile, slot }, index) => {
  let fixture = cloneProfile(profile);
  fixture.displayName = fixtureName(index, slot);
  fixture.historicalTeam = `Example Club ${fixture.franchiseId}`;
  fixture = withOutfieldFlexibility(fixture, slot);
  if (slot === 'BP') {
   fixture = {
    ...fixture,
    bullpen: {
     members: [
      { seasonId: 'example-bullpen-member-01:2025:AL:T', playerId: 'example-bullpen-member-01', displayName: 'Example Relief Member 01' },
      { seasonId: 'example-bullpen-member-02:2025:AL:T', playerId: 'example-bullpen-member-02', displayName: 'Example Relief Member 02' }
     ],
     excluded: { seasonId: 'example-bullpen-excluded:2025:AL:T', playerId: 'example-bullpen-excluded', displayName: 'Example Relief Exclusion' }
    }
   };
  }
  return { profile: fixture, slot };
 });
 return { roster, simulationData: season.data };
}

function candidateFor(profile: Profile, decade = Math.floor(profile.year / 10) * 10): Candidate {
 return {
  seasonId: profile.seasonId,
  playerId: profile.playerId,
  franchiseId: profile.franchiseId,
  decade,
  eligibleSlots: [...profile.eligibleSlots]
 };
}

function f2Candidates(canonical: Profile): Profile[] {
 const alternate = {
  ...cloneProfile(canonical),
  seasonId: `${canonical.playerId}:2024:AL:T2`,
  year: 2024,
  historicalTeam: 'Example Club F2 alternate season'
 };
 const candidates = Array.from({ length: 24 }, (_, index): Profile => {
  const number = String(index + 1).padStart(2, '0');
  const year = index % 2 === 0 ? 2024 : 2025;
  const eligibleSlots: HitterSlot[] = index % 2 === 0 ? ['2B'] : ['2B', 'CF'];
  const defense = Object.fromEntries(
   eligibleSlots.filter((slot): slot is Position => slot !== 'DH').map(slot => [slot, neutralDefensivePosition(slot)])
  );
  return {
   ...cloneProfile(canonical),
   seasonId: `candidate-${number}:${year}:AL:T2`,
   playerId: `candidate-${number}`,
   displayName: `Example Candidate ${number}`,
   year,
   historicalTeam: 'Example Club F2',
   eligibleSlots,
   primaryHitterSlot: '2B',
   appearances: eligibleSlots.includes('CF') ? { '2B': 76, CF: 43 } : { '2B': 118 },
   defense: { positions: defense }
  };
 });
 return [alternate, ...candidates];
}

function buildManifest(profiles: Profile[], candidates: Candidate[], dataVersion: string): Manifest {
 const franchises = [...new Set(candidates.map(candidate => candidate.franchiseId))].sort().map(id => ({
  id,
  name: `Example Club ${id}`,
  decades: [...new Set(candidates.filter(candidate => candidate.franchiseId === id).map(candidate => candidate.decade))].sort((a, b) => a - b)
 }));
 const coverage = [...new Set(profiles.map(profile => Math.floor(profile.year / 10) * 10))]
  .sort((a, b) => a - b)
  .map(decade => {
   const years = profiles.filter(profile => Math.floor(profile.year / 10) * 10 === decade).map(profile => profile.year);
   return { decade, firstYear: Math.min(...years), lastYear: Math.max(...years), label: `${decade}s` };
  });
 return {
  schemaVersion: 1,
  dataVersion,
  sourceCommit: 'storybook-synthetic',
  candidates,
  franchises,
  chunks: {},
  stadiums: syntheticStadiumSummaries(franchises.map(franchise => franchise.id)),
  simulationUrl: '',
  attributionUrl: '',
  showcaseUrl: '',
  archiveUrl: '',
  approximations: [],
  coverage,
  diagnostics: { excludedBatting: 0, excludedPitching: 0, excludedProfiles: 0, estimatedProfiles: 0, reportUrl: '' },
  attribution: {
   title: 'Synthetic Storybook examples',
   credit: 'Illustrative fixture data',
   sourceUrl: 'https://example.invalid/storybook-fixtures',
   license: 'CC0-1.0',
   licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
   sourceCommit: 'storybook-synthetic',
   changes: 'Synthetic workshop-only examples.',
   fullNotice: 'These examples are fictional and contain no historical athlete data.'
  }
 };
}

function canonicalForRoll(draft: Draft, roster: RosterProfile[]): RosterProfile {
 const roll = draft.currentRoll;
 if (!roll) throw new Error('Example fixture draft has no pending roll');
 const selected = roster.find(({ profile }) => profile.franchiseId === roll.franchiseId && Math.floor(profile.year / 10) * 10 === roll.decade);
 if (!selected) throw new Error(`Example fixture has no canonical profile for ${roll.franchiseId}/${roll.decade}`);
 return selected;
}

function draftStates(manifest: Manifest, roster: RosterProfile[]): Pick<ExampleFixtures, 'initialDraft' | 'choosingDraft' | 'partialDraft' | 'completeDraft'> {
 const initialDraft = selectHomeStadium(createDraft(manifest, SEED), manifest, manifest.stadiums[0].ref.id);
 let draft = rollDraft(initialDraft, manifest);
 const choosingDraft = draft;
 let partialDraft: Draft | null = null;
 while (draft.picks.length < SLOTS.length) {
  const selected = canonicalForRoll(draft, roster);
  const candidate = manifest.candidates.find(item => item.seasonId === selected.profile.seasonId);
  if (!candidate) throw new Error(`Missing canonical fixture candidate ${selected.profile.seasonId}`);
  const slot = selected.slot;
  if (!legalSlots(draft, candidate, manifest).includes(slot)) {
   throw new Error(`Canonical fixture slot ${slot} is not legal`);
  }
  draft = commitPick(draft, manifest, candidate.seasonId, slot);
  if (draft.picks.length === 6) partialDraft = draft;
  if (draft.picks.length < SLOTS.length) draft = rollDraft(draft, manifest);
 }
 if (!partialDraft) throw new Error('Example fixture did not build a six-pick draft');
 return { initialDraft, choosingDraft, partialDraft, completeDraft: draft };
}

function rankingsFor(profiles: Profile[], dataVersion: string): WarRankings {
 const seasons = Object.fromEntries(profiles.map((profile, index) => {
  const hitter = profile.eligibleSlots.some(slot => HITTER_SLOTS.includes(slot as typeof HITTER_SLOTS[number]));
  const pitcher = profile.eligibleSlots.some(slot => slot.startsWith('SP') || slot === 'CL');
  return [profile.seasonId, {
   battingWAR162: hitter ? Number(((index % 7) + 0.5).toFixed(1)) : null,
   pitchingWAR162: pitcher ? Number(((index % 5) * 1.25).toFixed(2)) : null
  }];
 }));
 return {
  schemaVersion: 1,
  dataVersion,
  rankingVersion: 'storybook-synthetic-war',
  source: {
   name: 'Synthetic Storybook rankings',
   url: 'https://example.invalid/storybook-rankings',
   licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
   licenceText: 'CC0 1.0 synthetic fixture data',
   commit: 'storybook-synthetic',
   description: 'Illustrative WAR values for Storybook ordering and card finishes.'
  },
  seasons,
  coverage: {
   candidates: profiles.length,
   batting: profiles.filter(profile => profile.eligibleSlots.some(slot => HITTER_SLOTS.includes(slot as typeof HITTER_SLOTS[number]))).length,
   pitching: profiles.filter(profile => profile.eligibleSlots.some(slot => slot.startsWith('SP') || slot === 'CL')).length,
   missing: 0
  }
 };
}

/** Returns independent, mutable synthetic data for each Storybook story instance. */
export function createExampleFixtures(): ExampleFixtures {
 const { roster, simulationData } = canonicalProfiles();
 const canonical = roster.map(item => item.profile);
 const f2Canonical = roster.find(item => item.profile.franchiseId === F2)?.profile;
 if (!f2Canonical) throw new Error('Example fixture is missing canonical F2 profile');
 const extraProfiles = f2Candidates(f2Canonical);
 const profiles = [...canonical, ...extraProfiles];
 const candidates = profiles.map(profile => candidateFor(profile));
 const manifest = buildManifest(profiles, candidates, simulationData.dataVersion);
 const states = draftStates(manifest, roster);
 if (states.choosingDraft.currentRoll?.franchiseId !== F2 || states.choosingDraft.currentRoll.decade !== F2_DECADE) {
  throw new Error('Example fixture seed no longer rolls F2/2020 first');
 }
 return { manifest, profiles, rankings: rankingsFor(profiles, simulationData.dataVersion), simulationData, ...states };
}
