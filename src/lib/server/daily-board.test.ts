import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDailyDraft } from '../game/draft.ts';
import type { Draft, Replay } from '../game/types.ts';
import { BOARD_SIZE, dailyBoard, reportName, verifyBoard } from './daily-board.ts';
import { submitDaily, type DailyBindings, type DailyRecord } from './daily-standings.ts';
import { complete, DATE, manifest, NOON, record, setup, stored, token } from './daily-test-fixtures.ts';

/** What each stored replay really plays to, keyed by its picks and batting order; recomputing a replay not listed fails as data loss. */
const truth = new Map<string, DailyRecord>();
const keyOf = (replay: Pick<Replay, 'picks' | 'battingOrder'>) => JSON.stringify([replay.picks, replay.battingOrder]);

vi.mock('./daily-verify.ts', async original => ({
	...await original<typeof import('./daily-verify.ts')>(),
	recomputeReplay: vi.fn(async (_assets: unknown, replay: Replay) => {
		const known = truth.get(keyOf(replay));
		if (!known) throw new Error('Simulation data could not be loaded');
		return { record: known, rosterKey: keyOf(replay) };
	})
}));

beforeEach(() => { truth.clear(); used.clear(); });

/**
 * A completed daily no other run in the test has used. The synthetic pool offers one card per roll, so every
 * daily drafts the same picks; rotating the batting order makes a different roster key.
 */
function unused(): Draft {
	const base = complete(createDailyDraft(manifest, DATE), 0);
	for (let turn = 0; turn < base.battingOrder.length; turn++) {
		const draft = { ...base, battingOrder: [...base.battingOrder.slice(turn), ...base.battingOrder.slice(0, turn)] };
		if (!used.has(keyOf(draft))) { used.add(keyOf(draft)); return draft; }
	}
	throw new Error('No unused daily roster');
}
const used = new Set<string>();

/** A daily replay with its own roster that truly plays to `wins`. */
async function honest(bindings: DailyBindings, wins: number): Promise<string> {
	const draft = unused();
	truth.set(keyOf(draft), record(wins));
	return stored(bindings, draft);
}

const at = (minutes: number) => new Date(NOON.getTime() + minutes * 60_000);
const submit = (bindings: DailyBindings, replayId: string, n: number, wins: number, extra: Record<string, unknown> = {}, now = NOON) =>
	submitDaily(bindings, DATE, { replayId, token: token(n), record: record(wins), ...extra }, now);

