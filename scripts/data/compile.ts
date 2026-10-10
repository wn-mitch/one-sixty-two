import { createHash } from 'node:crypto';
import { compareId, DEFENSE_METHOD_VERSION, HITTER_SLOTS, MAX_SEASON_YEAR, MIN_SEASON_YEAR, POSITIONS, SLOTS, VALUATION_VERSION, type Attribution, type DefensiveEnvironment, type Manifest, type Profile, type ShowcaseCard, type SimulationData, type Slot } from '../../src/lib/game/types.ts';
import { validateDefensiveEnvironment, validateProfile, validateStadiumDeck } from '../../src/lib/sim/validation.ts';
import { battingSide, contactRecord, contactTargets, fitContact, FIT_TOLERANCE, leagueContactFit, matchup, type ContactModel } from '../../src/lib/sim/contact-profile.ts';
import { stadiumRef } from '../../src/lib/sim/park.ts';
import { compileStadiums, type StadiumCatalog } from './stadiums.ts';
import { finishFor, type Finish, type FinishRole } from '../../src/lib/cards/finish.ts';
import { applyDefense } from './defense.ts';
import { numberField, type Tables } from './counts.ts';
import { buildBullpenCandidates } from './bullpens.ts';
import { leagueFielding } from './fielding.ts';
import { buildOpponents } from './opponents.ts';
import { compileProfiles } from './profiles.ts';
import type { CsvRow } from './acquire.ts';
import { groupJoinedWarRows, sourceRole, sumComplete, type GroupedWarRows } from './source-join.ts';
import {
 RANKINGS_SOURCE_CHECKSUM,
 RANKINGS_LICENSE_URL,
 RANKINGS_README_URL,
 RANKINGS_SOURCE_COMMIT,
 RANKINGS_SOURCE_DESCRIPTION,
 RANKINGS_SOURCE_URL
} from '../rankings/source.ts';

export const APPROXIMATIONS = [
 'Historical rates use a 100-opportunity source-league prior and a common 2025 batting environment.',
 'Three-year batting and pitching park factors neutralize historical rates; they are coarse run-park proxies, not event-specific measurements. Simulated venues act only through ball flight in the 2025 reference stadiums.',
 'Batted balls are drawn from the 2025 Statcast exit-velocity, launch-angle and spray distribution. Each player-season\'s contact mix and power shift are estimated so neutral-park outcomes reproduce its hit rates; they are not measured batted-ball data.',
 'Ball flight uses a declared drag-and-lift approximation fitted to 2025 Statcast distances, with fixed calm air at each venue\'s elevation; weather and roof variation are not modelled.',
 'Stadium walls interpolate Statcast line, gap and center distances and heights; foul territory and wall shapes between measured points are estimated.',
 'Fielders start from fixed positions and use a fitted reach, catch and throw model; defensive skills adjust speed, reaction and arm strength.',
 'Triples are matched only as closely as the physical batted-ball regions allow, and a few slow, doubles-heavy seasons play with their closest contact fit; the compiled diagnostics count them.',
 'Pitcher allowed doubles and triples are inferred from source-league non-home-run hit proportions.',
 'Fielding uses position-specific historical error, double-play, outfield-assist and catcher caught-stealing evidence. Double-play and assist rates are context-affected opportunity proxies.',
 'Aggregate fielding runs are residualized into estimated hit prevention so component effects are not double counted; missing aggregate evidence leaves DEF unavailable without erasing independently supported skills.',
 'Missing optional handedness, fielding components and baserunning evidence is explicitly neutral and labelled.',
 'When source sacrifice flies are unavailable, SF remains an explicitly labelled unavailable zero and PA is a conservative recorded lower bound; no sacrifice-fly count is reconstructed.',
 'Drafted bullpen remainders BFP-weight every relief-dominant pitcher-season after the saves leader; source counts do not split starter and relief appearances.',
 'Three starters each make 54 starts. A workload-limited, rested closer is supported by a bullpen with an unlimited support-pool workload abstraction.',
 'Pitcher simulation reports runs allowed and RA9, not reconstructed official earned runs, wins or saves.',
 'The schedule is a seeded 162-game challenge against all thirty 2025 clubs, not an official club schedule.'
];

