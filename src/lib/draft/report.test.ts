import { describe, expect, it } from 'vitest';
import { memoryDb } from '../storage/test-db.ts';
import { readShop } from '../cosmetics/ledger.ts';
import { loadCollection, stickersFromSeason } from '../collection/collection.ts';
import { DRAFT_STICKER_KIND, faceStickers, STICKER_BY_KIND } from '../collection/stickers.ts';
import { LEAGUE_SEGMENTS } from '../sim/league-types.ts';
import type { GameResult } from '../sim/types.ts';
import { RIVALS } from './franchises.ts';
import { standings, startLeague, type LeagueSeason, type SegmentRecord, type Standing } from './league.ts';
import { momentTitle, updateMoments, type SeasonMoments } from './moments.ts';
import { finishGrade, finishReward, finishTokens, leagueSticker } from './report.ts';
import { draftShareReport } from './share.ts';
import { applyAction, newRunSetup, startRun, type DraftRun, type RunData } from './run.ts';
import { runSeasonKey, saveRun } from './saves.ts';
import { seasonRoster } from './shop.ts';
import { playDraft, submitAction, testUniverse } from './test-fixtures.ts';

const DATA: RunData = { cards: testUniverse(120), franchiseIds: Object.keys(RIVALS), parkFit: () => 0 };

function finished(): { run: DraftRun; season: LeagueSeason; human: number; rival: number } {
 const run = startRun(newRunSetup(29, 'NYM', 'test-data'), DATA);
 playDraft(run);
 applyAction(run, { type: 'waivers' });
 applyAction(run, { type: 'autofix' });
 applyAction(run, submitAction(run));
 const season = startLeague(run);
 const human = run.seating.humanSeat;
 const rival = season.rivals.find(pair => pair.includes(human))!.find(seat => seat !== human)!;
 return { run, season, human, rival };
}

/** Eighteen nine-game segments in which `seat` plays the other seats in turn and `wins(opponent)` decides each game. */
function play(season: LeagueSeason, seat: number, wins: (opponent: number) => boolean): void {
 const others = season.lineups.map((_, other) => other).filter(other => other !== seat);
 season.segments = Array.from({ length: LEAGUE_SEGMENTS }, (_, segment) => ({
  games: Array.from({ length: 9 }, (_, index) => others[(segment * 9 + index) % others.length])
   .map((other, index) => ({ matchday: segment * 9 + index, home: seat, away: other, homeRuns: wins(other) ? 5 : 1, awayRuns: wins(other) ? 1 : 5 })),
  lines: season.lineups.map(() => ({ batting: [], pitching: [] })), carry: [], crowds: [], paydays: [], hype: []
 }) as unknown as SegmentRecord);
}

/** Turns the season's first game into a loss for the home side. */
function loseFirst(season: LeagueSeason): void {
 season.segments[0].games[0] = { ...season.segments[0].games[0], homeRuns: 1, awayRuns: 5 };
}

const row = (seat: number, wins: number, gamesBack: number): Standing => ({ seat, wins, losses: 162 - wins, runsFor: 0, runsAgainst: 0, gamesBack });

