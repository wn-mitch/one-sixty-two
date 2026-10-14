import { defineFilm } from './film.ts';

/**
 * HGH: the skeletal formula of human growth hormone, its backbone zigzagging row after row in sequence, with
 * C=O double bonds, ringed nitrogens and a benzene ring on every aromatic residue. Rows nest into one sheet.
 */
export default defineFilm({
	name: 'hgh',
	ground: 0.62,
	params: {
		density: { value: 0.9, min: 0.2, max: 4, step: 0.01, note: 'Bond lengths per card unit; higher draws a smaller formula.' },
		rowHeight: { value: 2.4, min: 1.2, max: 6, step: 0.05, note: 'Spacing between rows of backbone; below about 2 the side chains overlap.' },
		rowShift: { value: 1.3, min: 0, max: 5, step: 0.05, note: 'How far each row slides along from the one above.' },
		zigzag: { value: 0.25, min: 0, max: 0.8, step: 0.01, note: 'How far the backbone zigzags up and down.' },
		chainLength: { value: 0.7, min: 0.1, max: 1.5, step: 0.01, note: 'Length of each side chain off an alpha carbon.' },
		bondWidth: { value: 0.075, min: 0.015, max: 0.3, step: 0.005, note: 'Line thickness of every bond and ring.' }
	},
	glsl: `
	cellSize = 0.87 / (filmScale * density);
	// HGH: the skeletal formula of human growth hormone, row after row of its backbone in sequence. Each residue
	// is three zigzag bonds, N to alpha carbon to carbonyl carbon; the carbonyl carries a C=O double bond, the
	// nitrogen a small ring for its atom, and every aromatic residue a benzene ring off its alpha carbon.
	// Rows sit closer than their side chains reach, so each pixel checks its neighbouring rows too and the
	// rings of one row nest between the side chains of the next: one tessellated sheet of formula.
	vec2 q = p * filmScale * density;
	float home = floor(q.y / rowHeight);
	float dx = 0.86603;
	float bonds = 8.0;
	vec2 dir = vec2(1.0, 0.0);
	float row = home;
	float x = q.x;
	for (int rr = -1; rr <= 1; rr++) {
		float r_ = home + float(rr);
		vec2 local = vec2(q.x + r_ * rowShift, q.y - (r_ + 0.5) * rowHeight);
		float first = floor(local.x / dx);
		for (int k = -1; k <= 1; k++) {
			float atom = first + float(k);
			// Even atoms sit up the zigzag, odd ones down, and their side bonds point away from the chain.
			float side = mod(atom, 2.0) < 0.5 ? -1.0 : 1.0;
			vec2 here = vec2(atom * dx, side * zigzag);
			vec2 next = vec2((atom + 1.0) * dx, -side * zigzag);
			float before = bonds;
			float d = segment(local, here, next);
			if (d < bonds) { bonds = d; dir = normalize(next - here); }
			float global = atom + r_ * 29.0;
			float role = mod(global, 3.0);
			vec2 out_ = vec2(0.0, side);
			if (role > 1.5) {
				// Carbonyl: a double bond to oxygen.
				float dbl = min(segment(local, here + vec2(0.1, 0.0), here + vec2(0.1, 0.8 * side)), segment(local, here - vec2(0.1, 0.0), here + vec2(-0.1, 0.8 * side)));
				if (dbl < bonds) { bonds = dbl; dir = out_; }
			} else if (role > 0.5) {
				// Alpha carbon: a side chain, ringed where the residue is aromatic.
				vec2 tip = here + out_ * chainLength;
				float chain = segment(local, here, tip);
				if (chain < bonds) { bonds = chain; dir = out_; }
				if (aromatic(floor(global / 3.0))) {
					vec2 centre = tip + out_ * 0.5;
					vec2 o = local - centre;
					float ring = min(abs(hexagon(o.yx, 0.43)), abs(length(o) - 0.26));
					if (ring < bonds) { bonds = ring; dir = normalize(vec2(-o.y, o.x) + 1e-4); }
				}
			} else {
				// Nitrogen: a small ring marks the atom.
				vec2 o = local - here;
				float n = abs(length(o) - 0.13);
				if (n < bonds) { bonds = n; dir = normalize(vec2(-o.y, o.x) + 1e-4); }
			}
			if (bonds < before) { row = r_; x = local.x; }
		}
	}
	float ink = smoothstep(bondWidth, bondWidth * 0.6, bonds);
	groove = normalize(mix(vec2(0.6, 0.8), dir, ink) + 1e-4);
	seed = mix(hash(vec2(row, 3.0)) * 0.3, hash(vec2(floor(x / dx / 3.0), row)), ink);
	vivid = mix(0.12, 1.0, ink);
	copper = ink;
`
});
