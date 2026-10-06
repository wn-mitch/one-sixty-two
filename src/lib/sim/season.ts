import { compareId, POSITIONS, type Draft, type Position, type Profile, type SimulationData } from '../game/types.ts';
import { randomStream, shuffle } from '../game/random.ts';
import { createBox, simulateGame } from './game.ts';
import { buildMatchups } from './matchup.ts';
import type { BatterLine, GameResult, PitcherLine, ScheduleGame, SeasonInput, SeasonResult, TeamInput } from './types.ts';
import { validateDraftVersion, validateSeason, validateTeam } from './validation.ts';
import { closerBudget, closerReady, recordCloser, type CloserUsage } from './workload.ts';
import { WinExpectancyModel } from './win-expectancy.ts';

export function buildSchedule(seed: number, opponentIds: string[]): ScheduleGame[] {
 if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || opponentIds.length !== 30 || new Set(opponentIds).size !== 30 || opponentIds.some(id => !id)) throw new Error('Schedule requires a valid seed and thirty distinct opponents');
 const random = randomStream(seed, 'schedule');
 const ids = [...opponentIds].sort(compareId);
 const opponents = ids.flatMap(id => Array<string>(5).fill(id));
 opponents.push(...shuffle([...ids], random).slice(0, 12));
 return shuffle(opponents, random).map((opponentId, index) => ({ opponentId, isHome: index % 2 === 0 }));
}

export function prepareSeasonInput(draft: Draft, profiles: Profile[], data: SimulationData): SeasonInput {
 validateDraftVersion(draft, data.dataVersion);
 const byId = new Map(profiles.map(profile => [profile.seasonId, profile]));
 if (byId.size !== profiles.length) throw new Error('Duplicate season profiles');
 const roster = draft.picks.map(pick => {
  const profile = byId.get(pick.seasonId);
  if (!profile || pick.franchiseId !== profile.franchiseId || pick.decade !== Math.floor(profile.year / 10) * 10) throw new Error('Missing or mismatched draft profile');
  return { profile, slot: pick.slot };
 });
 const input = { schemaVersion: draft.schemaVersion, modelVersion: draft.modelVersion, seed: draft.seed, roster, battingOrder: [...draft.battingOrder], starterOrder: [...draft.starterOrder], data };
 validateSeason(input);
 return input;
}

function challengeTeam(input: SeasonInput): TeamInput {
 const profiles = new Map(input.roster.map(pick => [pick.profile.seasonId, pick.profile]));
 const hitters = input.battingOrder.map(id => profiles.get(id)!);
 const defense = {} as Record<Position, number>;
 for (const position of POSITIONS) {
  const pick = input.roster.find(pick => pick.slot === position)!;
  defense[position] = hitters.indexOf(pick.profile);
 }
 const closer = input.roster.find(pick => pick.slot === 'CL')!.profile;
 const support = input.schemaVersion === 3
  ? input.roster.find(pick => pick.slot === 'BP')!.profile
  : input.data.bullpen;
 return { id: 'challenge', name: 'Your team', hitters, defense,
  pitchers: [...input.starterOrder.map(id => profiles.get(id)!), closer, support],
  starterIndex: 0, closerIndex: 3, bullpenIndex: 4, closerAvailable: true, closerOutsRemaining: closerBudget(closer) };
}
const BATTING_STATS = ['PA', 'AB', 'H', 'doubles', 'triples', 'HR', 'BB', 'HBP', 'SO', 'R', 'RBI', 'SB', 'CS', 'SF'] as const;
const PITCHING_STATS = ['outs', 'H', 'BB', 'HBP', 'SO', 'R', 'starts', 'appearances'] as const;
function aggregate(batting: BatterLine[], pitching: PitcherLine[], game: GameResult): void {
 const box = game.isHome ? game.home : game.away;
 for (let index = 0; index < batting.length; index++) for (const stat of BATTING_STATS) batting[index][stat] += box.batting[index][stat];
 for (let index = 0; index < pitching.length; index++) for (const stat of PITCHING_STATS) pitching[index][stat] += box.pitching[index][stat];
}

