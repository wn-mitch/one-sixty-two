import { defineFilm } from './film.ts';

/** Golden Robinson substitution; paired triangle bases disappear into thin/thick Penrose rhombi. */
export default defineFilm({
	name: 'penrose',
	ground: 0.78,
	params: {
		density: { value: 0.18, min: 0.06, max: 0.5, step: 0.005, note: 'Rhomb edges per card unit; higher packs smaller tiles.' },
		rotation: { value: 0.17, min: 0, max: 6.28318, step: 0.01, note: 'Turns the entire quasiperiodic patch, in radians.' },
		seamWidth: { value: 0.025, min: 0.005, max: 0.08, step: 0.001, note: 'Bright seam half-width as a share of a rhomb edge.' }
	},
	helpers: `
float penroseSide(vec2 p, vec2 a, vec2 b) {
	vec2 edge = b - a;
	vec2 relative = p - a;
	return edge.x * relative.y - edge.y * relative.x;
}
`,
	glsl: `
	const float penrosePi = 3.141592653589793;
	const float penroseInversePhi = 0.618033988749895;
	float rate = filmScale * density;
	float turnCos = cos(rotation);
	float turnSin = sin(rotation);
	vec2 q = mat2(turnCos, -turnSin, turnSin, turnCos) * (p - CARD * 0.5) * rate;

	// Ten alternating-handed 36-degree apex triangles, radius phi^14. Their decagon
	// contains radius 801.73; card + seed shifts reach at most 624.82 at all dial maxima.
	float polar = dot(q, q) > 0.0 ? atan(q.y, q.x) : 0.0;
	float sector = floor((polar + penrosePi * 0.1) / (penrosePi * 0.2));
	float theta = sector * penrosePi * 0.2;
	vec2 a = vec2(0.0);
	vec2 b = 842.99881375871 * vec2(cos(theta - penrosePi * 0.1), sin(theta - penrosePi * 0.1));
	vec2 c = 842.99881375871 * vec2(cos(theta + penrosePi * 0.1), sin(theta + penrosePi * 0.1));
	if (mod(sector, 2.0) == 0.0) {
		vec2 swap = b;
		b = c;
		c = swap;
	}
	bool thick = false;
	// A is always the apex, BC the pairing base. Each step shrinks equal legs by phi.
	// One or two separating-line decisions locate a child, without searching neighbours.
	for (int level = 0; level < 14; level++) {
		if (!thick) {
			vec2 split = mix(a, b, penroseInversePhi);
			if (penroseSide(q, c, split) * penroseSide(b, c, split) >= 0.0) {
				// Thin(C, split, B).
				a = c;
				c = b;
				b = split;
			} else {
				// Thick(split, C, A).
				b = c;
				c = a;
				a = split;
				thick = true;
			}
		} else {
			vec2 splitAB = mix(b, a, penroseInversePhi);
			vec2 splitBC = mix(b, c, penroseInversePhi);
			if (penroseSide(q, a, splitBC) * penroseSide(c, a, splitBC) >= 0.0) {
				// Thick(splitBC, C, A).
				b = c;
				c = a;
				a = splitBC;
			} else if (penroseSide(q, splitAB, splitBC) * penroseSide(b, splitAB, splitBC) >= 0.0) {
				// Thick(splitAB, splitBC, B).
				a = splitAB;
				c = b;
				b = splitBC;
			} else {
				// Thin(splitBC, splitAB, A).
				c = a;
				a = splitBC;
				b = splitAB;
				thick = false;
			}
		}
	}

	// The partner apex is B + C - A. Both halves use the same centre, full four-edge
	// distance and unoriented base axis, so the discarded diagonal leaves no colour seam.
	vec2 centre = (b + c) * 0.5;
	vec2 edgeAB = b - a;
	vec2 edgeAC = c - a;
	float halfWidth = abs(penroseSide(c, a, b)) * 0.5;
	float seamDistance = halfWidth - max(abs(penroseSide(q, centre, centre + edgeAB)), abs(penroseSide(q, centre, centre + edgeAC)));
	float aa = footprint * rate;
	float seam = 1.0 - smoothstep(seamWidth - aa, seamWidth + aa, seamDistance);
	vec2 base = c - b;
	float axis = mod(floor(atan(base.y, base.x) / (penrosePi * 0.1) + 0.5) * (penrosePi * 0.1), penrosePi);
	float angle = axis + rotation;
	groove = vec2(cos(angle), sin(angle));
	seed = 0.42 + 0.28 * sin(dot(centre, vec2(0.73, 1.17))) + (thick ? 0.22 : 0.0);
	vivid = mix(thick ? 0.48 : 0.25, 1.0, seam);
	copper = seam;
	cellSize = 0.587785252292473 / rate;
`
});