/** Object keys are sorted recursively; ordered arrays retain their domain order. */
export function canonicalJSON(value: unknown): string {
 if (Array.isArray(value)) return `[${value.map(item => canonicalJSON(item ?? null)).join(',')}]`;
 if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => compareId(a, b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJSON(item)}`).join(',')}}`;
 if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite compiled data');
 const encoded = JSON.stringify(value);
 if (encoded === undefined) throw new Error('Unsupported compiled value');
 return encoded;
}

export interface Compilation { manifest: Manifest; files: Record<string, unknown>; payload: Record<string, unknown>; diagnostics: string[] }
const DEFENSE_METHOD = {
 version: DEFENSE_METHOD_VERSION,
 cohortMinimums: { inningOuts: 4374, handledChances: 1000, catcherAttempts: 100 },
 smoothing: { rateInningOuts: 2700, errorChances: 300, catcherAttempts: 50 },
 normalization: { rateRelativeScale: 0.5, errorRateScale: 0.02, catcherCaughtStealingScale: 0.2, genericOutfieldStrength: 0.5 },
 bounds: { aggregateRuns: 15, hitProbabilityDelta: 0.04, referenceInnings: 1458 },
 semantics: {
  aggregate: 'fld162 fielding runs above average per 162 team games; pos162 and def162 are excluded.',
  hitPrevention: 'Residual estimated hit prevention after explicit error, double-play, outfield-assist and catcher-throwing effects.',
  doublePlay: 'Double plays per fielding out proxy; context affected, not a true opportunity rate.',
  outfieldThrowing: 'Assists per fielding out proxy; not observed throw-out percentage or throwing velocity.'
 },
 source: {
  name: 'MLB-WAR-data-historical — JEFFBAGWELL',
  url: RANKINGS_SOURCE_URL,
  commit: RANKINGS_SOURCE_COMMIT,
  checksum: RANKINGS_SOURCE_CHECKSUM,
  licenseUrl: RANKINGS_LICENSE_URL,
  readmeUrl: RANKINGS_README_URL,
  description: RANKINGS_SOURCE_DESCRIPTION
 }
} as const;

interface ShowcaseWar {
 battingWAR162: number | null;
 pitchingWAR162: number | null;
}

function showcaseWar(source: GroupedWarRows): Map<string, ShowcaseWar> {
 const values = new Map<string, ShowcaseWar>();
 for (const [seasonId, rows] of source.bySeason) {
  values.set(seasonId, {
   battingWAR162: sumComplete(rows.filter(row => sourceRole(row, 'batting')), 'bwar162'),
   pitchingWAR162: sumComplete(rows.filter(row => sourceRole(row, 'pitching')), 'pwar162')
  });
 }
 return values;
}

type ShowcaseRole = 'hitter' | 'pitcher';
interface ShowcaseOption extends ShowcaseCard {
 role: ShowcaseRole;
 war: number;
}

function showcaseSlot(profile: Profile, role: ShowcaseRole): Slot | null {
 if (role === 'hitter') return profile.primaryHitterSlot;
 if (profile.eligibleSlots.includes('SP1')) return 'SP1';
 return profile.eligibleSlots.includes('CL') ? 'CL' : null;
}

function showcaseOption(profile: Profile, role: ShowcaseRole, value: ShowcaseWar | undefined): ShowcaseOption | null {
 const slot = showcaseSlot(profile, role);
 if (slot === null || (role === 'hitter' && !HITTER_SLOTS.includes(slot as typeof HITTER_SLOTS[number]))) return null;
 const sourceWar = role === 'hitter' ? value?.battingWAR162 : value?.pitchingWAR162;
 return {
  profile,
  slot,
  role,
  war: typeof sourceWar === 'number' && Number.isFinite(sourceWar) ? sourceWar : -Infinity
 };
}

function showcaseFinish(option: ShowcaseOption, value: ShowcaseWar | undefined): Finish {
 const role: FinishRole = option.role === 'hitter' ? 'hitter' : option.slot === 'CL' ? 'closer' : 'starter';
 return finishFor(role, value?.battingWAR162, value?.pitchingWAR162);
}

