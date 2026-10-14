import { defineFilm } from './film.ts';

/**
 * Geodesic: a dome's triangles, each split twice at its midpoints, every panel's grooves laid at one of a few
 * fixed angles so neighbouring panels flash different colours, with bright struts along the seams.
 */
export default defineFilm({
	name: 'geodesic',
	params: {
		density: { value: 0.16, min: 0.03, max: 1, step: 0.005, note: 'Dome triangles per card unit; higher packs more, smaller panels.' },
		strutWidth: { value: 0.06, min: 0.03, max: 0.3, step: 0.005, note: 'How far the struts reach in from each seam before fading out.' },
		strutCore: { value: 0.02, min: 0, max: 0.025, step: 0.001, note: 'How far the struts stay fully bright before they start to fade.' },
		angles: { value: 3, min: 1, max: 12, step: 1, note: 'How many groove directions the panels choose between.' },
		spread: { value: 1.0472, min: 0, max: 3.14159, step: 0.0001, note: 'Angle between those groove directions, in radians.' },
		tilt: { value: 0.3, min: 0, max: 3.14159, step: 0.01, note: 'Turns every panel\'s grooves by the same angle.' }
	},
	glsl: `
	cellSize = 0.25 / (filmScale * density);
	vec2 q = p * filmScale * density;
	vec2 skew = vec2(q.x + q.y * 0.57735, q.y * 1.1547);
	vec2 cell = floor(skew);
	vec2 f = fract(skew);
	float upper = step(1.0, f.x + f.y);
	vec3 bary = upper > 0.5 ? vec3(1.0 - f.x, 1.0 - f.y, f.x + f.y - 1.0) : vec3(f.x, f.y, 1.0 - f.x - f.y);
	float panel = cell.x * 7.0 + cell.y * 13.0 + upper * 3.0;
	float strut = min(bary.x, min(bary.y, bary.z));
	for (int k = 0; k < 2; k++) {
		// Midpoint subdivision: the centre triangle or one of the three corner triangles.
		vec3 doubled = bary * 2.0;
		float corner = doubled.x >= 1.0 ? 1.0 : doubled.y >= 1.0 ? 2.0 : doubled.z >= 1.0 ? 3.0 : 0.0;
		bary = corner == 1.0 ? vec3(doubled.x - 1.0, doubled.y, doubled.z)
			: corner == 2.0 ? vec3(doubled.x, doubled.y - 1.0, doubled.z)
			: corner == 3.0 ? vec3(doubled.x, doubled.y, doubled.z - 1.0)
			: vec3(1.0) - doubled;
		panel = panel * 4.0 + corner;
		strut = min(strut * 2.0, min(bary.x, min(bary.y, bary.z)));
	}
	float angle = floor(hash(vec2(panel, 1.0)) * angles) * spread + tilt;
	groove = vec2(cos(angle), sin(angle));
	seed = hash(vec2(panel, 9.0));
	vivid = smoothstep(strutWidth, strutCore, strut);
`
});
