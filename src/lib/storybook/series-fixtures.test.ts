import { describe, expect, it, vi } from 'vitest';
import { getExampleSeries } from './series-fixtures.ts';

// The fixture plays two full regular seasons and a best-of-five.
vi.setConfig({ testTimeout: 120_000 });

describe('example series fixture', () => {
 it('plays a decided best-of-five between differently seeded clubs and lists both in the library', async () => {
  const series = await getExampleSeries();
  expect(series.result.score[series.result.championId]).toBe(3);
  const [a, b] = series.result.teams;
  expect(a.homeStadium.id).not.toBe(b.homeStadium.id);
  expect(new Set(series.result.teams.map(team => team.seed))).toEqual(new Set([1, 2]));
  expect(series.library.map(entry => entry.status)).toEqual(['playable', 'playable', 'retired']);
  // Library lines come from the same regular season the series replayed for seeding.
  expect(series.library[0].record).toEqual(a.record);
  expect(series.library[1].record).toEqual(b.record);
  expect(series.library[0].batting).toHaveLength(9);
  // The recorded series is keyed to both library clubs, so their tallies can find it.
  expect(series.history[0].teams.map(side => side.libraryKey)).toEqual([series.library[0].key, series.library[1].key]);
  expect(series.history[0].championKey).toBe(series.library[a.id === series.result.championId ? 0 : 1].key);
 });
});