describe('Draft season report', () => {
 it('grades by finish, with S+ for a runaway champion and Perfect at 162-0', () => {
  const table = [row(0, 100, 0), row(1, 95, 5), row(2, 90, 10), row(3, 85, 15), row(4, 80, 20), row(5, 75, 25), row(6, 70, 30), row(7, 60, 40)];
  expect(table.map(item => finishGrade(table, item.seat))).toEqual(['S', 'AA', 'A', 'B', 'C', 'C', 'D', 'F']);
  const runaway = [row(0, 105, 0), row(1, 95, 10), ...table.slice(2)];
  expect(finishGrade(runaway, 0)).toBe('S+');
  expect(finishGrade([row(0, 162, 0), row(1, 100, 62)], 0)).toBe('Perfect');
  expect([1, 2, 4, 5, 8].map(finishTokens)).toEqual([3, 2, 2, 1, 1]);
 });

 it('records a finished season once: finish-scaled tokens, the final roster in the binder and its league sticker', async () => {
  const { run, season, human } = finished();
  // The title, short of 162-0: the player loses only its first game.
  play(season, human, () => true);
  loseFirst(season);
  const row = standings(season)[0];
  expect(row.seat).toBe(human);
  expect(row.losses).toBeGreaterThan(0);
  const { db } = await memoryDb();
  const before = (await readShop(db)).balance;
  const stamp = new Date(Date.UTC(2026, 9, 1));
  expect(await saveRun(db, 'run', run, season, stamp, seasonId => `Card ${seasonId}`)).toBeNull();
  const key = runSeasonKey('run');
  expect(await finishReward(db, key, stamp.toISOString())).toEqual({ season: 3, bonus: 0, daily: 0 });
  expect((await readShop(db)).balance).toBe(before + 3);
  const roster = seasonRoster(season, human);
  const collection = await loadCollection(db);
  expect(collection.map(card => card.seasonId).sort()).toEqual([...roster].sort());
  expect(collection.every(card => card.label === `Card ${card.seasonId}` && card.best.wins === row.wins && card.best.losses === row.losses)).toBe(true);
  const stickers = await stickersFromSeason(db, key);
  expect(stickers.map(item => item.sticker.kind)).toEqual(roster.map(() => DRAFT_STICKER_KIND.champions('NYM')));
  // A later save of the same finished run (leaving the report, say) adds nothing and keeps the labels.
  expect(await saveRun(db, 'run', run, season, new Date(Date.UTC(2026, 9, 2)))).toBeNull();
  expect((await readShop(db)).balance).toBe(before + 3);
  expect(await finishReward(db, key, new Date(Date.UTC(2026, 9, 2)).toISOString())).toEqual({ season: 0, bonus: 0, daily: 0 });
  expect((await loadCollection(db)).every(card => card.label === `Card ${card.seasonId}` && card.times === 1)).toBe(true);
  expect(await stickersFromSeason(db, key)).toHaveLength(roster.length);
 });

 it('counts a Draft rostering toward times drafted, awarding the sticker the finish completes', async () => {
  const { run, season, human } = finished();
  play(season, human, () => true);
  loseFirst(season);
  const { db } = await memoryDb();
  const [veteran, rookie] = seasonRoster(season, human);
  // Two earlier Classic seasons rostered the veteran.
  await db.run(['classic:a', 'classic:b'].map(key => ({
   sql: "INSERT INTO rostered (season_id, season_key, rostered_at, label, slot, wins, losses, line_json) VALUES (?, ?, '2026-01-01T00:00:00.000Z', 'Vet', 'C', 100, 62, NULL)", bind: [veteran, key]
  })));
  await saveRun(db, 'run', run, season, new Date(Date.UTC(2026, 9, 1)));
  const kinds = (seasonId: string) => db.all<{ kind: string; season_id: string }>('SELECT kind, season_id FROM stickers WHERE season_id = ?', [seasonId]).then(rows => rows.map(row => row.kind).sort());
  expect(await kinds(veteran)).toEqual([DRAFT_STICKER_KIND.champions('NYM'), 'drafted-3'].sort());
  expect(await kinds(rookie)).toEqual([DRAFT_STICKER_KIND.champions('NYM')]);
 });

 it('shares a finished season as a snapshot within the published size, naming the player and rival once', () => {
  const { run, season, human, rival } = finished();
  play(season, human, () => true);
  loseFirst(season);
  const report = draftShareReport(run, season, seat => `Club ${seat}`, seasonId => `Card ${seasonId}`);
  expect(report).toMatchObject({ club: `Club ${human}`, place: 1, grade: 'S+', franchiseId: 'NYM', seed: run.setup.seed, rival: { club: `Club ${rival}` } });
  expect(report.rival.wins + report.rival.losses).toBeGreaterThan(20);
  expect(report.standings.filter(row => row.you).map(row => row.club)).toEqual([`Club ${human}`]);
  expect(report.standings.filter(row => row.rival).map(row => row.club)).toEqual([`Club ${rival}`]);
  expect(report.roster).toHaveLength(seasonRoster(season, human).length);
  expect(report.roster.filter(card => card.slot === 'Res')).toHaveLength(season.lineups[human].reserves.length);
  expect(report.decrees).toHaveLength(6);
  expect(new TextEncoder().encode(JSON.stringify(report)).byteLength).toBeLessThan(32 * 1024);
 });

 it('gives the rival sticker for a won rival series short of the title, and nothing for a lost one', async () => {
  const { run, season, human, rival } = finished();
  // The player beats only the rival; everyone else beats the player, so it finishes outside first.
  play(season, human, other => other === rival);
  expect(standings(season)[0].seat).not.toBe(human);
  expect(leagueSticker(run, season)).toBe(DRAFT_STICKER_KIND.rival);
  play(season, human, () => false);
  expect(leagueSticker(run, season)).toBeNull();
  const { db } = await memoryDb();
  await saveRun(db, 'lost', run, season);
  expect(await stickersFromSeason(db, runSeasonKey('lost'))).toEqual([]);
  expect((await readShop(db)).balance).toBe(1);
 });

 it('ranks league stickers on the card face by their expected share of Draft seasons', () => {
  const sticker = (kind: string) => ({ kind, x: 0, y: 0, hidden: false, earnedAt: '2026-01-01' });
  const table = { cards: 100, reached: { 'hr-20': 30, 'hits-150': 10, 'wins-20': 90 } };
  // A title (one season in eight) outranks a 10% Classic sticker; a rival series win (one in two) does not.
  expect(faceStickers(['hr-20', 'hits-150', 'wins-20', DRAFT_STICKER_KIND.champions('CIN')].map(sticker), { table }).map(item => item.kind))
   .toEqual(['hits-150', DRAFT_STICKER_KIND.champions('CIN'), 'hr-20']);
  expect(faceStickers(['hr-20', 'hits-150', 'wins-20', DRAFT_STICKER_KIND.rival].map(sticker), { table }).map(item => item.kind))
   .toEqual(['hits-150', 'hr-20', DRAFT_STICKER_KIND.rival]);
  expect(STICKER_BY_KIND.get(DRAFT_STICKER_KIND.perfect)).toMatchObject({ family: 'league', tier: 3, foil: 'gem' });
 });
});

