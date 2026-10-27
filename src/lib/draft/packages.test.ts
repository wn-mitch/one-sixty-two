import { describe, expect, it, onTestFinished } from 'vitest';
import type { Profile } from '../game/types.ts';
import { simulateLeagueSegment } from '../engine/node.ts';
import { MAX_PARK_FAMILIARITY } from '../sim/league-types.ts';
import { leagueProfile, testLeagueData } from '../sim/test-fixtures.ts';
import { isRivalry, openingFans, payday, type FanState } from './fans.ts';
import { RIVALS } from './franchises.ts';
import { closeChapter, ironManUpgrades, recordSegment, saleBonusOf, seasonCrowds, segmentInput, startLeague, type ClubLineup, type LeagueSeason, type SegmentRecord } from './league.ts';
import { exchangeFor, familiarCount, familiarityFor, knowHowCount, MAX_KNOW_HOW, PACKAGES, parkHost, strongDollar, withKnowHow, type FranchisePackage } from './packages.ts';
import { effectiveCap, validateBudget } from './rules.ts';
import { applyAction, newRunSetup, ownedBy, startRun, windowLineup, type DraftRun, type RunData } from './run.ts';
import { buyTraining, gainScale, offersFor, priceFor, refusal, trainedThisVisit } from './shop.ts';
import { playDraft, submitAction, testUniverse } from './test-fixtures.ts';
import { developed, train, withSkill } from './training.ts';
import type { DraftSlot } from './types.ts';

const FRANCHISES = [...new Set([...Object.keys(RIVALS), ...Object.keys(PACKAGES)])];

/** Gives `franchiseId` `pack` for one test: the cap, cash, price and park mechanisms have no live package while they are reworked. */
function install(franchiseId: string, pack: Partial<FranchisePackage>): void {
 const table = PACKAGES as Record<string, FranchisePackage>;
 const before = table[franchiseId];
 table[franchiseId] = { name: 'Test package', summary: '', ...pack };
 onTestFinished(() => { if (before) table[franchiseId] = before; else delete table[franchiseId]; });
}
const DATA: RunData = { cards: testUniverse(160), franchiseIds: FRANCHISES, parkFit: () => 0 };

function seasonFor(franchiseId: string): { run: DraftRun; season: LeagueSeason; profile: (id: string) => Profile } {
 const run = startRun(newRunSetup(29, franchiseId, 'test-data'), DATA);
 playDraft(run);
 applyAction(run, { type: 'waivers' });
 applyAction(run, { type: 'autofix' });
 applyAction(run, submitAction(run));
 const season = startLeague(run);
 season.cash = season.cash.map(() => 100);
 const profile = (id: string) => {
  const card = run.pool.ledger.cards.get(id)!;
  return leagueProfile(id, (card.eligibleSlots.find(slot => slot !== 'DH') ?? card.eligibleSlots[0]) as DraftSlot, card.eligibleSlots);
 };
 return { run, season, profile };
}

