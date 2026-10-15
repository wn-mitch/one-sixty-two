import { definePalette } from '../films/film.ts';

/** Mono silver: cool graphite through brushed silver into a soft white glint. */
export default definePalette({
	name: 'mono-silver',
	glsl: `
	float x = fract(t);
	return x < 0.5
		? mix(vec3(0.31, 0.34, 0.38), vec3(0.67, 0.70, 0.75), x * 2.0)
		: mix(vec3(0.67, 0.70, 0.75), vec3(0.93, 0.95, 0.97), x * 2.0 - 1.0);
`
});