function compareShowcaseOption(a: ShowcaseOption, b: ShowcaseOption): number {
 return b.war - a.war
  || compareId(a.profile.seasonId, b.profile.seasonId)
  || compareId(a.role, b.role);
}

function buildShowcase(candidates: Profile[], source: GroupedWarRows): ShowcaseCard[] {
 const war = showcaseWar(source);
 const tiers: readonly Finish[] = ['base', 'foil', 'emboss', 'gem'];
 const preferredRoles: readonly ShowcaseRole[] = ['hitter', 'pitcher', 'hitter', 'pitcher'];
 const showcase: ShowcaseCard[] = [];
 const selected = new Set<string>();
 for (let decade = 1950; decade <= 2020; decade += 10) {
  const era = candidates.filter(profile => !profile.bullpen && Math.floor(profile.year / 10) * 10 === decade);
  for (let index = 0; index < tiers.length; index++) {
   const tier = tiers[index]!;
   const preferred = preferredRoles[index]!;
   const other: ShowcaseRole = preferred === 'hitter' ? 'pitcher' : 'hitter';
   const available = era.filter(profile => !selected.has(profile.seasonId));
   const roleOptions = (role: ShowcaseRole) => available.flatMap(profile => {
    const option = showcaseOption(profile, role, war.get(profile.seasonId));
    return option && showcaseFinish(option, war.get(profile.seasonId)) === tier ? [option] : [];
   });
   const preferredOptions = roleOptions(preferred);
   const alternateOptions = preferredOptions.length ? preferredOptions : roleOptions(other);
   const fallbackOptions = alternateOptions.length ? alternateOptions : available.flatMap(profile =>
    (['hitter', 'pitcher'] as const).flatMap(role => {
     const option = showcaseOption(profile, role, war.get(profile.seasonId));
     return option ? [option] : [];
    })
   );
   fallbackOptions.sort(compareShowcaseOption);
   const chosen = fallbackOptions[0];
   if (!chosen) throw new Error(`Unable to select four distinct showcase profiles for the ${decade}s`);
   selected.add(chosen.profile.seasonId);
   showcase.push({ profile: chosen.profile, slot: chosen.slot });
  }
 }
 if (showcase.length !== 32) throw new Error(`Expected 32 showcase profiles, received ${showcase.length}`);
 return showcase;
}

export function buildGallery(chunks: Record<string, Profile[]>): Record<string, ShowcaseCard> {
 const gallery: Record<string, ShowcaseCard> = {};
 for (const key of Object.keys(chunks).sort(compareId)) {
  const profiles = chunks[key]!;
  const profile = [...profiles]
   .sort((a, b) => compareId(a.seasonId, b.seasonId))
   .find(candidate => SLOTS.some(slot => candidate.eligibleSlots.includes(slot)));
  if (!profile) throw new Error(`Unable to select a canonical gallery card for ${key}`);
  const slot = SLOTS.find(value => profile.eligibleSlots.includes(value));
  if (!slot) throw new Error(`Unable to select a canonical gallery slot for ${key}`);
  gallery[key] = { profile, slot };
 }
 return gallery;
}


/** Cited non-Lahman references: the stadium catalog and the league contact model. */
export interface References { stadiums: StadiumCatalog; contactModel: ContactModel }

