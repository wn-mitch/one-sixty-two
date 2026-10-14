import { definePlate } from './plate.ts';

/**
 * Perlage: engine turning, the overlapping spun circles machinists polish into watch plates and dashboards. Each
 * circle is a tiny spun disc whose rings catch the light, laid in rows that overlap like fish scales.
 */
export default definePlate({
	name: 'perlage',
	feature: 0.16,
	params: {
		spots: { value: 2.6, min: 1, max: 14, step: 0.1, note: 'Circles per card unit.' },
		overlap: { value: 0.72, min: 0.4, max: 1, step: 0.01, note: 'Spacing of the rows against the circle size; lower overlaps more.' },
		rings: { value: 3.5, min: 2, max: 30, step: 0.5, note: 'Spun rings inside each circle.' }
	},
	height: `
	vec2 q = p * spots;
	// Each circle is pressed after the one before it, so the latest circle in reading order covers the earlier ones.
	float height = 0.0;
	for (int j = 0; j <= 1; j++) for (int i = 0; i <= 1; i++) {
		vec2 cell = floor(q / overlap) - vec2(float(i), float(j));
		vec2 centre = (cell + 0.5) * overlap;
		vec2 d = q - centre;
		float r = length(d);
		if (r < 0.5) height = 0.5 + 0.5 * sin(r * rings * 6.28318 + atan(d.y, d.x) * 2.0);
	}
	return height;
`
});
