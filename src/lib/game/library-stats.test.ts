import { describe, expect, it } from 'vitest';
import type { SavedBatter, SavedPitcher } from './library.ts';
import { libraryLeaders, QUALIFYING_OUTS, QUALIFYING_PA, teamTotals } from './library-stats.ts';
import { recordSeries, loadSeriesHistory, seriesBetween, seriesTally, type SeriesRecord } from './series-history.ts';

const batter = (seasonId: string, overrides: Partial<SavedBatter> = {}): SavedBatter => ({
 seasonId, label: seasonId, slot: 'LF', PA: 600, AB: 500, H: 150, doubles: 30, triples: 2, HR: 20, BB: 80, HBP: 5, SF: 5, RBI: 80, SB: 10, war: 2, ...overrides
});
const pitcher = (seasonId: string, overrides: Partial<SavedPitcher> = {}): SavedPitcher => ({
 seasonId, label: seasonId, slot: 'SP1', outs: 600, H: 180, BB: 50, SO: 200, R: 80, starts: 54, war: 3, ...overrides
});
const club = (key: string, savedAt: string, batting: SavedBatter[], pitching: SavedPitcher[], wins = 90) => ({
 key, savedAt, record: { wins, losses: 162 - wins }, runs: { scored: 800, allowed: 700 }, stadium: null, batting, pitching
});

describe('library leaders', () => {
 it('applies rate qualifiers, ranks RA9 low-first, and breaks ties by the earlier save', () => {
  const groups = libraryLeaders([
   club('late', '2026-02-01', [batter('hot', { PA: QUALIFYING_PA - 1, AB: 100, H: 60 }), batter('tie-late', { HR: 40 })], [pitcher('ace', { R: 40 }), pitcher('short', { outs: QUALIFYING_OUTS - 3, R: 1 })]),
   club('early', '2026-01-01', [batter('steady', { H: 160 }), batter('tie-early', { HR: 40 })], [pitcher('ok', { R: 90 })])
  ]);
  const avg = groups.batting.find(board => board.id === 'avg')!;
  // A .600 hitter below the PA minimum stays off the rate board.
  expect(avg.leaders.map(leader => leader.seasonId)).not.toContain('hot');
  expect(avg.leaders[0].seasonId).toBe('steady');
  const hr = groups.batting.find(board => board.id === 'hr')!;
  expect(hr.leaders.slice(0, 2).map(leader => leader.seasonId)).toEqual(['tie-early', 'tie-late']);
  const ra9 = groups.pitching.find(board => board.id === 'ra9')!;
  expect(ra9.leaders.map(leader => leader.seasonId)).toEqual(['ace', 'ok']);
  expect(ra9.leaders[0].display).toBe('1.80');
 });

 it('totals a club from its saved lines', () => {
  const totals = teamTotals(club('k', '2026-01-01', [batter('a'), batter('b', { HR: 10 })], [pitcher('p')]));
  expect(totals).toMatchObject({ HR: 30, SO: 200, runDifferential: 100 });
  expect(totals.avg).toBeCloseTo(0.3);
 });
});

function memory() {
 const store = new Map<string, string>();
 return { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); }, removeItem: (key: string) => { store.delete(key); } };
}
const record = (id: string, a: string, b: string, champion: string): SeriesRecord => ({
 id, playedAt: '2026-01-01', link: '/h2h#a=x&b=y',
 teams: [{ libraryKey: a, name: a, seed: 1, wins: champion === a ? 3 : 1 }, { libraryKey: b, name: b, seed: 2, wins: champion === b ? 3 : 1 }],
 championKey: champion
});

describe('head-to-head history', () => {
 it('keeps a replayed series once and tallies each club', () => {
  const storage = memory();
  recordSeries(storage, record('ab', 'a', 'b', 'a'));
  recordSeries(storage, record('ac', 'a', 'c', 'c'));
  recordSeries(storage, record('ab', 'a', 'b', 'a'));
  const history = loadSeriesHistory(storage);
  expect(history.map(item => item.id)).toEqual(['ab', 'ac']);
  expect(seriesTally(history, 'a')).toEqual({ won: 1, lost: 1 });
  expect(seriesTally(history, 'b')).toEqual({ won: 0, lost: 1 });
  expect(seriesBetween(history, 'c', 'a').map(item => item.id)).toEqual(['ac']);
 });
});
