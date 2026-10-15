import { describe, expect, it } from 'vitest';
import {
	DEFAULT_CUSTOM_GRADIENT, gradientUniforms, isGradient, normalizeGradient, sampleGradient
} from './custom.ts';

describe('custom holo gradients', () => {
	it('accepts only two to five complete RGB hex stops', () => {
		expect(isGradient(['#123456', '#ABCDEF'])).toBe(true);
		expect(isGradient(['#123456'])).toBe(false);
		expect(isGradient(['#123456', '#abcdef', '#234567', '#345678', '#456789', '#56789a'])).toBe(false);
		expect(isGradient(['#123456', '#abcd'])).toBe(false);
		expect(normalizeGradient(['#123456'])).toEqual(DEFAULT_CUSTOM_GRADIENT);
		expect(normalizeGradient(['#123456', '#ABCDEF'])).toEqual(['#123456', '#ABCDEF']);
	});

	it('interpolates evenly spaced stops in linear RGB', () => {

		const twoStops = sampleGradient(['#204060', '#6080a0'], 0.5);
		const threeStops = sampleGradient(['#204060', '#406080', '#80a0c0'], 0.5);
		const expected = [64 / 255, 96 / 255, 128 / 255];
		expected.forEach((channel, index) => {
			expect(twoStops[index]).toBeCloseTo(channel);
			expect(threeStops[index]).toBeCloseTo(channel);
		});
	});

	it('packs immutable gradients once into the fixed shader uniform', () => {
		const stops = ['#204060', '#6080a0'] as const;
		const first = gradientUniforms(stops);
		expect(gradientUniforms(stops)).toBe(first);
		expect(first.count).toBe(2);
		const packed = [...first.colors.slice(0, 6)];
		const expected = [32 / 255, 64 / 255, 96 / 255, 96 / 255, 128 / 255, 160 / 255];
		expected.forEach((channel, index) => expect(packed[index]).toBeCloseTo(channel));
	});
});
