import { definePlate } from './plate.ts';

/** Pinstripe: fine laser-etched parallel lines running on a diagonal. */
export default definePlate({
	name: 'pinstripe',
	feature: 0.11,
	params: {
		pitch: { value: 8, min: 1, max: 40, step: 0.1, note: 'Stripes per card unit.' },
		lean: { value: 0.6, min: -3, max: 3, step: 0.01, note: 'How far the stripes lean off horizontal; 0 is flat, negative leans the other way.' },
		sharp: { value: 6, min: 1, max: 40, step: 0.1, note: 'How thin each etched line is.' }
	},
	height: `
	return pow(0.5 + 0.5 * cos(6.28318 * (p.x * lean + p.y) * pitch), sharp);
`
});
