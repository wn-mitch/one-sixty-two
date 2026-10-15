import { definePalette } from '../films/film.ts';

/** Rose gold: burnished copper, rose metal and a champagne highlight. */
export default definePalette({
	name: 'rose-gold',
	glsl: `
	float x = fract(t);
	return x < 0.5
		? mix(vec3(0.54, 0.25, 0.30), vec3(0.85, 0.56, 0.62), x * 2.0)
		: mix(vec3(0.85, 0.56, 0.62), vec3(0.95, 0.83, 0.72), x * 2.0 - 1.0);
`
});