/** All randomness comes from the simulation stream, independent of the schedule. */
export function simulateSeason(input: SeasonInput, onGame?: (game: GameResult) => void): SeasonResult {
 validateSeason(input);
 const challenge = challengeTeam(input);
 validateTeam(challenge);
 const schedule = buildSchedule(input.seed, input.data.opponents.map(team => team.id));
 const winExpectancy = new WinExpectancyModel(input.data.leagueRates);
 const challengeUsage: CloserUsage = { outs: 0, last: -1, previous: -1 };
 const challengeCap = closerBudget(challenge.pitchers[challenge.closerIndex]);
 const opponents = new Map(input.data.opponents.map(opponent => {
  if (opponent.starters.length !== 5 || !Number.isFinite(opponent.park) || opponent.park <= 0) throw new Error('Invalid opponent rotation or park');
  const defense = {} as Record<Position, number>;
  for (const position of POSITIONS) defense[position] = opponent.hitters.findIndex(profile => profile.eligibleSlots.length === 1 && profile.eligibleSlots[0] === position);
  const cap = closerBudget(opponent.closer);
  const team: TeamInput = { id: opponent.id, name: opponent.name, hitters: opponent.hitters, defense,
   pitchers: [...opponent.starters, opponent.closer, opponent.bullpen], starterIndex: 0, closerIndex: 5, bullpenIndex: 6, closerAvailable: true, closerOutsRemaining: cap };
  validateTeam(team);
  const prepared = { team, cap, park: opponent.park, appearances: 0, usage: { outs: 0, last: -1, previous: -1 },
   challengeNeutral: buildMatchups(challenge.hitters, team.pitchers, input.data.leagueRates, 1),
   opponentNeutral: buildMatchups(team.hitters, challenge.pitchers, input.data.leagueRates, 1),
   challengePark: buildMatchups(challenge.hitters, team.pitchers, input.data.leagueRates, opponent.park),
   opponentPark: buildMatchups(team.hitters, challenge.pitchers, input.data.leagueRates, opponent.park) };
  return [opponent.id, prepared] as const;
 }));
 const totals = createBox(challenge);
 // A fresh box represents one starter appearance; season totals start at zero.
 for (const pitcher of totals.pitching) { pitcher.starts = 0; pitcher.appearances = 0; }
 const result: SeasonResult = { modelVersion: input.modelVersion, dataVersion: input.data.dataVersion, seed: input.seed,
  wins: 0, losses: 0, firstLoss: null, longestWinningStreak: 0, runsFor: 0, runsAgainst: 0,
  games: [], batting: totals.batting, pitching: totals.pitching, starterStarts: [0, 0, 0], highlight: null, lowlight: null };
 const random = randomStream(input.seed, 'simulation');
 let streak = 0;
 for (let index = 0; index < schedule.length; index++) {
  const scheduled = schedule[index];
  const opponent = opponents.get(scheduled.opponentId)!;
  const number = index + 1;
  challenge.starterIndex = index % 3;
  challenge.closerOutsRemaining = challengeCap - challengeUsage.outs;
  challenge.closerAvailable = closerReady(challengeUsage, number, challengeCap);
  opponent.team.starterIndex = opponent.appearances++ % 5;
  opponent.team.closerOutsRemaining = opponent.cap - opponent.usage.outs;
  opponent.team.closerAvailable = closerReady(opponent.usage, number, opponent.cap);
  const game = simulateGame({ number, opponentId: opponent.team.id, opponentName: opponent.team.name,
   challengeIsHome: scheduled.isHome, home: scheduled.isHome ? challenge : opponent.team, away: scheduled.isHome ? opponent.team : challenge,
   leagueRates: input.data.leagueRates, leagueCatcherCS: input.data.leagueCatcherCS, park: scheduled.isHome ? 1 : opponent.park,
   homeMatchups: scheduled.isHome ? opponent.challengeNeutral : opponent.opponentPark,
   awayMatchups: scheduled.isHome ? opponent.opponentNeutral : opponent.challengePark }, random, winExpectancy);
  const challengeBox = scheduled.isHome ? game.home : game.away;
  const opponentBox = scheduled.isHome ? game.away : game.home;
  const closer = challengeBox.pitching[challenge.closerIndex];
  const opponentCloser = opponentBox.pitching[opponent.team.closerIndex];
  recordCloser(challengeUsage, number, closer.outs, closer.appearances > 0);
  recordCloser(opponent.usage, number, opponentCloser.outs, opponentCloser.appearances > 0);
  result.games.push(game);
  if (game.highlight && (!result.highlight || game.highlight.swing > result.highlight.swing)) result.highlight = game.highlight;
  if (game.lowlight && (!result.lowlight || game.lowlight.swing < result.lowlight.swing)) result.lowlight = game.lowlight;
  result.starterStarts[challenge.starterIndex]++;
  aggregate(result.batting, result.pitching, game);
  result.runsFor += game.challengeRuns;
  result.runsAgainst += game.opponentRuns;
  if (game.win) {
   result.wins++;
   result.longestWinningStreak = Math.max(result.longestWinningStreak, ++streak);
  } else {
   result.losses++;
   result.firstLoss ??= number;
   streak = 0;
  }
  onGame?.(game);
 }
 return result;
}
