import { definePlate } from './plate.ts';

/** Guilloche: two families of engraved wavy lines, out of phase so they cross and weave, the banknote lathe pattern. */
export default definePlate({
	name: 'guilloche',
	feature: 0.14,
	params: {
		lines: { value: 7, min: 1, max: 30, step: 0.1, note: 'Engraved lines per card unit in each family.' },
		waves: { value: 3.1, min: 0, max: 20, step: 0.01, note: 'How often the lines wave across the card.' },
		swing: { value: 0.11, min: 0, max: 0.6, step: 0.001, note: 'How far the lines swing up and down.' },
		offset: { value: 1.2, min: 0, max: 6.28318, step: 0.01, note: 'Phase between the two families; 0 lays them on top of each other.' },
		sharp: { value: 6, min: 1, max: 40, step: 0.1, note: 'How thin each engraved line is.' }
	},
	height: `
	float a = (p.y + swing * sin(p.x * waves)) * lines;
	float b = (p.y - swing * sin(p.x * waves + offset)) * lines;
	return pow(0.5 + 0.5 * cos(6.28318 * a), sharp) + pow(0.5 + 0.5 * cos(6.28318 * b), sharp);
`
});
