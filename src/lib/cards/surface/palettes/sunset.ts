import { definePalette } from '../films/film.ts';

/** Sunset: plum dusk through coral into warm amber. */
export default definePalette({
	name: 'sunset',
	glsl: `
	float x = fract(t);
	return x < 0.5
		? mix(vec3(0.29, 0.11, 0.47), vec3(1.0, 0.31, 0.39), x * 2.0)
		: mix(vec3(1.0, 0.31, 0.39), vec3(1.0, 0.70, 0.36), x * 2.0 - 1.0);
`
});
