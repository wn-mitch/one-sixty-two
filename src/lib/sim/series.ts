import { compareId } from '../game/types.ts';
import { gameRandomStreams, streamSeed } from '../game/random.ts';
import { buildMatchupInputs } from './contact-profile.ts';
import { simulateGame } from './game.ts';
import { simulateSeason } from './season.ts';
import {
 MVP_VERSION,
 SERIES_DAYS,
 SERIES_HOME_SEEDS,
 SERIES_RULES_VERSION,
 SERIES_SEED_POLICY,
 SUPERLATIVE_KINDS,
 SUPERLATIVE_MIN_RUNS,
 SUPERLATIVES_VERSION,
 type SeriesAward,
 type SeriesSuperlative,
 type SeriesSuperlativeKind,
 type SeriesGame,
 type SeriesInput,
 type SeriesMoment,
 type SeriesProgress,
 type SeriesResult,
 type SeriesTeamId,
 type SeriesTeamResult
} from './series-types.ts';
import { accumulateBox, createDraftTeam, createTotalsBox } from './team.ts';
import type { SeasonMoment, TeamBox, WinPoint } from './types.ts';
import { resolveStadium, validateSeason, validateTeam } from './validation.ts';
import { closerBudget, closerReady, recordCloser, type CloserUsage } from './workload.ts';
import { WinExpectancyModel } from './win-expectancy.ts';

const WINS_NEEDED = 3;

/** Order-independent series seed from the two canonical replay keys. */
export function seriesSeed(keyA: string, keyB: string): number {
 const [low, high] = [keyA, keyB].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
 return streamSeed(0, `h2h-v1:${low}\0${high}`);
}

/** Seed 1 has more regular-season wins; ties go to the smaller canonical key, then Team A. */
export function seedOrder(records: readonly { id: SeriesTeamId; key: string; wins: number }[]): [SeriesTeamId, SeriesTeamId] {
 const [a, b] = records;
 if (a.wins !== b.wins) return a.wins > b.wins ? [a.id, b.id] : [b.id, a.id];
 if (a.key !== b.key) return a.key < b.key ? [a.id, b.id] : [b.id, a.id];
 return a.id === 'team-a' ? [a.id, b.id] : [b.id, a.id];
}

interface AwardCandidate extends SeriesAward { key: string; batted: boolean; fielded: boolean; pitched: boolean }

/** Every individual with recorded participation, excluding the composite support bullpen. */
function awardCandidates(boxes: readonly { teamId: SeriesTeamId; key: string; box: TeamBox }[]): AwardCandidate[] {
 const merged = new Map<string, AwardCandidate>();
 const entry = (teamId: SeriesTeamId, key: string, seasonId: string, displayName: string) => {
  const id = `${teamId}\0${seasonId}`;
  let value = merged.get(id);
  if (!value) {
   value = { teamId, key, seasonId, displayName, runs: 0, batting: 0, running: 0, defense: 0, pitching: 0, batted: false, fielded: false, pitched: false };
   merged.set(id, value);
  }
  return value;
 };
 for (const { teamId, key, box } of boxes) {
  for (const line of box.batting) {
   if (line.PA <= 0 && line.fieldingOuts <= 0) continue;
   const value = entry(teamId, key, line.seasonId, line.displayName);
   value.batted ||= line.PA > 0;
   value.fielded ||= line.fieldingOuts > 0;
   value.batting += line.battingRuns;
   value.running += line.stealRuns;
   value.defense += line.defensiveRuns;
  }
  for (const line of box.pitching) {
   if (line.role === 'support' || (line.BF <= 0 && line.outs <= 0)) continue;
   const value = entry(teamId, key, line.seasonId, line.displayName);
   value.pitched = true;
   value.pitching += line.pitchingRunsAboveNeutral;
  }
 }
 for (const value of merged.values()) value.runs = value.batting + value.running + value.defense + value.pitching;
 return [...merged.values()];
}

/** The best candidate by `value` (highest, or lowest when `lowest`); ties use the canonical replay key, season id, then team id. */
function rankAward(candidates: readonly AwardCandidate[], value: (candidate: AwardCandidate) => number, lowest = false): SeriesAward | null {
 const direction = lowest ? -1 : 1;
 const ranked = [...candidates].sort((a, b) =>
  direction * (value(b) - value(a)) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || compareId(a.seasonId, b.seasonId) || compareId(a.teamId, b.teamId));
 if (!ranked.length) return null;
 const { key: _key, batted: _batted, fielded: _fielded, pitched: _pitched, ...award } = ranked[0];
 return award;
}

