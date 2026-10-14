import { describe, expect, it } from 'vitest';
import type { Finish } from '../finish.ts';
import type { CardEra } from '../era.ts';
import { bevelEdge, resolveLength } from './surface-map.ts';
import { DEFAULT_TUNING, inkImpression, RELIEF_RANGE, SURFACE_KINDS, stockFor, surfaceFor } from './surfaces.ts';

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

	it('prints stat numbers on Base and Silver and foils them in colour from Gold up', () => {
		const stock = stockFor('1970s');
		expect(surfaceFor('stat', 'base', stock).metal).toBe(0);
		expect(surfaceFor('stat', 'foil', stock).metal).toBe(0);
		expect(surfaceFor('stat', 'emboss', stock)).toMatchObject({ metal: 1, iridescence: 0 });
		expect(surfaceFor('stat', 'emboss', stock).silver).toBeUndefined();
		expect(surfaceFor('stat', 'gem', stock).metal).toBe(1);
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

	it('prints the club name as ink on Base and foil-stamps it from Foil up', () => {
		const stock = stockFor('1990s');
		expect(surfaceFor('team', 'base', stock)).toEqual(surfaceFor('ink', 'base', stock));
		for (const tier of ['foil', 'emboss', 'gem'] as const) expect(surfaceFor('team', tier, stock).metal).toBe(1);
		expect(surfaceFor('team', 'gem', stock).iridescence).toBeGreaterThan(0);
	});

	it('foils the mark from the tuned tier, raising it only from Foil + emboss', () => {
		const stock = stockFor('1970s');
		const tuning = { ...DEFAULT_TUNING, markFoil: 'foil' as const, markMetal: 0.8 };
		expect(surfaceFor('mark', 'base', stock, tuning)).toEqual(stock);
		expect(surfaceFor('mark', 'foil', stock, tuning)).toMatchObject({ metal: 0.8 });
		expect(surfaceFor('mark', 'foil', stock, tuning).height).toBeLessThanOrEqual(0);
		expect(surfaceFor('mark', 'emboss', stock, tuning).height).toBeGreaterThan(0);
		expect(surfaceFor('mark', 'emboss', stock, { ...tuning, markFoil: 'off' }).metal).toBe(stock.metal);
	});

	it('foil-stamps the 162-0 mark on every tier in the card\'s foil, silver on Base', () => {
		const stock = stockFor('1980s');
		expect(surfaceFor('brand', 'base', stock)).toMatchObject({ metal: 1, silver: 1, iridescence: 0 });
		expect(surfaceFor('brand', 'emboss', stock)).toMatchObject({ metal: 1, silver: 0 });
		expect(surfaceFor('brand', 'gem', stock).iridescence).toBeGreaterThan(0);
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

describe('bevelEdge', () => {
	it('rounds the cut edge down over the bevel and leaves the face inside it untouched', () => {
		const width = 40, height = 56, level = 200;
		const data = new Uint8Array(width * height * 4).fill(level);
		bevelEdge(data, width, height, 2, 4);
		const at = (x: number, y: number) => data[(y * width + x) * 4]!;
		// Down the left edge, height climbs back to the printed level by the bevel's inner side.
		const row = [0, 1, 2, 3, 4, 5].map(x => at(x, 28));
		expect(row[0]).toBeLessThan(row[1]!);
		expect(row[1]).toBeLessThan(row[3]!);
		expect(row[4]).toBe(level);
		expect(at(20, 28)).toBe(level);
		// Only height moves: metal, gloss and iridescence keep what was printed.
		expect(data[(28 * width) * 4 + 1]).toBe(level);
		// The rounded corner is lower than the middle of an edge at the same inset.
		expect(at(0, 0)).toBeLessThanOrEqual(at(0, 28));
	});
});