export function compileData(tables: Tables, attribution: Attribution, sourceCommit: string, warRows: CsvRow[], references: References): Compilation {
 if (!warRows.length) throw new Error('Pinned defensive/WAR source is required for core data compilation.');
 const compiled = compileProfiles(tables);
 const stadiums = compileStadiums(references.stadiums, compiled.currentTeams.map(team => team.franchID));
 const targetFielding = leagueFielding(compiled.fielding, '2025:ALL');
 const currentBatting = [...compiled.baselines.batters.values()].filter(item => item.group.row.yearID === '2025');
 let sb = 0, cs = 0, onBase = 0, gidp = 0, nonStrikeoutOuts = 0;
 for (const { group, counts } of currentBatting) {
  if (!group.missing.has('GIDP')) {
   gidp += counts.GIDP;
   nonStrikeoutOuts += counts.PA - counts.BB - counts.HBP - counts.SO - counts.H;
  }
  if (group.missing.has('SB') || group.missing.has('CS')) continue;
  sb += counts.SB; cs += counts.CS; onBase += counts.H + counts.BB + counts.HBP;
 }
 let runs = 0, games = 0;
 for (const team of compiled.currentTeams) {
  const r = numberField(team, 'R'), g = numberField(team, 'G');
  if (r === undefined || !g) throw new Error(`Missing observed scoring: ${team.franchID}`);
  runs += r; games += g;
 }
 const defenseEnvironment: DefensiveEnvironment = {
  leagueRates: compiled.baselines.target,
  leagueErrorRates: targetFielding.errors,
  leagueStealAttempt: Math.min(0.25, (sb + cs) / Math.max(1, onBase)),
  leagueStealSuccess: sb / Math.max(1, sb + cs),
  leagueDoublePlay: nonStrikeoutOuts > 0 ? Math.min(0.4, 4 * gidp / nonStrikeoutOuts) : 0,
  contactModel: references.contactModel
 };
 const joinedWar = groupJoinedWarRows(warRows, { people: tables.People, teams: tables.Teams });
 const defenseDiagnostics = applyDefense(compiled.profiles, compiled.fielding, joinedWar, defenseEnvironment);
 compiled.candidates.push(...buildBullpenCandidates(compiled));
 const candidates = compiled.candidates;
 const { opponents, bullpen } = buildOpponents(compiled, new Map(stadiums.configs.map(stadium => [stadium.franchiseId, stadiumRef(stadium)])));
 for (const profile of [...candidates, bullpen, ...opponents.flatMap(team => [...team.hitters, ...team.starters, team.closer, team.bullpen])]) {
  if (profile.battingRates || profile.pitchingRates) profile.contact = contactRecord(profile);
 }
 const contactFits = contactFitDiagnostics(candidates, defenseEnvironment);
 const simulationBase = {
  schemaVersion: 1 as const,
  ...defenseEnvironment,
  bullpen,
  opponents,
  stadiums: stadiums.configs,
  observedRuns: runs / games,
  defenseMethodVersion: DEFENSE_METHOD_VERSION,
  valuationVersion: VALUATION_VERSION
 };
 validateCompiled(candidates, simulationBase);
 const chunks: Record<string, Profile[]> = {};
 const decadesByFranchise = new Map<string, Set<number>>();
 const yearRanges = new Map<number, { firstYear: number; lastYear: number }>();
 for (const profile of candidates) {
  const decade = Math.floor(profile.year / 10) * 10;
  const key = `${profile.franchiseId}-${decade}`;
  (chunks[key] ??= []).push(profile);
  const franchiseDecades = decadesByFranchise.get(profile.franchiseId) ?? new Set<number>();
  franchiseDecades.add(decade);
  decadesByFranchise.set(profile.franchiseId, franchiseDecades);
  const range = yearRanges.get(decade);
  if (range) {
   range.firstYear = Math.min(range.firstYear, profile.year);
   range.lastYear = Math.max(range.lastYear, profile.year);
  } else yearRanges.set(decade, { firstYear: profile.year, lastYear: profile.year });
 }
 const franchises = compiled.franchises.map(franchise => ({ ...franchise, decades: [...(decadesByFranchise.get(franchise.id) ?? [])].sort((a, b) => a - b) }));
 const coverage: Manifest['coverage'] = [];
 for (let decade = Math.floor(MIN_SEASON_YEAR / 10) * 10; decade <= Math.floor(MAX_SEASON_YEAR / 10) * 10; decade += 10) {
  const range = yearRanges.get(decade);
  if (!range) throw new Error(`Empty decade: ${decade}`);
  coverage.push({ decade, ...range, label: `${range.firstYear}–${range.lastYear}` });
 }
 const diagnosticCounts = {
  excludedBatting: compiled.diagnostics.filter(message => message.includes(': batting excluded:')).length,
  excludedPitching: compiled.diagnostics.filter(message => message.includes(': pitching excluded:')).length,
  excludedProfiles: compiled.diagnostics.filter(message => message.includes(': profile excluded:')).length,
  estimatedProfiles: candidates.filter(profile => profile.estimatedFields.length > 0).length
 };
 const diagnostics = { ...diagnosticCounts, defense: defenseDiagnostics, contactFits, messages: compiled.diagnostics };
 const showcase = buildShowcase(candidates, joinedWar);
 const gallery = buildGallery(chunks);
 const payload = { schemaVersion: 1, sourceCommit, chunks, gallery, showcase, simulation: simulationBase, franchises, coverage, attribution, defensiveMethod: DEFENSE_METHOD, approximations: APPROXIMATIONS, diagnostics };
 const dataVersion = createHash('sha256').update(canonicalJSON(payload)).digest('hex');
 const prefix = `/data/${dataVersion}`;
 const manifest: Manifest = {
  schemaVersion: 1, dataVersion, sourceCommit, franchises, coverage,
  candidates: candidates.map(profile => ({ seasonId: profile.seasonId, playerId: profile.playerId, franchiseId: profile.franchiseId, decade: Math.floor(profile.year / 10) * 10, eligibleSlots: profile.eligibleSlots })),
  chunks: Object.fromEntries(Object.keys(chunks).sort(compareId).map(key => [key, `${prefix}/${key}.json`])),
  simulationUrl: `${prefix}/simulation.json`, showcaseUrl: `${prefix}/showcase.json`, attributionUrl: `${prefix}/attribution.json`, archiveUrl: `${prefix}/transformed-data.tar.gz`, attribution, approximations: APPROXIMATIONS,
  diagnostics: { ...diagnosticCounts, reportUrl: `${prefix}/diagnostics.json` },
  stadiums: stadiums.summaries
 };
 const simulation: SimulationData = { ...simulationBase, dataVersion };
 const files: Record<string, unknown> = { 'manifest.json': manifest, 'simulation.json': simulation, 'showcase.json': showcase, 'attribution.json': attribution, 'defense-source.json': DEFENSE_METHOD, 'diagnostics.json': diagnostics };
 for (const [key, profiles] of Object.entries(chunks)) files[`${key}.json`] = profiles;
 for (const [key, card] of Object.entries(gallery)) files[`gallery-${key}.json`] = card;
 return { manifest, files, payload, diagnostics: compiled.diagnostics };
}

