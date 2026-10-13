import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKELETON_HOLD, skeletonSettled, skeletonShown } from './hold.ts';

async function settledAfter(ms: number): Promise<boolean> {
	let done = false;
	void skeletonSettled().then(() => { done = true; });
	await vi.advanceTimersByTimeAsync(ms);
	return done;
}

describe('skeleton hold', () => {
	beforeEach(() => { vi.useFakeTimers(); });
	afterEach(() => { vi.useRealTimers(); });

	it('lets a screen replace no skeleton at once', async () => {
		expect(await settledAfter(0)).toBe(true);
	});

	it('keeps a shown skeleton up for the rest of the hold, measured from when it appeared', async () => {
		const release = skeletonShown();
		await vi.advanceTimersByTimeAsync(100);
		expect(await settledAfter(SKELETON_HOLD - 101)).toBe(false);
		expect(await settledAfter(2)).toBe(true);
		release();
	});

	it('measures from the first of overlapping skeletons and clears only when the last leaves', async () => {
		const first = skeletonShown();
		await vi.advanceTimersByTimeAsync(SKELETON_HOLD - 50);
		const second = skeletonShown();
		first();
		// The second skeleton does not restart the hold the first already served.
		expect(await settledAfter(60)).toBe(true);
		second();
		second();
		expect(await settledAfter(0)).toBe(true);
		const third = skeletonShown();
		expect(await settledAfter(0)).toBe(false);
		third();
	});
});
