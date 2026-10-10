import { compareId, POSITIONS, type Draft, type Opponent, type Position, type Profile, type SimulationData } from '../game/types.ts';
import { gameRandomStreams, randomStream, shuffle } from '../game/random.ts';
import { buildMatchupInputs } from './contact-profile.ts';
import { simulateGame } from './game.ts';
import { accumulateBox, createDraftTeam, createTotalsBox } from './team.ts';
import type { GameResult, ScheduleGame, SeasonInput, SeasonResult, TeamInput } from './types.ts';
import { resolveStadium, validateDraftVersion, validateSeason, validateTeam } from './validation.ts';
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
 const stadium = resolveStadium(data, draft.homeStadium);
 const input: SeasonInput = {
  schemaVersion: draft.schemaVersion, modelVersion: draft.modelVersion, rulesVersion: draft.rulesVersion, seed: draft.seed,
  homeStadium: { id: stadium.id, version: stadium.version },
  roster, battingOrder: [...draft.battingOrder], starterOrder: [...draft.starterOrder], data
 };
 validateSeason(input);
 return input;
}

/** All randomness comes from per-game named streams, independent of the schedule. */
export function simulateSeason(input: SeasonInput, onGame?: (game: GameResult) => void): SeasonResult {
 validateSeason(input);
 const challenge = createDraftTeam(input, 'challenge', 'Your team');
 validateTeam(challenge);
 const data = input.data;
 const homeStadium = resolveStadium(data, input.homeStadium);
 const schedule = buildSchedule(input.seed, data.opponents.map(team => team.id));
 const winExpectancy = new WinExpectancyModel(data);
 const challengeUsage: CloserUsage = { outs: 0, last: -1, previous: -1 };
 const challengeCap = closerBudget(challenge.pitchers[challenge.closerIndex]);
 const opponents = new Map(data.opponents.map(opponent => {
  const team = opponentTeam(opponent);
  validateTeam(team);
  const prepared = { team, cap: closerBudget(opponent.closer), stadium: resolveStadium(data, opponent.homeStadium), appearances: 0, usage: { outs: 0, last: -1, previous: -1 },
   challengeBatting: buildMatchupInputs(challenge.hitters, team.pitchers, data.leagueRates, data.contactModel),
   opponentBatting: buildMatchupInputs(team.hitters, challenge.pitchers, data.leagueRates, data.contactModel) };
  return [opponent.id, prepared] as const;
 }));
 const totals = createTotalsBox(challenge);
 const result: SeasonResult = { modelVersion: input.modelVersion, rulesVersion: input.rulesVersion, dataVersion: data.dataVersion, seed: input.seed,
  homeStadium: input.homeStadium, defenseMethodVersion: data.defenseMethodVersion, valuationVersion: data.valuationVersion,
  wins: 0, losses: 0, firstLoss: null, longestWinningStreak: 0, runsFor: 0, runsAgainst: 0,
  games: [], batting: totals.batting, pitching: totals.pitching, starterStarts: [0, 0, 0], highlight: null, lowlight: null };
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
   defenseEnvironment: data, stadium: scheduled.isHome ? homeStadium : opponent.stadium,
   homeMatchups: scheduled.isHome ? opponent.challengeBatting : opponent.opponentBatting,
   awayMatchups: scheduled.isHome ? opponent.opponentBatting : opponent.challengeBatting }, gameRandomStreams(input.seed, number), winExpectancy);
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
  accumulateBox(totals, challengeBox);
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

/** A fixed 2025 opponent: hitters assigned to their single listed position, five starters, closer, bullpen. */
export function opponentTeam(opponent: Opponent): TeamInput {
 if (opponent.starters.length !== 5) throw new Error('Invalid opponent rotation');
 const defense = {} as Record<Position, number>;
 for (const position of POSITIONS) defense[position] = opponent.hitters.findIndex(profile => profile.eligibleSlots.length === 1 && profile.eligibleSlots[0] === position);
 return { id: opponent.id, name: opponent.name, hitters: opponent.hitters, defense,
  pitchers: [...opponent.starters, opponent.closer, opponent.bullpen], starterIndex: 0, closerIndex: 5, bullpenIndex: 6, closerAvailable: true, closerOutsRemaining: closerBudget(opponent.closer) };
}