/**
 * Fits every candidate against a league-average opponent. Fits that cannot reproduce singles,
 * extra-base hits, home runs and outs within FIT_TOLERANCE play with their closest fit; they are
 * counted here rather than silently accepted.
 */
function contactFitDiagnostics(candidates: Profile[], environment: DefensiveEnvironment) {
 const league = environment.leagueRates;
 const prior = leagueContactFit(environment.contactModel, league).regionWeights;
 const average = { seasonId: 'league', bats: '', throws: '', battingRates: league, pitchingRates: league, speed: 0.5 } as unknown as Profile;
 let fits = 0, outsideTolerance = 0, maxError = 0, maxTripleError = 0;
 const examples: string[] = [];
 for (const profile of candidates) {
  const pairs: [Profile, Profile][] = [];
  if (profile.battingRates) pairs.push([profile, average]);
  if (profile.pitchingRates) pairs.push([average, profile]);
  for (const [batter, pitcher] of pairs) {
   const fit = fitContact(environment.contactModel.basis, prior, contactTargets(matchup(batter, pitcher, league)), battingSide(batter, pitcher), batter.speed, profile.seasonId);
   fits++;
   maxError = Math.max(maxError, fit.error);
   maxTripleError = Math.max(maxTripleError, fit.tripleError);
   if (fit.error > FIT_TOLERANCE) {
    outsideTolerance++;
    if (examples.length < 20) examples.push(`${profile.seasonId}:${batter === profile ? 'batting' : 'pitching'}:${fit.error.toFixed(4)}`);
   }
  }
 }
 return { tolerance: FIT_TOLERANCE, fits, outsideTolerance, maxError, maxTripleError, examples };
}

