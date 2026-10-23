import { describe, expect, it } from 'vitest';
import { createDailyDraft, createDraft, selectHomeStadium } from '../game/draft.ts';
import { placeAmong, winsAtShare } from '../game/win-distribution.ts';
import { stadiumStandings, stadiumSummaries, submitStadiumRun } from './stadium-standings.ts';
import { complete, DATE, manifest, NOON, setup, stored, token } from './daily-test-fixtures.ts';

const [park, other] = manifest.stadiums.map(stadium => stadium.ref.id);
const classic = (stadium: string, seed: number, offset = 0) => complete(selectHomeStadium(createDraft(manifest, seed), manifest, stadium), offset);

describe('stadium standings', () => {
	it('counts every own run at its park once, ranking ties to the better place', async () => {
		const { bindings } = setup();
		const [a, b, c] = await Promise.all([1, 2, 3].map(seed => stored(bindings, classic(park, seed))));
		await submitStadiumRun(bindings, { replayId: a, token: token(1), wins: 120 }, NOON);
		// A second run by the same device counts too; it is a different season.
		await submitStadiumRun(bindings, { replayId: b, token: token(1), wins: 130 }, NOON);
		const tied = await submitStadiumRun(bindings, { replayId: c, token: token(2), wins: 130 }, NOON);
		expect(tied).toMatchObject({ stadium: park, total: 3, distribution: [[130, 2], [120, 1]], standing: { rank: 1, total: 3, topPercent: 34 } });
		// Resubmitting the same replay is a retry, not another run, even with a different claimed record.
		const retry = await submitStadiumRun(bindings, { replayId: a, token: token(1), wins: 150 }, NOON);
		expect(retry).toMatchObject({ total: 3, distribution: [[130, 2], [120, 1]] });
		expect((await stadiumStandings(bindings, other, 100)).total).toBe(0);
	});

	it('takes the park from the replay, so a daily run counts toward its day\'s park', async () => {
		const { bindings } = setup();
		const daily = createDailyDraft(manifest, DATE);
		const replay = await stored(bindings, complete(daily, 0));
		await submitStadiumRun(bindings, { replayId: replay, token: token(1), wins: 111 }, NOON);
		expect(await stadiumStandings(bindings, daily.homeStadium!.id, null)).toMatchObject({ total: 1, distribution: [[111, 1]] });
	});

	it('refuses malformed submissions and unknown replays', async () => {
		const { bindings } = setup();
		const replay = await stored(bindings, classic(park, 4));
		const status = (body: unknown) => submitStadiumRun(bindings, body, NOON).then(() => 200, (error: { status: number }) => error.status);
		expect(await status({ replayId: replay, token: token(1), wins: 163 })).toBe(400);
		expect(await status({ replayId: replay, token: token(1), wins: 99.5 })).toBe(400);
		expect(await status({ replayId: replay, token: 'short', wins: 99 })).toBe(400);
		expect(await status({ replayId: 'b'.repeat(22), token: token(1), wins: 99 })).toBe(404);
		await expect(stadiumStandings(bindings, '../etc', null)).rejects.toMatchObject({ status: 404 });
	});

	it('starts over on a new model or park layout and leaves banned devices out', async () => {
		const { sqlite, bindings } = setup();
		const replays = await Promise.all([5, 6, 7, 8].map(seed => stored(bindings, classic(park, seed))));
		for (const [n, wins] of [100, 110, 120, 140].entries()) await submitStadiumRun(bindings, { replayId: replays[n], token: token(n + 1), wins }, NOON);
		sqlite.prepare("UPDATE stadium_runs SET model_version = 'old' WHERE wins = 100").run();
		sqlite.prepare("UPDATE stadium_runs SET stadium_version = 'old-layout', submitted_at = '2026-10-01T00:00:00Z' WHERE wins = 110").run();
		const banned = (sqlite.prepare('SELECT device FROM stadium_runs WHERE wins = 140').get() as { device: string }).device;
		sqlite.prepare('INSERT INTO devices (device, banned_at) VALUES (?, ?)').run(banned, NOON.toISOString());
		expect(await stadiumStandings(bindings, park, null)).toMatchObject({ total: 1, distribution: [[120, 1]] });
		expect(await stadiumSummaries(bindings)).toEqual([{ stadium: park, total: 1, typical: 120, top10: 120, distribution: [[120, 1]] }]);
	});

	it('deletes runs past retention', async () => {
		const { sqlite, bindings } = setup();
		const [a, b] = await Promise.all([9, 10].map(seed => stored(bindings, classic(park, seed))));
		await submitStadiumRun(bindings, { replayId: a, token: token(1), wins: 101 }, new Date('2026-06-01T00:00:00Z'));
		await submitStadiumRun(bindings, { replayId: b, token: token(1), wins: 102 }, NOON);
		expect(sqlite.prepare('SELECT wins FROM stadium_runs').all()).toEqual([{ wins: 102 }]);
	});
});

describe('win distribution', () => {
	const spread: [number, number][] = [[90, 5], [100, 3], [110, 1], [120, 1]];
	it('reads the median and top-10% line by nearest rank from the top', () => {
		expect(winsAtShare(spread, 0.5)).toBe(100);
		expect(winsAtShare(spread, 0.6)).toBe(90);
		expect(winsAtShare(spread, 0.1)).toBe(120);
		expect(winsAtShare(spread, 0.2)).toBe(110);
		expect(winsAtShare([], 0.5)).toBeNull();
	});
	it('places an uncounted run among the others without displacing ties', () => {
		expect(placeAmong(spread, 100)).toEqual({ rank: 3, total: 10, topPercent: 30 });
		expect(placeAmong(spread, 105)).toEqual({ rank: 3, total: 11, topPercent: 28 });
		expect(placeAmong([], 80)).toEqual({ rank: 1, total: 1, topPercent: 100 });
	});
});
