import { defineFilm } from './film.ts';

/**
 * Oil puddle: a thin film of oil on wet tarmac, its thickness pooling and slowly swirling, so the interference
 * colours run in rings that drift as the puddle settles.
 */
export default defineFilm({
	name: 'oil-puddle',
	animated: true,
	ground: 0.62,
	params: {
		density: { value: 0.09, min: 0.01, max: 0.6, step: 0.005, note: 'Pools per card unit; higher breaks the puddle into smaller pools.' },
		speed: { value: 0.05, min: 0, max: 1, step: 0.01, note: 'How fast the oil swirls.' },
		swirl: { value: 1.6, min: 0, max: 6, step: 0.05, note: 'How far the currents drag the oil around.' },
		eddies: { value: 1.3, min: 0.1, max: 6, step: 0.05, note: 'Fineness of the currents; higher makes smaller eddies.' },
		rings: { value: 2.2, min: 0.1, max: 12, step: 0.05, note: 'How many colour rings the oil\'s thickness spans.' },
		pooling: { value: 0.28, min: 0, max: 0.48, step: 0.01, note: 'Thickness below which the oil goes dark; higher leaves only the deepest pools coloured.' }
	},
	glsl: `
	vec2 q = (p - v_view.zw) * filmScale * density;
	cellSize = 1.0 / (filmScale * density);
	float t = u_time * speed;
	vec2 warp = vec2(noise(q * eddies + vec2(t, -t)), noise(q * eddies + vec2(5.2 - t, 1.3 + t))) - 0.5;
	vec2 w = q + warp * swirl;
	float thickness = noise(w) * 0.6 + noise(w * 2.1 + 3.0) * 0.3 + noise(w * 4.3 - t) * 0.1;
	// The film's gradient sets which way its colour rings run.
	float e = 0.05;
	vec2 slope = vec2(noise(w + vec2(e, 0.0)) - noise(w - vec2(e, 0.0)), noise(w + vec2(0.0, e)) - noise(w - vec2(0.0, e)));
	groove = length(slope) > 1e-5 ? normalize(vec2(-slope.y, slope.x)) : vec2(1.0, 0.0);
	seed = thickness * rings;
	// Thin spots go dark like the tarmac under them; thick pools carry the colour.
	float pool = smoothstep(pooling, 0.5, thickness);
	vivid = mix(0.35, 1.0, pool);
	copper = pool;
`
});
