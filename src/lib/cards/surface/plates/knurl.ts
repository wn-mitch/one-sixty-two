import { definePlate } from './plate.ts';

/** Knurl: two crossing families of diagonal grooves leave a field of little pyramids. */
export default definePlate({
	name: 'knurl',
	feature: 0.088,
	params: {
		pitch: { value: 8, min: 1, max: 40, step: 0.1, note: 'Grooves per card unit; higher cuts smaller pyramids.' },
		skew: { value: 1, min: 0.1, max: 5, step: 0.01, note: 'How steeply the grooves run; 1 crosses them square, others stretch the pyramids into diamonds.' },
		crown: { value: 1, min: 0.05, max: 1, step: 0.01, note: 'Flattens the pyramid tips into plateaus below 1.' }
	},
	height: `
	vec2 q = vec2(p.x + p.y * skew, p.x - p.y * skew) * pitch;
	vec2 f = abs(fract(q) - 0.5);
	return min(min(f.x, f.y) * 2.0, crown);
`
});