/** A game from the player's side; innings are runs per inning for the away then home club, null for a half not played. */
function game(number: number, isHome: boolean, away: (number | null)[], home: (number | null)[]): GameResult {
 const total = (innings: (number | null)[]) => innings.reduce<number>((sum, runs) => sum + (runs ?? 0), 0);
 const [mine, theirs] = isHome ? [total(home), total(away)] : [total(away), total(home)];
 return {
  number, opponentId: 'BOS', opponentName: 'Boston', isHome, home: { name: 'Home', runs: total(home), innings: home }, away: { name: 'Away', runs: total(away), innings: away },
  challengeRuns: mine, opponentRuns: theirs, win: mine > theirs
 } as unknown as GameResult;
}

describe('Draft season moments', () => {
 const none: SeasonMoments = { highlight: null, lowlight: null };
 // Matchday 10, slot 1: the club's eleventh game.
 const comeback = game(41, false, [0, 0, 0, 2, 2, 0, 2, 0, 0], [3, 1, 0, 0, 0, 0, 0, 0, null]);
 const walkOff = game(81, true, [2, 0, 0, 0, 1, 0, 0, 0, 0], [0, 0, 1, 0, 0, 2, 0, 0, 1]);
 const rout = game(121, true, [0, 0, 0, 0, 0, 0, 0, 0, 1], [5, 3, 0, 0, 2, 0, 0, 0, null]);
 const blown = game(161, true, [0, 0, 0, 0, 0, 3, 3, 1, 0], [4, 1, 0, 0, 0, 0, 0, 0, 0]);
 const walkedOff = game(201, false, [1, 2, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 1, 2, 1]);

 it('keeps a walk-off win over a bigger comeback, and a walk-off loss over a bigger blown lead', () => {
  const moments = updateMoments(none, [comeback, rout, walkOff, blown, walkedOff], 4);
  expect(moments.highlight).toMatchObject({ walkOff: true, swing: 2, segment: 4 });
  expect(moments.highlight!.game).toBe(walkOff);
  expect(moments.lowlight).toMatchObject({ walkOff: true, swing: 3 });
  expect(moments.lowlight!.game).toBe(walkedOff);
  expect(momentTitle(moments.highlight!)).toBe('Walk-off win from 2 down vs Boston, game 21');
  expect(momentTitle(moments.lowlight!)).toBe('Walk-off loss after leading by 3 at Boston, game 51');
 });

 it('ranks comebacks and blown leads by size, and a home side that never bats in the last half has no walk-off', () => {
  const moments = updateMoments(none, [rout, comeback, blown], 0);
  expect(moments.highlight).toMatchObject({ walkOff: false, swing: 4 });
  expect(momentTitle(moments.highlight!)).toBe('Came back from 4 down at Boston, game 11');
  expect(moments.lowlight).toMatchObject({ walkOff: false, swing: 5 });
  expect(momentTitle(moments.lowlight!)).toBe('Blew a 5-run lead vs Boston, game 41');
  expect(momentTitle(updateMoments(none, [rout], 0).highlight!)).toBe('Won by 9 vs Boston, game 31');
  // Moments carry across segments: a later, smaller comeback keeps the earlier highlight.
  const later = game(401, false, [0, 0, 0, 0, 0, 0, 0, 0, 3], [2, 0, 0, 0, 0, 0, 0, 0, 0]);
  expect(updateMoments(moments, [later], 11).highlight!.game).toBe(comeback);
 });
});
