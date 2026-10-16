import { describe, expect, it } from 'vitest';
import { fieldColor } from './logo-field.ts';

/** A width×height RGBA image filled by `paint(x, y)`. */
function image(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
	return data;
}
const navy: [number, number, number, number] = [19, 39, 79, 255];
const white: [number, number, number, number] = [255, 255, 255, 255];
const clear: [number, number, number, number] = [0, 0, 0, 0];

describe('team mark field', () => {
	it('reads a solid square field behind centred art', () => {
		const data = image(40, 40, (x, y) => x > 10 && x < 30 && y > 10 && y < 30 ? white : navy);
		expect(fieldColor(data, 40, 40)).toBe('rgb(19 39 79)');
	});

	it('ignores fringe pixels at the very edge', () => {
		const data = image(40, 40, (x, y) => x < 2 || y < 2 || x > 37 || y > 37 ? white : navy);
		expect(fieldColor(data, 40, 40)).toBe('rgb(19 39 79)');
	});

	it('finds no field on transparency or on a roundel whose corners are clear', () => {
		expect(fieldColor(image(40, 40, () => clear), 40, 40)).toBeNull();
		const roundel = image(40, 40, (x, y) => (x - 19.5) ** 2 + (y - 19.5) ** 2 <= 400 ? navy : clear);
		expect(fieldColor(roundel, 40, 40)).toBeNull();
	});

	it('finds no field when art runs off a side', () => {
		const data = image(40, 40, x => x < 20 ? navy : white);
		expect(fieldColor(data, 40, 40)).toBeNull();
	});

});
