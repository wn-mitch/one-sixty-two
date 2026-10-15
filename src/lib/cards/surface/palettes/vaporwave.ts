import { definePalette } from '../films/film.ts';

/** Vaporwave: ultraviolet, electric cyan and hot magenta. */
export default definePalette({
	name: 'vaporwave',
	glsl: `
	float x = fract(t);
	return x < 0.5
		? mix(vec3(0.30, 0.12, 0.68), vec3(0.16, 0.88, 0.96), x * 2.0)
		: mix(vec3(0.16, 0.88, 0.96), vec3(0.98, 0.24, 0.70), x * 2.0 - 1.0);
`
});
