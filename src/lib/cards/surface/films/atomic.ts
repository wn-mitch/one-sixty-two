import { defineFilm } from './film.ts';

/**
 * Atomic: the hammered plate's dents as film. Overlapping dents pack the card with no gaps, each a spun rainbow
 * around its own centre whose grooves turn outward up to the ridge where it meets its neighbours.
 */
export default defineFilm({
	name: 'atomic',
	scale: 1.125,
	params: {
		density: { value: 0.34, min: 0.05, max: 3, step: 0.01, note: 'Dents per card unit; higher hammers in smaller dents.' },
		jitter: { value: 1, min: 0, max: 1, step: 0.01, note: 'How irregular the dents are; 0 strikes them on a square grid.' },
		ridge: { value: 0.18, min: 0.005, max: 1, step: 0.005, note: 'Width of the band near each ridge where the grooves turn from outward to round.' },
		hollow: { value: 0.38, min: 0, max: 1, step: 0.01, note: 'How much darker each dent prints at its rim than at its centre.' },
		falloff: { value: 0.75, min: 0.1, max: 2, step: 0.01, note: 'How far from the centre the dent\'s brightness fades out.' },
		ring: { value: 0.35, min: 0, max: 2, step: 0.01, note: 'How far the colour shifts toward each ridge, ringing every dent in its own band.' }
	},
	glsl: `
	cellSize = 1.0 / (filmScale * density);
	vec2 q = p * filmScale * density;
	vec2 i = floor(q);
	vec2 f = fract(q);
	float best = 8.0;
	float second = 8.0;
	vec2 id = vec2(0.0);
	vec2 offset = vec2(0.0);
	for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
		vec2 o = vec2(float(x), float(y));
		vec2 c = o + 0.5 + (hash2(i + o) - 0.5) * jitter - f;
		float d = dot(c, c);
		if (d < best) { second = best; best = d; id = i + o; offset = c; }
		else if (d < second) second = d;
	}
	// Near 0 where two dents meet, so the ridge between them reads as a hammer mark's edge.
	float edge = smoothstep(0.0, ridge, sqrt(second) - sqrt(best));
	vec2 around = length(offset) > 1e-3 ? normalize(vec2(offset.y, -offset.x)) : vec2(1.0, 0.0);
	vec2 outward = length(offset) > 1e-3 ? normalize(-offset) : vec2(0.0, 1.0);
	groove = normalize(mix(outward, around, edge) + 1e-4);
	seed = hash(id + 5.0) + (1.0 - edge) * ring;
	vivid = 1.0;
	// Each dent is bright where the hammer struck and falls off toward its rim, so it reads as a hollow.
	shade = 1.0 - hollow + hollow * smoothstep(falloff, 0.05, sqrt(best));
`
});