/** Highest unrounded run value; ties use the canonical replay key, season id, then team id. */
export function selectMvp(boxes: readonly { teamId: SeriesTeamId; key: string; box: TeamBox }[]): SeriesAward | null {
 return rankAward(awardCandidates(boxes), candidate => candidate.runs);
}

/** Top bat, Ace, Glove, Wheels, and LVP over the given boxes; see `SeriesResult.superlatives`. */
export function selectSuperlatives(boxes: readonly { teamId: SeriesTeamId; key: string; box: TeamBox }[]): SeriesSuperlative[] {
 const candidates = awardCandidates(boxes);
 const awards: Record<SeriesSuperlativeKind, SeriesAward | null> = {
  'top-bat': rankAward(candidates.filter(candidate => candidate.batted), candidate => candidate.batting),
  ace: rankAward(candidates.filter(candidate => candidate.pitched), candidate => candidate.pitching),
  glove: rankAward(candidates.filter(candidate => candidate.fielded), candidate => candidate.defense),
  wheels: rankAward(candidates.filter(candidate => candidate.batted), candidate => candidate.running),
  lvp: rankAward(candidates, candidate => candidate.runs, true)
 };
 if (awards.glove && awards.glove.defense < SUPERLATIVE_MIN_RUNS) awards.glove = null;
 if (awards.wheels && awards.wheels.running < SUPERLATIVE_MIN_RUNS) awards.wheels = null;
 return SUPERLATIVE_KINDS.flatMap(kind => awards[kind] ? [{ kind, award: awards[kind] }] : []);
}

function seriesMoment(moment: SeasonMoment | null): SeriesMoment | null {
 if (!moment) return null;
 return { ...moment, perspectiveTeamId: 'team-a', battingTeamId: moment.challengeBatting ? 'team-a' : 'team-b', pitchingTeamId: moment.challengeBatting ? 'team-b' : 'team-a' };
}

function totalsAward(totals: Record<SeriesTeamId, TeamBox>, keys: Record<SeriesTeamId, string>): SeriesAward | null {
 return selectMvp((['team-a', 'team-b'] as const).map(teamId => ({ teamId, key: keys[teamId], box: totals[teamId] })));
}

/**
 * Recomputes both regular seasons for seeding, then plays a best-of-five with the higher seed
 * at home in games 1, 2 and 5. Team A is the stable win-expectancy perspective.
 */
