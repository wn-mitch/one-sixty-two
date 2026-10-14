import { defineFilm } from './film.ts';

/**
 * Prizm: a lattice of triangular facets, large enough to read one by one. Each facet runs its grooves at its own
 * random angle, so neighbouring triangles flash different colours as the card turns.
 */
export default defineFilm({
	name: 'prizm',
	params: {
		density: { value: 0.55, min: 0.05, max: 4, step: 0.01, note: 'Facets per card unit; higher packs in smaller triangles.' },
		shear: { value: 0.57735, min: -2, max: 2, step: 0.001, note: 'How far each row of the lattice leans; 0.577 makes equilateral triangles.' },
		stretch: { value: 1.1547, min: 0.2, max: 4, step: 0.001, note: 'How tall the facets are against their width.' },
		spread: { value: 6.28318, min: 0, max: 12.56637, step: 0.01, note: 'Range of groove angles across facets, in radians; 0 lines every facet up.' }
	},
	glsl: `
	cellSize = 1.0 / (filmScale * density);
	vec2 q = p * filmScale * density;
	vec2 skew = vec2(q.x + q.y * shear, q.y * stretch);
	vec2 cell = floor(skew);
	vec2 f = fract(skew);
	cell = vec2(cell.x * 2.0 + step(1.0, f.x + f.y), cell.y);
	float angle = hash(cell) * spread;
	groove = vec2(cos(angle), sin(angle));
	seed = hash(cell + 7.0);
`
});
