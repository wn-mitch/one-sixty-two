import { definePalette } from '../films/film.ts';

/** Mint: deep teal through fresh mint into a pale green highlight. */
export default definePalette({
	name: 'mint',
	glsl: `
	float x = fract(t);
	return x < 0.5
		? mix(vec3(0.09, 0.49, 0.45), vec3(0.56, 0.88, 0.75), x * 2.0)
		: mix(vec3(0.56, 0.88, 0.75), vec3(0.89, 0.98, 0.91), x * 2.0 - 1.0);
`
});