export function simulateSeries(input: SeriesInput, onProgress?: (progress: SeriesProgress) => void): SeriesResult {
 const [first, second] = input.teams;
 if (first.id !== 'team-a' || second.id !== 'team-b') throw new Error('Series teams must be Team A then Team B');
 for (const team of input.teams) validateSeason(team.season);
 const data = first.season.data;
 if (second.season.data.dataVersion !== data.dataVersion || second.season.modelVersion !== first.season.modelVersion ||
  second.season.rulesVersion !== first.season.rulesVersion || second.season.schemaVersion !== first.season.schemaVersion) {
  throw new Error('Both replays must use the same game version');
 }
 const records = input.teams.map(team => {
  const season = simulateSeason(team.season, game => onProgress?.({ stage: 'regular-season', teamId: team.id, completed: game.number }));
  return { id: team.id, key: team.key, wins: season.wins, losses: season.losses };
 });
 const [seedOne, seedTwo] = seedOrder(records);
 const byId = <T>(values: readonly T[]) => ({ 'team-a': values[0], 'team-b': values[1] }) as Record<SeriesTeamId, T>;
 const teams = byId(input.teams);
 const clubs = byId(input.teams.map(team => createDraftTeam(team.season, team.id, team.name)));
 for (const club of Object.values(clubs)) validateTeam(club);
 const stadiums = byId(input.teams.map(team => resolveStadium(data, team.season.homeStadium)));
 const batting = {
  'team-a': buildMatchupInputs(clubs['team-a'].hitters, clubs['team-b'].pitchers, data.leagueRates, data.contactModel),
  'team-b': buildMatchupInputs(clubs['team-b'].hitters, clubs['team-a'].pitchers, data.leagueRates, data.contactModel)
 };
 const caps = byId(input.teams.map(team => closerBudget(clubs[team.id].pitchers[clubs[team.id].closerIndex])));
 const usage: Record<SeriesTeamId, CloserUsage> = { 'team-a': { outs: 0, last: -1, previous: -1 }, 'team-b': { outs: 0, last: -1, previous: -1 } };
 const totals = byId(input.teams.map(team => createTotalsBox(clubs[team.id])));
 const keys = byId(input.teams.map(team => team.key));
 const seed = seriesSeed(first.key, second.key);
 const winExpectancy = new WinExpectancyModel(data);
 const score: Record<SeriesTeamId, number> = { 'team-a': 0, 'team-b': 0 };
 const games: SeriesGame[] = [];
 let highlight: SeriesMoment | null = null;
 let lowlight: SeriesMoment | null = null;
 for (let index = 0; index < SERIES_HOME_SEEDS.length && score['team-a'] < WINS_NEEDED && score['team-b'] < WINS_NEEDED; index++) {
  const number = index + 1;
  const day = SERIES_DAYS[index];
  const homeId = SERIES_HOME_SEEDS[index] === 1 ? seedOne : seedTwo;
  const awayId: SeriesTeamId = homeId === 'team-a' ? 'team-b' : 'team-a';
  for (const id of ['team-a', 'team-b'] as const) {
   const club = clubs[id];
   club.starterIndex = index % 3;
   club.closerOutsRemaining = caps[id] - usage[id].outs;
   club.closerAvailable = closerReady(usage[id], day, caps[id]);
  }
  const winTrace: WinPoint[] = [];
  const game = simulateGame({
   number, opponentId: 'team-b', opponentName: teams['team-b'].name, challengeIsHome: homeId === 'team-a',
   home: clubs[homeId], away: clubs[awayId], defenseEnvironment: data, stadium: stadiums[homeId],
   homeMatchups: batting[homeId], awayMatchups: batting[awayId]
  }, gameRandomStreams(seed, number), winExpectancy, winTrace);
  const boxes = { [homeId]: game.home, [awayId]: game.away } as Record<SeriesTeamId, TeamBox>;
  for (const id of ['team-a', 'team-b'] as const) {
   const closer = boxes[id].pitching[clubs[id].closerIndex];
   recordCloser(usage[id], day, closer.outs, closer.appearances > 0);
   accumulateBox(totals[id], boxes[id]);
  }
  const winnerId: SeriesTeamId = game.win ? 'team-a' : 'team-b';
  score[winnerId]++;
  const gameHighlight = seriesMoment(game.highlight);
  const gameLowlight = seriesMoment(game.lowlight);
  if (gameHighlight && (!highlight || gameHighlight.swing > highlight.swing)) highlight = gameHighlight;
  if (gameLowlight && (!lowlight || gameLowlight.swing < lowlight.swing)) lowlight = gameLowlight;
  games.push({
   number, day, homeTeamId: homeId, awayTeamId: awayId, winnerId, stadium: game.stadium, stadiumName: game.stadiumName,
   score: { ...score }, result: game,
   mvp: selectMvp((['team-a', 'team-b'] as const).map(teamId => ({ teamId, key: keys[teamId], box: boxes[teamId] }))),
   highlight: gameHighlight, lowlight: gameLowlight, winTrace
  });
  onProgress?.({ stage: 'series', completed: number });
 }
 const championId: SeriesTeamId = score['team-a'] === WINS_NEEDED ? 'team-a' : 'team-b';
 if (score[championId] !== WINS_NEEDED) throw new Error('Series ended without a champion');
 const teamResult = (id: SeriesTeamId): SeriesTeamResult => {
  const record = records.find(item => item.id === id)!;
  return {
   id, name: teams[id].name, key: keys[id], record: { wins: record.wins, losses: record.losses }, seed: id === seedOne ? 1 : 2,
   homeStadium: { id: stadiums[id].id, version: stadiums[id].version }, homeStadiumName: stadiums[id].name, totals: totals[id]
  };
 };
 return {
  seriesRulesVersion: SERIES_RULES_VERSION, seedPolicy: SERIES_SEED_POLICY, mvpVersion: MVP_VERSION, superlativesVersion: SUPERLATIVES_VERSION,
  dataVersion: data.dataVersion, seed, teams: [teamResult('team-a'), teamResult('team-b')], games, championId, score: { ...score },
  mvp: totalsAward(totals, keys),
  superlatives: selectSuperlatives((['team-a', 'team-b'] as const).map(teamId => ({ teamId, key: keys[teamId], box: totals[teamId] }))),
  highlight, lowlight
 };
}
