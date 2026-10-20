import { describe, expect, it } from 'vitest';
import { createDailyDraft, createDraft, selectHomeStadium } from '../game/draft.ts';
import { dailyStandings, submitDaily } from './daily-standings.ts';
import { complete, d1, DATE, manifest, NOON, record, setup, stored, token } from './daily-test-fixtures.ts';

describe('daily standings', () => {
	it('ranks each device by wins with ties sharing the better rank, and counts each device once', async () => {
		const { bindings } = setup();
		const replay = await stored(bindings, complete(createDailyDraft(manifest, DATE), 0));
		await submitDaily(bindings, DATE, { replayId: replay, token: token(1), record: record(120) }, NOON);
		await submitDaily(bindings, DATE, { replayId: replay, token: token(2), record: record(130) }, NOON);
		const tied = await submitDaily(bindings, DATE, { replayId: replay, token: token(3), record: record(130) }, NOON);
		expect(tied).toMatchObject({ rank: 1, total: 3, topPercent: 34 });
		// A repeat keeps the device's first record and standing.
		const repeat = await submitDaily(bindings, DATE, { replayId: replay, token: token(1), record: record(150) }, NOON);
		expect(repeat).toMatchObject({ rank: 3, total: 3, topPercent: 100, record: record(120) });
		const day = await dailyStandings(bindings, DATE, 125, NOON);
		expect(day).toMatchObject({ total: 3, distribution: [[130, 2], [120, 1]], standing: { rank: 3, total: 4 }, final: false });
	});

	it('takes only a live daily\'s own replay with a full-season record', async () => {
		const { bindings } = setup();
		const daily = await stored(bindings, complete(createDailyDraft(manifest, DATE), 1));
		const classic = await stored(bindings, complete(selectHomeStadium(createDraft(manifest, 7), manifest, manifest.stadiums[0].ref.id), 1));
		const reject = (date: string, body: unknown, now = NOON) => submitDaily(bindings, date, body, now).then(() => 200, (error: { status: number }) => error.status);
		expect(await reject(DATE, { replayId: classic, token: token(1), record: record(100) })).toBe(409);
		expect(await reject(DATE, { replayId: daily, token: token(1), record: { ...record(100), losses: 61 } })).toBe(400);
		expect(await reject(DATE, { replayId: daily, token: 'short', record: record(100) })).toBe(400);
		expect(await reject(DATE, { replayId: 'b'.repeat(22), token: token(1), record: record(100) })).toBe(404);
		// 1:30 a.m. the next New York day is inside the two-hour grace; 2:30 a.m. is not.
		expect(await reject(DATE, { replayId: daily, token: token(1), record: record(100) }, new Date('2026-10-21T05:30:00Z'))).toBe(200);
		expect(await reject(DATE, { replayId: daily, token: token(2), record: record(100) }, new Date('2026-10-21T06:30:00Z'))).toBe(410);
		expect(await reject('2026-10-21', { replayId: daily, token: token(3), record: record(100) })).toBe(410);
	});

	it('leaves banned devices and other data versions out of everyone else\'s numbers', async () => {
		const { sqlite, bindings } = setup();
		const replay = await stored(bindings, complete(createDailyDraft(manifest, DATE), 2));
		for (const [n, wins] of [[1, 110], [2, 140], [3, 150]] as const) await submitDaily(bindings, DATE, { replayId: replay, token: token(n), record: record(wins) }, NOON);
		const device3 = (sqlite.prepare('SELECT device FROM daily_submissions WHERE wins = 150').get() as { device: string }).device;
		sqlite.prepare('INSERT INTO devices (device, banned_at) VALUES (?, ?)').run(device3, NOON.toISOString());
		sqlite.prepare("UPDATE daily_submissions SET data_version = 'old' WHERE wins = 110").run();
		expect(await dailyStandings(bindings, DATE, null, NOON)).toMatchObject({ total: 1, distribution: [[140, 1]] });
		// The banned device still sees its own run placed among the counted ones.
		expect(await submitDaily(bindings, DATE, { replayId: replay, token: token(3), record: record(150) }, NOON)).toMatchObject({ rank: 1, total: 2 });
	});

	it('closes a day after its grace period and deletes rows past retention', async () => {
		const { sqlite, bindings } = setup();
		const replay = await stored(bindings, complete(createDailyDraft(manifest, DATE), 3));
		await submitDaily(bindings, DATE, { replayId: replay, token: token(1), record: record(120) }, NOON);
		sqlite.prepare("UPDATE daily_submissions SET date = '2026-07-01'").run();
		await submitDaily(bindings, DATE, { replayId: replay, token: token(2), record: record(125) }, NOON);
		expect(sqlite.prepare('SELECT date FROM daily_submissions').all()).toEqual([{ date: DATE }]);
		expect((await dailyStandings(bindings, '2026-10-19', null, NOON)).final).toBe(true);
		expect((await dailyStandings(bindings, DATE, null, NOON)).final).toBe(false);
		await expect(dailyStandings(bindings, '2026-10-21', null, NOON)).rejects.toMatchObject({ status: 404 });
	});

	it('applies its schema once per database, even from a second isolate', async () => {
		const { sqlite, bindings } = setup();
		const replay = await stored(bindings, complete(createDailyDraft(manifest, DATE), 4));
		await submitDaily(bindings, DATE, { replayId: replay, token: token(1), record: record(120) }, NOON);
		const second = { ...bindings, DAILY: d1(sqlite) };
		expect(await dailyStandings(second, DATE, null, NOON)).toMatchObject({ total: 1 });
		expect(sqlite.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 1 }, { version: 2 }]);
	});
});
