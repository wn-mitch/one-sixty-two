import { definePlate } from './plate.ts';

/** Crackle: a crazed lacquer over the metal, broken into small irregular plates by fine cracks that catch the light at their edges. */
export default definePlate({
	name: 'crackle',
	feature: 0.1,
	params: {
		density: { value: 7, min: 2, max: 24, step: 0.1, note: 'Plates per card unit.' },
		crack: { value: 0.06, min: 0.01, max: 0.3, step: 0.005, note: 'Width of the cracks.' },
		lift: { value: 0.35, min: 0, max: 1, step: 0.01, note: 'How far each plate tips up from the cracks.' }
	},
	height: `
	vec2 q = p * density;
	vec2 cell = floor(q);
	float nearest = 8.0;
	float second = 8.0;
	vec2 id = vec2(0.0);
	for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
		vec2 c = cell + vec2(float(i), float(j));
		float d = length(q - c - hash2(c));
		if (d < nearest) { second = nearest; nearest = d; id = c; }
		else if (d < second) second = d;
	}
	float edge = smoothstep(0.0, crack, second - nearest);
	// Each plate tilts a little its own way, so neighbours shine at different angles.
	vec2 lean = hash2(id + 5.0) - 0.5;
	return edge * (0.6 + dot(lean, q - id - hash2(id)) * lift);
`
});