describe('daily board', () => {
	it('lists only runs whose replays reproduce their claims, and rejects and flags a forged record', async () => {
		const { sqlite, bindings } = setup();
		await submit(bindings, await honest(bindings, 120), 1, 120, { name: 'Glass Arm' });
		await submit(bindings, await honest(bindings, 100), 2, 162);
		await submit(bindings, await honest(bindings, 110), 3, 110);
		// Unverified runs never show, however high they claim.
		expect((await dailyBoard(bindings, DATE)).board).toEqual([]);

		expect(await verifyBoard(bindings, DATE, 10, NOON)).toBe(3);
		const { board, checkedAt } = await dailyBoard(bindings, DATE);
		expect(board.map(row => [row.name, row.wins, row.runDiff])).toEqual([['Glass Arm', 120, 300], [null, 110, 300]]);
		expect(checkedAt).toBe(NOON.toISOString());
		expect(sqlite.prepare("SELECT d.flags FROM devices d JOIN daily_submissions s USING (device) WHERE s.status = 'rejected'").all()).toEqual([{ flags: 1 }]);
		// A rejected run leaves everyone's counts; nothing is left to check.
		expect(await verifyBoard(bindings, DATE, 10, NOON)).toBe(0);
	});

	it('checks only runs that could reach the board, best claim first', async () => {
		const day = async () => {
			const { sqlite, bindings } = setup();
			const replay = await honest(bindings, 100);
			for (let n = 1; n <= BOARD_SIZE + 1; n++) await submit(bindings, replay, n, 74 + n);
			return { bindings, unverified: () => sqlite.prepare("SELECT wins FROM daily_submissions WHERE status = 'unverified' ORDER BY wins DESC").all().map(row => row.wins) };
		};
		const few = await day();
		expect(await verifyBoard(few.bindings, DATE, 2, NOON)).toBe(2);
		expect((few.unverified()).slice(0, 1)).toEqual([98]);
		const all = await day();
		expect(await verifyBoard(all.bindings, DATE, 100, NOON)).toBe(BOARD_SIZE);
		// The lowest claim ranked 26th, below the board.
		expect(all.unverified()).toEqual([75]);
	});

	it('skips a run another request is checking, retakes an abandoned claim, and releases its claim when data fails', async () => {
		const { sqlite, bindings } = setup();
		await submit(bindings, await honest(bindings, 120), 1, 120);
		sqlite.prepare('UPDATE daily_submissions SET verifying_at = ?').run(at(-1).toISOString());
		expect(await verifyBoard(bindings, DATE, 10, NOON)).toBe(0);
		expect(await verifyBoard(bindings, DATE, 10, at(5))).toBe(1);

		await submit(bindings, await stored(bindings, unused()), 2, 130);
		await expect(verifyBoard(bindings, DATE, 10, at(6))).rejects.toThrow('could not be loaded');
		expect(sqlite.prepare('SELECT status, verifying_at FROM daily_submissions WHERE wins = 130').get()).toEqual({ status: 'unverified', verifying_at: null });
	});

	it('lists an identical roster once at its earliest run, and hides held names', async () => {
		const { sqlite, bindings } = setup();
		const shared = await honest(bindings, 125);
		await submit(bindings, shared, 1, 125, { name: 'Second' }, at(2));
		await submit(bindings, shared, 2, 125, { name: 'First' }, at(1));
		await submit(bindings, await honest(bindings, 125), 3, 125, { name: 'Held' }, at(3));
		await verifyBoard(bindings, DATE, 10, at(4));
		sqlite.prepare("UPDATE daily_submissions SET name_state = 'held' WHERE name = 'Held'").run();
		const { board } = await dailyBoard(bindings, DATE);
		expect(board.map(row => [row.name, row.copies])).toEqual([['First', 2], [null, 1]]);
	});

	it('holds a name after three reports from distinct devices with counted runs that day', async () => {
		const { sqlite, bindings } = setup();
		const replay = await honest(bindings, 120);
		const { entry } = await submit(bindings, replay, 1, 120, { name: 'Reported' });
		for (const n of [2, 3, 4, 5]) await submit(bindings, replay, n, 120);
		const state = () => (sqlite.prepare('SELECT name_state FROM daily_submissions WHERE entry = ?').get(entry) as { name_state: string }).name_state;
		const report = (n: number) => reportName(bindings, DATE, { entry, token: token(n) }, NOON);
		const banned = (sqlite.prepare("SELECT device FROM daily_submissions WHERE device <> (SELECT device FROM daily_submissions WHERE entry = ?) LIMIT 1").get(entry) as { device: string }).device;
		sqlite.prepare('INSERT INTO devices (device, banned_at) VALUES (?, ?)').run(banned, NOON.toISOString());

		// Its own device, a device without a run that day, repeats and a banned device do not count.
		for (const n of [1, 9, 2, 2, 3, 3, 4, 4, 5, 5]) await report(n);
		expect(state()).toBe('held');
		expect(sqlite.prepare('SELECT COUNT(*) AS n FROM name_reports').get()).toEqual({ n: 3 });
		await expect(reportName(bindings, DATE, { entry: 'nothex', token: token(2) }, NOON)).rejects.toMatchObject({ status: 400 });
	});

	it('takes a refused name as Anonymous and lets the device try another that day, but keeps an accepted one', async () => {
		const { bindings } = setup();
		const replay = await honest(bindings, 120);
		expect(await submit(bindings, replay, 1, 120, { name: 'Admin' })).toMatchObject({ name: null, nameAccepted: false });
		expect(await submit(bindings, replay, 1, 120, { name: 'Glass Arm' })).toMatchObject({ name: 'Glass Arm', nameAccepted: true });
		expect(await submit(bindings, replay, 1, 120, { name: 'Other Name' })).toMatchObject({ name: 'Glass Arm', nameAccepted: false });
	});
});
