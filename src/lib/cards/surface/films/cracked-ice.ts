import { defineFilm } from './film.ts';

/**
 * Cracked ice: irregular shards, the cells of a jittered grid split by nearest point. Each shard runs its grooves
 * at its own random angle, so the card breaks into separate flashes of colour.
 */
export default defineFilm({
	name: 'cracked-ice',
	params: {
		density: { value: 1.02, min: 0.05, max: 4, step: 0.01, note: 'Shards per card unit; higher breaks the ice finer.' },
		jitter: { value: 1, min: 0, max: 1, step: 0.01, note: 'How irregular the shards are; 0 lays them out as a square grid.' },
		spread: { value: 6.27, min: 0, max: 12.56637, step: 0.01, note: 'Range of groove angles across shards, in radians; 0 lines every shard up.' }
	},
	glsl: `
	// Filtered as slightly smaller cells than the shards, since the shards vary in size.
	cellSize = 1.0 / (filmScale * density * 1.25);
	vec2 q = p * filmScale * density;
	vec2 i = floor(q);
	vec2 f = fract(q);
	float best = 8.0;
	vec2 id = vec2(0.0);
	for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
		vec2 o = vec2(float(x), float(y));
		vec2 c = o + 0.5 + (hash2(i + o) - 0.5) * jitter - f;
		float d = dot(c, c);
		if (d < best) { best = d; id = i + o; }
	}
	float angle = hash(id) * spread;
	groove = vec2(cos(angle), sin(angle));
	seed = hash(id + 7.0);
`
});
