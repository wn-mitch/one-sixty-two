import { describe, expect, it } from 'vitest';
import { holdRasterization, untilRasterAllowed } from './render.ts';

describe('capture rasterization holds', () => {
	it('waits for every hold to be released, and a repeated release does not end another hold', async () => {
		const playback = holdRasterization();
		const other = holdRasterization();
		let allowed = false;
		const waiting = untilRasterAllowed().then(() => { allowed = true; });
		playback();
		playback();
		await Promise.resolve();
		expect(allowed).toBe(false);
		other();
		await waiting;
		expect(allowed).toBe(true);
		// With no hold active, drawing may start at once.
		await expect(untilRasterAllowed()).resolves.toBeUndefined();
	});
});
