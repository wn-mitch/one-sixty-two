import { createHash } from 'node:crypto';
import { compareId, MAX_SEASON_YEAR, MIN_SEASON_YEAR, POSITIONS, SLOTS, type Attribution, type Manifest, type Profile, type SimulationData } from '../../src/lib/game/types.ts';
import { numberField, type Tables } from './counts.ts';
import { buildBullpenCandidates } from './bullpens.ts';
import { leagueFielding } from './fielding.ts';
import { buildOpponents } from './opponents.ts';
import { compileProfiles } from './profiles.ts';

export const APPROXIMATIONS = [
 'Historical rates use a 100-opportunity source-league prior and a common 2025 batting environment.',
 'Three-year batting and pitching park factors are coarse run-park proxies, not event-specific measurements.',
 'Pitcher allowed doubles and triples are inferred from source-league non-home-run hit proportions.',
 'Platoon, extra-base advancement, double-play, tag-up and stolen-base effects are generic model assumptions.',
 'Fielding represents reliability only, not range; missing exact outfield evidence uses generic OF then league reliability.',
 'Missing optional handedness, fielding, catcher and baserunning evidence is explicitly labelled; unavailable historical catcher priors use pooled 2025 evidence.',
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

export function compileData(tables: Tables, attribution: Attribution, sourceCommit: string): Compilation {
 const compiled = compileProfiles(tables);
 compiled.candidates.push(...buildBullpenCandidates(compiled));
 const candidates = compiled.candidates;
 const { opponents, bullpen } = buildOpponents(compiled);
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
 const simulationBase = { schemaVersion: 1 as const, leagueRates: compiled.baselines.target, bullpen, opponents, observedRuns: runs / games, leagueErrorRates: targetFielding.errors, leagueStealAttempt: Math.min(0.25, (sb + cs) / Math.max(1, onBase)), leagueStealSuccess: sb / Math.max(1, sb + cs), leagueCatcherCS: targetFielding.catcherCS, leagueDoublePlay: nonStrikeoutOuts > 0 ? Math.min(0.4, 4 * gidp / nonStrikeoutOuts) : 0 };
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
 const diagnostics = { ...diagnosticCounts, messages: compiled.diagnostics };
 const payload = { schemaVersion: 1, sourceCommit, chunks, simulation: simulationBase, franchises, coverage, attribution, approximations: APPROXIMATIONS, diagnostics };
 const dataVersion = createHash('sha256').update(canonicalJSON(payload)).digest('hex');
 const prefix = `/data/${dataVersion}`;
 const manifest: Manifest = {
  schemaVersion: 1, dataVersion, sourceCommit, franchises, coverage,
  candidates: candidates.map(profile => ({ seasonId: profile.seasonId, playerId: profile.playerId, franchiseId: profile.franchiseId, decade: Math.floor(profile.year / 10) * 10, eligibleSlots: profile.eligibleSlots })),
  chunks: Object.fromEntries(Object.keys(chunks).sort(compareId).map(key => [key, `${prefix}/${key}.json`])),
  simulationUrl: `${prefix}/simulation.json`, attributionUrl: `${prefix}/attribution.json`, archiveUrl: `${prefix}/transformed-data.tar.gz`, attribution, approximations: APPROXIMATIONS,
  diagnostics: { ...diagnosticCounts, reportUrl: `${prefix}/diagnostics.json` }
 };
 const simulation: SimulationData = { ...simulationBase, dataVersion };
 const files: Record<string, unknown> = { 'manifest.json': manifest, 'simulation.json': simulation, 'attribution.json': attribution, 'diagnostics.json': diagnostics };
 for (const [key, profiles] of Object.entries(chunks)) files[`${key}.json`] = profiles;
 return { manifest, files, payload, diagnostics: compiled.diagnostics };
}

function validateCompiled(candidates: Profile[], simulation: Omit<SimulationData, 'dataVersion'>): void {
 if (simulation.opponents.length !== 30 || new Set(simulation.opponents.map(team => team.id)).size !== 30) throw new Error('Expected thirty opponents');
 if (new Set(candidates.map(profile => profile.seasonId)).size !== candidates.length) throw new Error('Duplicate season identity');
 for (const slot of SLOTS) if (!candidates.some(profile => profile.eligibleSlots.includes(slot))) throw new Error(`Unfillable global slot: ${slot}`);
 const all = [...candidates, simulation.bullpen, ...simulation.opponents.flatMap(team => [...team.hitters, ...team.starters, team.closer, team.bullpen])];
 for (const profile of all) {
  if (profile.year < MIN_SEASON_YEAR || profile.year > MAX_SEASON_YEAR || !['AL', 'NL'].includes(profile.league)) throw new Error(`Out-of-era profile: ${profile.seasonId}`);
  for (const rates of [profile.battingRates, profile.pitchingRates]) {
   if (rates && (rates.length !== 8 || rates.some(value => !Number.isFinite(value) || value < 0) || Math.abs(rates.reduce((a, b) => a + b, 0) - 1) > 1e-9)) throw new Error(`Invalid rates: ${profile.seasonId}`);
  }
  for (const position of POSITIONS) if (!Number.isFinite(profile.errorRates[position]) || profile.errorRates[position] < 0 || profile.errorRates[position] > 1) throw new Error(`Invalid fielding probability: ${profile.seasonId}:${position}`);
 }
 for (const profile of candidates) {
  for (const position of POSITIONS) {
   if (profile.eligibleSlots.includes(position) !== Boolean(profile.batting && profile.batting.PA >= 200 && (profile.appearances[position] ?? 0) >= 10)) throw new Error(`Invalid positional eligibility: ${profile.seasonId}:${position}`);
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
 }
}
