import { defineFilm } from './film.ts';

/**
 * Xfractor: square cells split corner to corner into four triangles that alternate their grooves, and alternate
 * cells tilt theirs a little further, so the grid flashes as a checkerboard of pinwheels.
 */
export default defineFilm({
	name: 'xfractor',
	params: {
		density: { value: 0.25, min: 0.03, max: 3, step: 0.01, note: 'Cells per card unit; higher makes a finer grid.' },
		turn: { value: 1.5708, min: 0, max: 3.14159, step: 0.01, note: 'How far the grooves turn from one triangle to the next, in radians.' },
		tilt: { value: 0.7854, min: 0, max: 3.14159, step: 0.01, note: 'Groove angle of the first triangle in each cell, in radians.' },
		checker: { value: 0.35, min: 0, max: 3.14159, step: 0.01, note: 'Extra tilt on alternate cells, which sets how strongly the checkerboard shows.' }
	},
	glsl: `
	cellSize = 1.0 / (filmScale * density);
	vec2 q = p * filmScale * density;
	vec2 cell = floor(q);
	vec2 f = fract(q) - 0.5;
	float quarter = abs(f.x) > abs(f.y) ? (f.x > 0.0 ? 0.0 : 2.0) : (f.y > 0.0 ? 1.0 : 3.0);
	float angle = quarter * turn + tilt + mod(cell.x + cell.y, 2.0) * checker;
	groove = vec2(cos(angle), sin(angle));
	seed = hash(cell + quarter * 13.0);
`
});
