import { describe, expect, it } from 'vitest';
import { applies, eraPreset, parseSetup, spread, START, valueOf, withValue } from './controls.ts';
import { sceneOf } from './scene.ts';
import { DEFAULT_CUSTOM_GRADIENT } from '#lib/cards/surface/palettes/custom.ts';

describe('foil lab controls', () => {
	it('shows plate controls on holo only once the plate presses through the film', () => {
		const holo = { ...START, tier: 'gem' as const };
		expect(applies('plate', holo)).toBe(false);
		expect(applies('light:plateDepth', holo)).toBe(false);
		expect(applies('plate', withValue(holo, 'light:plateUnderFilm', 0.5))).toBe(true);
		expect(applies('film', { ...START, tier: 'foil' })).toBe(false);
	});

	it('shows tone and stain only on plates that read them', () => {
		const silver = { ...START, tier: 'foil' as const };
		expect(applies('light:stain', { ...silver, plate: 'brushed' })).toBe(false);
		expect(applies('light:stain', { ...silver, plate: 'stain' })).toBe(true);
		expect(applies('light:plateTone', { ...silver, plate: 'brushed' })).toBe(false);
		expect(applies('light:plateTone', { ...silver, plate: 'damascus' })).toBe(true);
		expect(applies('light:underMix', { ...START, film: 'galaxy', under: '' })).toBe(false);
		// Circuit prints over its own spun film unless the setup says none.
		expect(applies('light:underMix', { ...START, film: 'circuit', under: '' })).toBe(true);
		expect(applies('light:underMix', { ...START, film: 'circuit', under: 'none' })).toBe(false);
	});

	it('spreads a dial across its range on its step and keeps the shipped value', () => {
		const values = spread({ value: 0.35, min: 0, max: 3, step: 0.05 }, 7);
		expect(values).toContain(0.35);
		expect(values[0]).toBe(0);
		expect(values.at(-1)).toBe(3);
		expect(values.every(value => Math.abs(value / 0.05 - Math.round(value / 0.05)) < 1e-6)).toBe(true);
	});

	it('tunes the module in use and hands the engine those values', () => {
		const setup = withValue({ ...START, film: 'carpet' }, 'film:ground', 0.4);
		expect(valueOf('film:ground', setup)).toBe(0.4);
		expect(valueOf('film:ground', { ...setup, film: 'dollar' })).not.toBe(0.4);
		const scene = sceneOf(setup);
		expect(scene.light.filmTune?.values).toContain(0.4);
	});

	it('restores the shipped film instead of retaining earlier lab tuning', () => {
		const dirty = withValue({ ...START, film: 'double-helix' }, 'film:slideWithTilt', 3);
		const preset = eraPreset(dirty, '2000s');
		expect(valueOf('film:slideWithTilt', preset)).toBe(0);
		expect(dirty.tuned['film:double-helix']?.slideWithTilt).toBe(3);
	});

	it('drops link choices it no longer understands', () => {
		const parsed = parseSetup({ film: 'lava-lamp', tier: 'platinum' as never, era: '1990s' });
		expect(parsed).toMatchObject({ film: START.film, tier: START.tier, era: '1990s' });
	});

	it('validates saved gradients and passes custom stops to the scene only when selected', () => {
		const gradient = ['#123456', '#abcdef', '#789abc'];
		const custom = parseSetup({ ...START, palette: 'custom', gradient });
		expect(custom.gradient).toEqual(gradient);
		expect(sceneOf(custom).light.customGradient).toEqual(gradient);
		expect(sceneOf({ ...custom, palette: 'sunset' }).light.customGradient).toBeNull();
		expect(parseSetup({ ...START, palette: 'custom', gradient: ['#123456'] }).gradient).toEqual(DEFAULT_CUSTOM_GRADIENT);
	});
});

describe('foil lab links', () => {
	it('round-trips the whole lab state through a link fragment', async () => {
		const { decodeLink, encodeLink } = await import('./link.ts');
		const setup = withValue({ ...START, film: 'julia', relief: 'star' as const, drift: false }, 'light:spotlight', 0.5);
		const state = { setup, stagger: { target: 'film:speed', count: 4, page: 0 }, width: 480 };
		expect(decodeLink(encodeLink(state))).toEqual(state);
	});

	it('opens the standalone toy links as a foil sheet', async () => {
		const { decodeLink } = await import('./link.ts');
		const toy = { sheet: 'gold', film: 'mojo', finish: '', palette: 'aurora', plate: 'damascus', relief: 'star', drift: false, light: { shine: 3 }, tuned: { 'plate:damascus': { scale: 2 } } };
		const state = decodeLink(btoa(JSON.stringify(toy)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''));
		expect(state?.setup).toMatchObject({ print: 'sheet', tier: 'emboss', relief: 'star', film: 'mojo', palette: 'aurora', plate: 'damascus', drift: false, tuned: { 'plate:damascus': { scale: 2 } } });
		// The toy lit its card with a 0.35 spotlight unless its dial said otherwise.
		expect(state?.setup.light).toEqual({ shine: 3, spotlight: 0.35 });
		expect(decodeLink('not-json')).toBeNull();
	});
});