describe('franchise packages', () => {
 it('sends each franchise\'s crowd trigger to the engine, which changes only its home games', () => {
  const { run, season, profile } = seasonFor('CLE');
  const profiles = new Map(season.lineups.flatMap(lineup => Object.values(lineup.active)).map(id => [id, profile(id)]));
  const input = segmentInput(run, season, profiles, testLeagueData(FRANCHISES), FRANCHISES.slice(0, 8));
  input.clubs.forEach((club, seat) => expect(club.crowdTrigger).toBe(PACKAGES[run.seating.seats[seat]]?.crowd ?? null));
  const plain = { ...input, clubs: input.clubs.map(club => ({ ...club, parkPackage: null, crowdTrigger: null })) };
  const cleveland = { ...plain, crowds: plain.crowds.map(() => ({ edge: .04, volatility: 0 })), clubs: plain.clubs.map((club, seat) => seat === run.seating.humanSeat ? { ...club, crowdTrigger: 'guardTheLead' as const } : club) };
  const before = simulateLeagueSegment({ ...cleveland, clubs: plain.clubs });
  const after = simulateLeagueSegment(cleveland);
  const changed = after.games.filter((game, index) => game.homeRuns !== before.games[index].homeRuns || game.awayRuns !== before.games[index].awayRuns);
  expect(changed.length).toBeGreaterThan(0);
  expect(changed.every(game => game.home === run.seating.humanSeat)).toBe(true);
  // Only Cleveland's meter fills, and it starts the next segment where this one left it.
  const human = run.seating.humanSeat;
  expect(input.clubs[human].crowdTrigger).toBe('guardTheLead');
  expect(after.hype[human]).toBeGreaterThan(0);
  expect(after.hype.filter((_, seat) => seat !== human).every(hype => hype === 0)).toBe(true);
  recordSegment(run, season, after);
  expect(segmentInput(run, season, profiles, testLeagueData(FRANCHISES), FRANCHISES.slice(0, 8)).hype).toEqual(after.hype);
  const next = { ...cleveland, segment: 1, carry: after.carry };
  const carried = simulateLeagueSegment({ ...next, hype: after.hype });
  const fresh = simulateLeagueSegment({ ...next, hype: [] });
  expect(carried.games).not.toEqual(fresh.games);
 });

 it('sends each franchise\'s park condition to the engine for its home games', () => {
  install('COL', { park: 'thinAir' });
  const { run, season, profile } = seasonFor('COL');
  const profiles = new Map(season.lineups.flatMap(lineup => Object.values(lineup.active)).map(id => [id, profile(id)]));
  const input = segmentInput(run, season, profiles, testLeagueData(FRANCHISES), FRANCHISES.slice(0, 8));
  // A relocating club plays under its first host's condition.
  input.clubs.forEach((club, seat) => expect(club.parkPackage).toBe(PACKAGES[parkHost(run.seating.seats[seat], run.setup.seed, 0)]?.park ?? null));
  expect(input.clubs[run.seating.humanSeat].parkPackage).toBe('thinAir');
  const plain = simulateLeagueSegment({ ...input, clubs: input.clubs.map(club => ({ ...club, parkPackage: null })) });
  const thin = simulateLeagueSegment(input);
  // Same seeds and rosters: only the packaged parks' games can change.
  const changed = thin.games.filter((game, index) => game.homeRuns !== plain.games[index].homeRuns || game.awayRuns !== plain.games[index].awayRuns);
  expect(changed.length).toBeGreaterThan(0);
  expect(changed.every(game => input.clubs[game.home].parkPackage !== null)).toBe(true);
 });

 it('counts printed cards that know the park and gives the home side the familiarity edge in its home games only', () => {
  install('NYY', { park: 'shortRightField', familiar: { rule: 'leftyHitter', perPlayer: .005 } });
  const { run, season, profile } = seasonFor('NYY');
  const human = run.seating.humanSeat;
  const lineup = season.lineups[human];
  // Lefty and switch hitters count; a left-handed pitcher does not.
  const hand = (slot: DraftSlot) => slot === 'C' || slot === '1B' ? 'L' : slot === '2B' ? 'B' : 'R';
  const profiles = new Map(season.lineups.flatMap(lineup => Object.values(lineup.active)).map(id => [id, profile(id)]));
  for (const [slot, id] of Object.entries(lineup.active)) profiles.set(id, { ...profiles.get(id)!, bats: hand(slot as DraftSlot) });
  const roster = run.pool.rules.activeSlots.map(slot => ({ profile: profiles.get(lineup.active[slot])!, slot }));
  expect(familiarCount('NYY', roster)).toBe(3);
  expect(familiarCount('WSN', roster)).toBeNull();
  const input = segmentInput(run, season, profiles, testLeagueData(FRANCHISES), FRANCHISES.slice(0, 8));
  const printed = (seat: number) => run.pool.rules.activeSlots.map(slot => ({ profile: profiles.get(season.lineups[seat].active[slot])!, slot }));
  input.clubs.forEach((club, seat) => expect(club.familiarity).toBe(seat === human ? .015 : familiarityFor(parkHost(run.seating.seats[seat], run.setup.seed, 0), printed(seat), PACKAGES[run.seating.seats[seat]]?.relocation?.familiarity)));
  const known = { ...input, clubs: input.clubs.map((club, seat) => seat === human ? { ...club, familiarity: MAX_PARK_FAMILIARITY } : club) };
  const plain = simulateLeagueSegment({ ...known, clubs: known.clubs.map((club, seat) => seat === human ? { ...club, familiarity: 0 } : club) });
  const familiar = simulateLeagueSegment(known);
  const changed = familiar.games.filter((game, index) => game.homeRuns !== plain.games[index].homeRuns || game.awayRuns !== plain.games[index].awayRuns);
  expect(changed.length).toBeGreaterThan(0);
  expect(changed.every(game => game.home === human)).toBe(true);
  const home = (result: typeof plain) => result.games.filter(game => game.home === human).reduce((sum, game) => sum + game.homeRuns - game.awayRuns, 0);
  expect(home(familiar)).toBeGreaterThan(home(plain));
  expect(() => simulateLeagueSegment({ ...known, clubs: known.clubs.map(club => ({ ...club, familiarity: MAX_PARK_FAMILIARITY + .001 })) })).toThrow(/familiarity/);
 });

 it('moves each franchise\'s cap by its share of the table cap, always leaving room for a roster of commons', () => {
  install('ATL', { capShare: .15 });
  install('OAK', { capShare: -.12 });
  for (const franchiseId of ['ATL', 'OAK', 'SEA']) {
   const run = startRun(newRunSetup(29, franchiseId, 'test-data'), DATA);
   const seat = run.seating.humanSeat;
   const share = PACKAGES[franchiseId]?.capShare ?? 0;
   expect(effectiveCap(run.budgets[seat])).toBe(run.pool.tableCap + Math.round(run.pool.tableCap * share));
   expect(validateBudget(run.budgets[seat], run.pool.rules)).toEqual([]);
  }
 });

 it('prices training for a discount package a quarter lower and charges that price', () => {
  install('OAK', { capShare: -.12, trainingPrice: .75 });
  const { run, season, profile } = seasonFor('OAK');
  const human = run.seating.humanSeat;
  expect(priceFor(run, season, human, 'hitting')).toBe(8);
  expect(priceFor(run, season, human, 'power')).toBe(11);
  const ss = season.lineups[human].active.SS;
  buyTraining(run, season, human, profile(ss), 'hitting');
  expect(season.cash[human]).toBe(92);
  expect(season.upgrades[0].cost).toBe(8);
 });

 it('gives a fielding package half as much again from fielding, and the gain stays with the card', () => {
  install('STL', { trainingGain: { fielding: 1.5, baserunning: 1.5 } });
  const { run, season, profile } = seasonFor('STL');
  const human = run.seating.humanSeat;
  const id = season.lineups[human].active.SS;
  const printed = profile(id);
  buyTraining(run, season, human, printed, 'fielding');
  expect(season.upgrades[0].scale).toBe(1.5);
  const skill = (card: Profile) => card.defense.positions.SS!.hitPrevention;
  const ceilingGap = .2776 - skill(printed);
  expect(skill(developed(printed, season.upgrades, 0)) - skill(printed)).toBeCloseTo(.15 * 1.5 * ceilingGap, 6);
  // Another club's purchase gains the ordinary amount.
  const plainSeat = run.seating.seats.findIndex((franchiseId, seat) => seat !== human && !PACKAGES[franchiseId]);
  expect(gainScale(run, season, plainSeat, 'fielding')).toBe(1);
 });

 it('offers Texas the strikeout pitch at every stop and boosts it, and scales Detroit by its active commons', () => {
  const texas = seasonFor('TEX');
  const tx = texas.run.seating.humanSeat;
  for (let stop = 0; stop < 18; stop++) expect(offersFor(texas.run, tx, stop)).toContain('strikeout');
  const plain = texas.run.seating.seats.findIndex(franchiseId => franchiseId !== 'TEX');
  expect(Array.from({ length: 18 }, (_, stop) => offersFor(texas.run, plain, stop).includes('strikeout')).every(Boolean)).toBe(false);
  expect(gainScale(texas.run, texas.season, tx, 'strikeout')).toBe(1.5);
  expect(gainScale(texas.run, texas.season, tx, 'strikeout', true)).toBe(2.25);
  const detroit = seasonFor('DET');
  const dt = detroit.run.seating.humanSeat;
  const commons = Object.values(detroit.season.lineups[dt].active).filter(id => { const card = detroit.run.pool.ledger.cards.get(id)!; return card.finish === 'base' && card.salary <= detroit.run.pool.rules.commonSalaryMax; }).length;
  expect(commons).toBeGreaterThan(0);
  expect(gainScale(detroit.run, detroit.season, dt, 'hitting')).toBeCloseTo(1 + Math.min(.4, .05 * commons), 9);
 });

 it('pays home-win cash for home wins only', () => {
  install('KCR', { homeWinCash: 1.5 });
  const fans: FanState = { prior: .5, expectation: .5, sentiment: 0 };
  const seats = ['KCR', 'SEA'];
  const games = [
   { matchday: 0, home: 0, away: 1, homeRuns: 5, awayRuns: 2 },
   { matchday: 1, home: 0, away: 1, homeRuns: 6, awayRuns: 1 },
   { matchday: 2, home: 0, away: 1, homeRuns: 1, awayRuns: 2 },
   { matchday: 3, home: 1, away: 0, homeRuns: 0, awayRuns: 3 },
   { matchday: 4, home: 1, away: 0, homeRuns: 3, awayRuns: 2 }
  ];
  expect(payday(0, seats, fans, games).franchise).toBe(3);
  expect(payday(1, seats, fans, games).franchise).toBe(0);
 });

 it('gives a know-how club range at every fielder, home and away, from its printed elite gloves', () => {
  install('STL', { knowHow: { minGrade: 60, perPlayer: .05 } });
  const { run, season, profile } = seasonFor('STL');
  const human = run.seating.humanSeat;
  const lineup = season.lineups[human];
  const profiles = new Map(season.lineups.flatMap(lineup => Object.values(lineup.active)).map(id => [id, profile(id)]));
  // Elite range lifts a median glove past the bar at C, SS and CF; the same glove at DH does not count.
  const elite = (slot: DraftSlot, position: 'C' | 'SS' | 'CF' | '1B') => {
   const card = profiles.get(lineup.active[slot])!;
   const skills = card.defense.positions[position] ?? profile(lineup.active['1B']).defense.positions['1B']!;
   profiles.set(card.seasonId, { ...card, defense: { ...card.defense, positions: { ...card.defense.positions, [position]: withSkill(skills, 'hitPrevention', .6) } } });
  };
  elite('C', 'C');
  elite('SS', 'SS');
  elite('CF', 'CF');
  elite('DH', '1B');
  const roster = run.pool.rules.activeSlots.map(slot => ({ profile: profiles.get(lineup.active[slot])!, slot }));
  expect(knowHowCount('STL', roster)).toBe(3);
  expect(knowHowCount('ARI', roster)).toBeNull();
  const input = segmentInput(run, season, profiles, testLeagueData(FRANCHISES), FRANCHISES.slice(0, 8));
  const range = (seat: number, slot: DraftSlot) => input.clubs[seat].roster.find(pick => pick.slot === slot)!.profile.defense.positions[slot as 'SS']!.hitPrevention;
  const printedRange = (seat: number, slot: DraftSlot) => profiles.get(season.lineups[seat].active[slot])!.defense.positions[slot as 'SS']!.hitPrevention;
  expect(range(human, '2B') - printedRange(human, '2B')).toBeCloseTo(.15, 9);
  const other = (human + 1) % 8;
  expect(range(other, '2B')).toBe(printedRange(other, '2B'));
  // At full know-how the club allows fewer runs, at home and on the road.
  // The fixture's gloves have no historical evidence; a gain marks them trained and keeps the club valid.
  expect(profiles.get(lineup.active['2B'])!.defense.positions['2B']!.evidence.hitPrevention.status).toBe('neutralMissingEvidence');
  expect(input.clubs[human].roster.find(pick => pick.slot === '2B')!.profile.defense.positions['2B']!.evidence.hitPrevention.status).toBe('trained');
  expect(train(profiles.get(lineup.active['2B'])!, 'fielding').defense.positions['2B']!.evidence.hitPrevention.status).toBe('trained');
  const withEdge = (edge: number) => ({ ...input, clubs: input.clubs.map((club, seat) => seat !== human ? club : { ...club, roster: club.roster.map(pick => ({ ...pick, profile: withKnowHow(profiles.get(pick.profile.seasonId)!, edge) })) }) });
  // Same seeds: only the club's games change, road games included, and over twelve segments it allows fewer runs.
  const plain = simulateLeagueSegment(withEdge(0));
  const known = simulateLeagueSegment(withEdge(MAX_KNOW_HOW));
  const changed = known.games.filter((game, index) => game.homeRuns !== plain.games[index].homeRuns || game.awayRuns !== plain.games[index].awayRuns);
  expect(changed.every(game => game.home === human || game.away === human)).toBe(true);
  expect(changed.some(game => game.away === human)).toBe(true);
  const allowed = (edge: number) => Array.from({ length: 12 }, (_, segment) => simulateLeagueSegment({ ...withEdge(edge), seed: 100 + segment }))
   .flatMap(result => result.games).reduce((sum, game) => sum + (game.home === human ? game.awayRuns : game.away === human ? game.homeRuns : 0), 0);
  expect(allowed(MAX_KNOW_HOW)).toBeLessThan(allowed(0));
 });

 it('gives an Iron Man club a free hitting training per hitter each payday, growing with his streak', () => {
  install('BAL', { ironMan: { step: .1, max: .25 } });
  const { run, season, profile } = seasonFor('BAL');
  const human = run.seating.humanSeat;
  const profiles = new Map(season.lineups.flatMap(lineup => Object.values(lineup.active)).map(id => [id, profile(id)]));
  const data = testLeagueData(FRANCHISES);
  recordSegment(run, season, simulateLeagueSegment(segmentInput(run, season, profiles, data, FRANCHISES.slice(0, 8))));
  const hitters = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].map(slot => season.lineups[human].active[slot as DraftSlot]);
  const first = season.upgrades.filter(upgrade => upgrade.free);
  expect(first.map(upgrade => upgrade.cardId).sort()).toEqual([...hitters].sort());
  expect(first.every(upgrade => upgrade.paidBy === human && upgrade.kind === 'hitting' && upgrade.cost === 0 && upgrade.stop === 1 && upgrade.scale === .1)).toBe(true);
  // A free training is not the stop's purchase, and it acts from the next segment.
  expect(trainedThisVisit(season, hitters[0])).toBe(false);
  buyTraining(run, season, human, profile(hitters[0]), 'hitting');
  expect(developed(profile(hitters[1]), season.upgrades, 1).battingRates).not.toEqual(profile(hitters[1]).battingRates);
  expect(developed(profile(hitters[1]), season.upgrades, 0).battingRates).toEqual(profile(hitters[1]).battingRates);
  recordSegment(run, season, simulateLeagueSegment(segmentInput(run, season, profiles, data, FRANCHISES.slice(0, 8))));
  expect(season.upgrades.filter(upgrade => upgrade.free && upgrade.stop === 2).every(upgrade => upgrade.scale === .2)).toBe(true);
  // A hitter who sat out a stop starts his streak over; the scale stops growing at its cap.
  season.segments[0].lines[human].batting = season.segments[0].lines[human].batting.filter(line => line.seasonId !== hitters[2]);
  season.segments[1].lines[human].batting = season.segments[1].lines[human].batting.filter(line => line.seasonId !== hitters[2]);
  recordSegment(run, season, simulateLeagueSegment(segmentInput(run, season, profiles, data, FRANCHISES.slice(0, 8))));
  const third = ironManUpgrades(run, season, human, 2);
  expect(third.find(upgrade => upgrade.cardId === hitters[2])!.scale).toBe(.1);
  expect(third.find(upgrade => upgrade.cardId === hitters[3])!.scale).toBe(.25);
  expect(season.upgrades.filter(upgrade => upgrade.free).every(upgrade => upgrade.paidBy === human)).toBe(true);
 });

 it('banks a Farm Team club twice its own training spend on each card it trades away, once per card', () => {
  const { run, season, profile } = seasonFor('PIT');
  const human = run.seating.humanSeat;
  const mine = [...ownedBy(run, human)].sort((a, b) => b.valueRuns - a.valueRuns).map(card => card.seasonId);
  const [sold, kept] = mine;
  const basic = (id: string) => refusal(run, season, human, profile(id), 'hitting') ? 'pitching' : 'hitting';
  buyTraining(run, season, human, profile(sold), basic(sold));
  buyTraining(run, season, human, profile(kept), basic(kept));
  // Gifts and other clubs' spending on the card do not count toward the bonus.
  season.upgrades.push({ cardId: sold, kind: 'fielding', stop: 1, paidBy: human, cost: 0, free: true }, { cardId: sold, kind: 'baserunning', stop: 1, paidBy: (human + 1) % 8, cost: 10 });
  expect(saleBonusOf(run, season, human, sold)).toBe(2 * priceFor(run, season, human, 'hitting'));
  applyAction(run, { type: 'chapter', chapter: 1, order: run.seating.seats.map((_, seat) => seat).reverse(), lineup: structuredClone(run.lineup!), learned: [] });
  const partner = run.seating.seats.map((_, seat) => seat).find(seat => {
   if (seat === human) return false;
   const get = [...ownedBy(run, seat)].sort((a, b) => a.valueRuns - b.valueRuns)[0].seasonId;
   applyAction(run, { type: 'propose', seat, give: [sold], get: [get] });
   return run.market!.offers.at(-1)!.status === 'accepted';
  });
  expect(partner).toBeDefined();
  const bank = season.cash[human];
  applyAction(run, { type: 'waivers' });
  applyAction(run, { type: 'autofix' });
  applyAction(run, { type: 'submit', lineup: windowLineup(run) as ClubLineup });
  closeChapter(run, season);
  expect(season.sales).toEqual([{ cardId: sold, seat: human, cash: 20, chapter: 1 }]);
  expect(season.cash[human]).toBe(bank + 20);
  // The card has earned its bonus; trading it again would bank nothing, and the received card none either.
  expect(saleBonusOf(run, season, human, sold)).toBe(0);
  expect(saleBonusOf(run, season, human, kept)).toBe(20);
  expect(saleBonusOf(run, season, partner!, sold)).toBe(0);
 });

 it('turns Toronto\'s dollar each chapter: cheap training and thin stands, or dear training and full ones', () => {
  for (const seed of [1, 2, 3]) expect(Array.from({ length: 6 }, (_, chapter) => strongDollar(seed, chapter)).filter(Boolean)).toHaveLength(3);
  expect(new Set([1, 2, 3, 4, 5].map(seed => Array.from({ length: 6 }, (_, chapter) => strongDollar(seed, chapter)).join()))).not.toHaveProperty('size', 1);
  const { run, season } = seasonFor('TOR');
  const human = run.seating.humanSeat;
  const other = (human + 1) % 8;
  const chapter = (index: number) => { season.segments = Array.from({ length: index * 3 }, () => ({}) as SegmentRecord); };
  const strong = [0, 1, 2, 3, 4, 5].find(index => strongDollar(run.setup.seed, index))!;
  const weak = [0, 1, 2, 3, 4, 5].find(index => !strongDollar(run.setup.seed, index))!;
  chapter(strong);
  const [cheap, thin, otherStrong] = [priceFor(run, season, human, 'hitting'), seasonCrowds(run, season)[human].edge, seasonCrowds(run, season)[other].edge];
  chapter(weak);
  const [dear, full, otherWeak] = [priceFor(run, season, human, 'hitting'), seasonCrowds(run, season)[human].edge, seasonCrowds(run, season)[other].edge];
  expect([cheap, dear]).toEqual([6, 14]);
  expect(full).toBeGreaterThan(thin);
  expect(otherWeak).toBe(otherStrong);
  expect(priceFor(run, season, other, 'hitting')).toBe(10);
  // Ten home games against a non-rival: a strong dollar sells .55 of the seats at 1.3 times the price, a weak one .85 at 1 / 1.3.
  const visitor = [0, 1, 2, 3, 4, 5, 6, 7].find(seat => seat !== human && !isRivalry('TOR', run.seating.seats[seat]))!;
  const games = Array.from({ length: 10 }, (_, matchday) => ({ matchday, home: human, away: visitor, homeRuns: 1, awayRuns: 2 })) as SegmentRecord['games'];
  const gate = (index: number) => payday(human, run.seating.seats, openingFans(.5), games, exchangeFor('TOR', run.setup.seed, index)).gate;
  expect([gate(strong), gate(weak)]).toEqual([Math.round(1.6 * 1.3 * .55 * 10), Math.round(1.6 / 1.3 * .85 * 10)]);
 });

 it('moves the Angels\' home games through every borrowed park before any repeats, with that park\'s familiarity', () => {
  const hosts = PACKAGES.ANA.relocation!.hosts;
  for (const seed of [1, 2, 3, 4]) {
   const venues = [0, 1, 2, 3, 4, 5].map(chapter => parkHost('ANA', seed, chapter));
   expect([...venues.slice(0, 5)].sort()).toEqual([...hosts].sort());
   expect(hosts).toContain(venues[5]);
   expect(venues[5]).not.toBe(venues[4]);
  }
  expect(parkHost('BOS', 1, 3)).toBe('BOS');
  const { run, season, profile } = seasonFor('ANA');
  const human = run.seating.humanSeat;
  const profiles = new Map(season.lineups.flatMap(lineup => Object.values(lineup.active)).map(id => [id, profile(id)]));
  const data = testLeagueData(FRANCHISES);
  const printed = run.pool.rules.activeSlots.map(slot => ({ profile: profile(season.lineups[human].active[slot]), slot }));
  const seen = new Set<string>();
  for (const chapter of [0, 1, 2, 3, 4, 5]) {
   season.segments = Array.from({ length: chapter * 3 }, () => ({ carry: [], hype: [] }) as unknown as SegmentRecord);
   const host = parkHost('ANA', run.setup.seed, chapter);
   const clubs = segmentInput(run, season, profiles, data, FRANCHISES.slice(0, 8)).clubs;
   expect(clubs[human].parkPackage).toBe(PACKAGES[host].park);
   expect(clubs[human].familiarity).toBe(Math.min(MAX_PARK_FAMILIARITY, 2 * familiarityFor(host, printed)));
   expect(familiarityFor(host, printed, 2)).toBe(clubs[human].familiarity);
   clubs.forEach((club, seat) => { if (seat !== human) expect(club.parkPackage).toBe(PACKAGES[run.seating.seats[seat]]?.park ?? null); });
   seen.add(clubs[human].parkPackage!);
  }
  expect(seen.size).toBe(5);
 });

 it('sends Houston\'s pitch information to the engine, which changes only Houston\'s home games', () => {
  const { run, season, profile } = seasonFor('HOU');
  const human = run.seating.humanSeat;
  const profiles = new Map(season.lineups.flatMap(lineup => Object.values(lineup.active)).map(id => [id, profile(id)]));
  const input = segmentInput(run, season, profiles, testLeagueData(FRANCHISES), FRANCHISES.slice(0, 8));
  input.clubs.forEach((club, seat) => expect(club.information).toBe(seat === human ? .25 : 0));
  const blind = simulateLeagueSegment({ ...input, clubs: input.clubs.map(club => ({ ...club, information: 0 })) });
  const informed = simulateLeagueSegment(input);
  const changed = informed.games.filter((game, index) => game.homeRuns !== blind.games[index].homeRuns || game.awayRuns !== blind.games[index].awayRuns);
  expect(changed.length).toBeGreaterThan(0);
  expect(changed.every(game => game.home === human)).toBe(true);
  expect(() => simulateLeagueSegment({ ...input, clubs: input.clubs.map((club, seat) => seat === human ? { ...club, information: .31 } : club) })).toThrow(/information is out of bounds/);
 });

 it('plays each surface, ring, inning and calendar park in its club\'s home games only, with its familiarity rule', () => {
  for (const [franchiseId, park] of [['ARI', 'hotCorner'], ['FLA', 'everglades'], ['TBD', 'catwalk'], ['MIL', 'fermentation'], ['MIN', 'deepFreeze']] as const) {
   expect(PACKAGES[franchiseId].park).toBe(park);
   const { run, season, profile } = seasonFor(franchiseId);
   const human = run.seating.humanSeat;
   const profiles = new Map(season.lineups.flatMap(lineup => Object.values(lineup.active)).map(id => [id, profile(id)]));
   const input = segmentInput(run, season, profiles, testLeagueData(FRANCHISES), FRANCHISES.slice(0, 8));
   expect(input.clubs[human].parkPackage).toBe(park);
   const plain = simulateLeagueSegment({ ...input, clubs: input.clubs.map((club, seat) => seat === human ? { ...club, parkPackage: null } : club) });
   const played = simulateLeagueSegment(input);
   const changed = played.games.filter((game, index) => game.homeRuns !== plain.games[index].homeRuns || game.awayRuns !== plain.games[index].awayRuns);
   expect(changed.length, franchiseId).toBeGreaterThan(0);
   expect(changed.every(game => game.home === human), franchiseId).toBe(true);
  }
  // Infield gloves count only in the infield; fast runners only among hitters; strikeout arms only in the rotation.
  const card = (overrides: Partial<Profile>) => ({ ...leagueProfile('x', 'SS', ['SS']), ...overrides }) as Profile;
  const fast = card({ speed: .8 });
  expect(familiarCount('FLA', [{ profile: fast, slot: 'SS' }, { profile: fast, slot: 'DH' }, { profile: card({ speed: .69 }), slot: 'CF' }])).toBe(2);
  const ace = card({ pitching: { G: 30, GS: 30, IPouts: 600, H: 150, HR: 15, BB: 50, HBP: 5, SO: 200, BFP: 800, ER: 60, SV: 0 } });
  expect(familiarCount('MIN', [{ profile: ace, slot: 'SP1' }, { profile: ace, slot: 'CL' }])).toBe(1);
 });
});
