import { defineFinish } from '../films/film.ts';

/** Bump: an orange-peel ripple over the whole film, so its colour wobbles as it sweeps instead of running in clean bands. */
export default defineFinish({
	name: 'bump',
	params: {
		size: { value: 2.2, min: 0.3, max: 12, step: 0.1, note: 'Ripples per card unit.' },
		depth: { value: 0.35, min: 0, max: 1.5, step: 0.01, note: 'How far the ripples tilt the film.' }
	},
	glsl: `
	vec2 q = p * size;
	float e = 0.15;
	float h = noise(q) + 0.5 * noise(q * 2.3 + 7.0);
	vec2 slope = vec2(noise(q + vec2(e, 0.0)) + 0.5 * noise((q + vec2(e, 0.0)) * 2.3 + 7.0) - h, noise(q + vec2(0.0, e)) + 0.5 * noise((q + vec2(0.0, e)) * 2.3 + 7.0) - h) / e;
	normal = normalize(normal + vec3(slope * depth * 0.25, 0.0));
	sweep += h * depth * 0.4;
`
});
