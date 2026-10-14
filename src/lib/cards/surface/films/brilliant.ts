import { defineFilm } from './film.ts';

/**
 * Brilliant: a lattice of cut stones. Each hexagonal cell is six triangular facets around a flat table, every facet
 * grooved across its own radius, so a cell throws fire facet by facet as the card turns.
 */
export default defineFilm({
	name: 'brilliant',
	params: {
		density: { value: 0.22, min: 0.03, max: 2, step: 0.01, note: 'Stones per card unit; higher sets smaller stones.' },
		facets: { value: 6, min: 1, max: 24, step: 1, note: 'Facets cut around each stone\'s table.' },
		tableSize: { value: 0.17, min: 0, max: 0.6, step: 0.01, note: 'Radius of the flat table at each stone\'s centre.' },
		cut: { value: 1.5708, min: 0, max: 3.14159, step: 0.01, note: 'Groove angle against each facet\'s radius, in radians; 1.57 runs them straight across.' },
		facetTwist: { value: 0.15, min: 0, max: 2, step: 0.01, note: 'How far each stone\'s facets turn by its own random spin.' }
	},
	glsl: `
	cellSize = 1.0 / (filmScale * density);
	vec2 q = p * filmScale * density;
	vec2 r = vec2(1.0, 1.7320508);
	vec2 a = mod(q, r) - r * 0.5;
	vec2 b = mod(q - r * 0.5, r) - r * 0.5;
	vec2 local = dot(a, a) < dot(b, b) ? a : b;
	vec2 stone = floor((q - local) * 8.0 + 0.5);
	float sector = 6.2831853 / facets;
	float facet = floor((atan(local.y, local.x) + 3.14159) / sector);
	float spin = hash(stone) * 6.28318;
	float middle = (facet + 0.5) * sector - 3.14159 + spin * facetTwist;
	bool table = length(local) < tableSize;
	float angle = table ? spin : middle + cut;
	groove = vec2(cos(angle), sin(angle));
	seed = hash(stone + (table ? 31.0 : facet * 7.3));
`
});
