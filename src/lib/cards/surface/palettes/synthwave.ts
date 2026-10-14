import { definePalette } from '../films/film.ts';

/** Synthwave: hot pink, violet and electric cyan. */
export default definePalette({
	name: 'synthwave',
	glsl: `
	float x = 0.5 + 0.5 * cos(6.28318 * t);
	return x < 0.5 ? mix(vec3(0.15, 0.85, 1.0), vec3(0.55, 0.2, 0.95), x * 2.0) : mix(vec3(0.55, 0.2, 0.95), vec3(1.0, 0.25, 0.6), x * 2.0 - 1.0);
`
});