function validateCompiled(candidates: Profile[], simulation: Omit<SimulationData, 'dataVersion'>): void {
 validateDefensiveEnvironment(simulation);
 validateStadiumDeck(simulation);
 if (simulation.opponents.length !== 30 || new Set(simulation.opponents.map(team => team.id)).size !== 30) throw new Error('Expected thirty opponents');
 if (new Set(candidates.map(profile => profile.seasonId)).size !== candidates.length) throw new Error('Duplicate season identity');
 for (const slot of SLOTS) if (!candidates.some(profile => profile.eligibleSlots.includes(slot))) throw new Error(`Unfillable global slot: ${slot}`);
 const all = [...candidates, simulation.bullpen, ...simulation.opponents.flatMap(team => [...team.hitters, ...team.starters, team.closer, team.bullpen])];
 all.forEach(validateProfile);
 for (const profile of all) {
  if (profile.year < MIN_SEASON_YEAR || profile.year > MAX_SEASON_YEAR || !['AL', 'NL'].includes(profile.league)) throw new Error(`Out-of-era profile: ${profile.seasonId}`);
  for (const rates of [profile.battingRates, profile.pitchingRates]) {
   if (rates && (rates.length !== 8 || rates.some(value => !Number.isFinite(value) || value < 0) || Math.abs(rates.reduce((a, b) => a + b, 0) - 1) > 1e-9)) throw new Error(`Invalid rates: ${profile.seasonId}`);
  }
  for (const position of POSITIONS) {
   const defensive = profile.defense.positions[position];
   if (!defensive) continue;
   for (const skill of ['hitPrevention', 'doublePlay', 'outfieldThrowing', 'errorAvoidance', 'catcherThrowing'] as const) {
    if (!Number.isFinite(defensive[skill]) || defensive[skill] < -1 || defensive[skill] > 1) throw new Error(`Invalid defensive skill: ${profile.seasonId}:${position}:${skill}`);
   }
  }
 }
 for (const profile of candidates) {
  for (const position of POSITIONS) {
   if (profile.eligibleSlots.includes(position) !== Boolean(profile.batting && profile.batting.PA >= 200 && (profile.appearances[position] ?? 0) >= 10)) throw new Error(`Invalid positional eligibility: ${profile.seasonId}:${position}`);
   if (profile.eligibleSlots.includes(position) && !profile.defense.positions[position]) throw new Error(`Missing eligible-position defense: ${profile.seasonId}:${position}`);
  }
  const isBullpen = profile.eligibleSlots.includes('BP');
  if (Boolean(profile.bullpen) !== isBullpen) throw new Error(`Invalid bullpen metadata: ${profile.seasonId}`);
  if (!isBullpen) continue;
  const memberIds = new Set(profile.bullpen!.members.map(member => member.seasonId));
  if (
   profile.eligibleSlots.length !== 1
   || profile.seasonId !== `bullpen:${profile.year}:${profile.league}:${profile.teamId}`
   || profile.playerId !== `bullpen:${profile.franchiseId}`
   || !profile.pitching
   || profile.pitching.BFP <= 0
   || !profile.pitchingRates
   || profile.batting
   || memberIds.size !== profile.bullpen!.members.length
   || memberIds.has(profile.bullpen!.excluded.seasonId)
  ) throw new Error(`Invalid bullpen candidate: ${profile.seasonId}`);
 }
 for (const team of simulation.opponents) {
  if (new Set(team.hitters.map(profile => profile.playerId)).size !== 9) throw new Error(`Duplicate opponent athlete: ${team.id}`);
  if (new Set(team.hitters.map(profile => profile.eligibleSlots[0])).size !== 9) throw new Error(`Invalid opponent positions: ${team.id}`);
  for (const hitter of team.hitters) {
   const position = hitter.eligibleSlots[0];
   if (position !== 'DH' && (!POSITIONS.includes(position as typeof POSITIONS[number]) || !hitter.defense.positions[position as typeof POSITIONS[number]])) {
    throw new Error(`Missing opponent defense: ${team.id}:${hitter.seasonId}:${position}`);
   }
  }
 }
}
