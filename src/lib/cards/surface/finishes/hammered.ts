import { defineFinish } from '../films/film.ts';

/** Hammered: shallow round dents across the film, each bending the colour around its rim. */
export default defineFinish({
	name: 'hammered',
	params: {
		size: { value: 5, min: 1, max: 30, step: 0.5, note: 'Dents per card unit.' },
		depth: { value: 0.5, min: 0, max: 2, step: 0.01, note: 'How deep the dents are.' }
	},
	glsl: `
	depth *= resolve(1.0 / size);
	vec2 q = p * size;
	vec2 cell = floor(q);
	vec2 nearest = vec2(9.0);
	for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
		vec2 c = cell + vec2(float(i), float(j));
		vec2 d = q - c - hash2(c);
		if (dot(d, d) < dot(nearest, nearest)) nearest = d;
	}
	normal = normalize(normal + vec3(nearest * depth * 0.4, 0.0));
	sweep += length(nearest) * depth * 0.3;
`
});
