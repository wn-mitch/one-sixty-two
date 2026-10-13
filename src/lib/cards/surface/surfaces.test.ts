import { describe, expect, it } from 'vitest';
import type { Finish } from '../finish.ts';
import type { CardEra } from '../view-model.ts';
import { resolveLength } from './surface-map.ts';
import { inkImpression, RELIEF_RANGE, SURFACE_KINDS, stockFor, surfaceFor } from './surfaces.ts';

const TIERS: readonly Finish[] = ['base', 'foil', 'emboss', 'gem'];
const ERAS: readonly CardEra[] = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

describe('surfaceFor', () => {
	it('keeps printed areas of base cards flat and unfoiled, so relief and foil mark rarity', () => {
		for (const era of ERAS) {
			const stock = stockFor(era);
			for (const kind of ['name', 'mark', 'stamp', 'ink'] as const) {
				const surface = surfaceFor(kind, 'base', stock);
				expect(surface.height, `${era} ${kind}`).toBeLessThanOrEqual(0);
				expect(surface.metal, `${era} ${kind}`).toBe(stock.metal);
				expect(surface.iridescence).toBe(0);
			}
		}
	});

	it('foils the name from Foil up, raises it from Foil + emboss, and adds holo only on Gem', () => {
		const stock = stockFor('1990s');
		expect(surfaceFor('name', 'foil', stock)).toMatchObject({ metal: 1, iridescence: 0 });
		expect(surfaceFor('name', 'foil', stock).height).toBeLessThanOrEqual(0);
		expect(surfaceFor('name', 'emboss', stock).height).toBeGreaterThan(0);
		expect(surfaceFor('name', 'emboss', stock).iridescence).toBe(0);
		expect(surfaceFor('name', 'gem', stock).iridescence).toBeGreaterThan(0);
	});

	it('presses frames into the stock on every tier', () => {
		for (const tier of TIERS) expect(surfaceFor('frame', tier, stockFor('1970s')).height).toBeLessThan(0);
	});

	it('stays inside the relief range one map channel can encode', () => {
		for (const era of ERAS) for (const tier of TIERS) for (const kind of SURFACE_KINDS) {
			expect(Math.abs(surfaceFor(kind, tier, stockFor(era)).height)).toBeLessThanOrEqual(RELIEF_RANGE);
		}
	});

	it('presses ink into every stock, deepest where no coat fills the impression', () => {
		for (const era of ERAS) expect(surfaceFor('ink', 'base', stockFor(era)).height).toBeLessThan(0);
		expect(inkImpression(stockFor('1950s'))).toBeLessThan(inkImpression(stockFor('1990s')));
		expect(inkImpression(stockFor('1990s'))).toBeLessThan(inkImpression(stockFor('2020s')));
	});

	it('coats stock by era, from uncoated fiber to chrome', () => {
		const gloss = ERAS.map(era => stockFor(era).gloss);
		expect([...gloss].sort((a, b) => a - b)).toEqual(gloss);
		expect(stockFor('1950s').gloss).toBeLessThan(0.2);
		expect(stockFor('2020s').metal).toBeGreaterThan(0);
	});
});

describe('resolveLength', () => {
	it('resolves the calc() offsets clip-path polygons use for chamfered plates', () => {
		expect(resolveLength('calc(100% - 9.6px)', 200)).toBeCloseTo(190.4);
		expect(resolveLength('calc(50% + 4px)', 100)).toBeCloseTo(54);
		expect(resolveLength('25%', 80)).toBeCloseTo(20);
		expect(resolveLength('7.5px', 80)).toBeCloseTo(7.5);
	});
});
