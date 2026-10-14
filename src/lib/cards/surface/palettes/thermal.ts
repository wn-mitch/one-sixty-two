import { definePalette } from '../films/film.ts';

/** Thermal: an infrared camera's black through red and yellow to white heat. */
export default definePalette({
	name: 'thermal',
	glsl: `
	float x = fract(t);
	x = x < 0.5 ? x * 2.0 : 2.0 - x * 2.0;
	return clamp(vec3(x * 3.0 - 0.2, x * 3.0 - 1.1, x * 4.0 - 2.9), 0.0, 1.0) * 0.85 + 0.12;
`
});
