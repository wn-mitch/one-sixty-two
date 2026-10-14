import { definePlate } from './plate.ts';

/** Hammered: overlapping round dents scattered over a grid, deepest at their centres and flat where they meet. */
export default definePlate({
	name: 'hammered',
	feature: 0.2,
	params: {
		dents: { value: 5, min: 1, max: 20, step: 0.1, note: 'Dents per card unit; higher packs in more, smaller blows.' },
		scatter: { value: 1, min: 0, max: 1, step: 0.01, note: 'How far each dent wanders from its grid cell; 0 lines them up in rows.' },
		rim: { value: 0.8, min: 0.1, max: 1.5, step: 0.01, note: 'How far a dent spreads before the metal flattens; low leaves flat land between small dents.' }
	},
	height: `
	vec2 q = p * dents;
	vec2 cell = floor(q);
	float nearest = 2.0;
	for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
		vec2 c = cell + vec2(float(i), float(j));
		nearest = min(nearest, length(q - c - hash2(c) * scatter));
	}
	return min(nearest, rim);
`
});
