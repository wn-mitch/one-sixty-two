import { defineFilm } from './film.ts';

/**
 * Pinwheel: Conway and Radin's non-periodic tiling. Its 1:2:sqrt(5) right triangles acquire endlessly many
 * orientations under substitution, so the foil grooves follow a true pinwheel tile rather than a radial emblem.
 */
export default defineFilm({
	name: 'pinwheel',
	ground: 0.86,
	params: {
		density: { value: 0.22, min: 0.05, max: 1, step: 0.01, note: 'Pinwheel triangles per card unit; higher packs more, smaller tiles.' },
		rotation: { value: 0.18, min: 0, max: 6.28319, step: 0.01, note: 'Turns the whole pinwheel tiling without changing its substitution.' },
		seamWidth: { value: 0.045, min: 0.005, max: 0.18, step: 0.005, note: 'Width of the bright seams as a fraction of a tile’s short leg.' }
	},
	helpers: `
float pinwheelFilmCross(vec2 a, vec2 b) {
	return a.x * b.y - a.y * b.x;
}

// Works for either winding: descendants reverse winding in the midpoint part of the substitution.
float pinwheelFilmInside(vec2 point, vec2 right, vec2 longEnd, vec2 shortEnd) {
	float winding = sign(pinwheelFilmCross(longEnd - right, shortEnd - right));
	float a = pinwheelFilmCross(longEnd - right, point - right) * winding;
	float b = pinwheelFilmCross(shortEnd - longEnd, point - longEnd) * winding;
	float c = pinwheelFilmCross(right - shortEnd, point - shortEnd) * winding;
	return step(-0.00001, min(a, min(b, c)));
}
`,
	glsl: `
	// Card-centred q stays inside the root triangle for every lab setting: its radius is below 689 when
	// holoScale <= 40, this film's scale dial <= 4 and density <= 1. The root contains the radius-1,373 disk.
	vec2 q = (p - v_view.zw - CARD * 0.5) * (filmScale * density);
	float cs = cos(rotation);
	float sn = sin(rotation);
	q = mat2(cs, -sn, sn, cs) * q;
	// Root is a 1:2:sqrt(5) triangle, with right, long-leg and short-leg endpoints respectively.
	vec2 right = vec2(-1536.0, -1536.0);
	vec2 longEnd = vec2(6144.0, -1536.0);
	vec2 shortEnd = vec2(-1536.0, 2304.0);
	float tileKey = 0.0;
	// Eleven fixed substitutions leave short legs about 0.55 q-units long; every step locates only one child.
	for (int level = 0; level < 11; level++) {
		// D is the altitude foot on the hypotenuse. ADC is one 1/sqrt(5) child; ABD splits at E, F and G.
		vec2 hypotenuse = shortEnd - longEnd;
		vec2 d = longEnd + hypotenuse * dot(right - longEnd, hypotenuse) / dot(hypotenuse, hypotenuse);
		vec2 e = (right + longEnd) * 0.5;
		vec2 f = (longEnd + d) * 0.5;
		vec2 g = (d + right) * 0.5;
		float child;
		vec2 nextRight;
		vec2 nextLongEnd;
		vec2 nextShortEnd;
		if (pinwheelFilmInside(q, d, right, shortEnd) > 0.5) {
			nextRight = d;
			nextLongEnd = right;
			nextShortEnd = shortEnd;
			child = 0.0;
		} else if (pinwheelFilmInside(q, g, e, right) > 0.5) {
			nextRight = g;
			nextLongEnd = e;
			nextShortEnd = right;
			child = 1.0;
		} else if (pinwheelFilmInside(q, f, longEnd, e) > 0.5) {
			nextRight = f;
			nextLongEnd = longEnd;
			nextShortEnd = e;
			child = 2.0;
		} else if (pinwheelFilmInside(q, d, f, g) > 0.5) {
			nextRight = d;
			nextLongEnd = f;
			nextShortEnd = g;
			child = 3.0;
		} else {
			nextRight = e;
			nextLongEnd = g;
			nextShortEnd = f;
			child = 4.0;
		}
		right = nextRight;
		longEnd = nextLongEnd;
		shortEnd = nextShortEnd;
		tileKey = tileKey * 5.0 + child;
	}
	float shortLeg = length(shortEnd - right);
	float seamDistance = min(
		abs(pinwheelFilmCross(longEnd - right, q - right)) / length(longEnd - right),
		min(abs(pinwheelFilmCross(shortEnd - longEnd, q - longEnd)) / length(shortEnd - longEnd), abs(pinwheelFilmCross(right - shortEnd, q - shortEnd)) / shortLeg)
	);
	float aa = max(length(fwidth(q)), 0.001);
	float seam = 1.0 - smoothstep(seamWidth * shortLeg - aa, seamWidth * shortLeg + aa, seamDistance);
	groove = normalize(longEnd - right);
	seed = hash(vec2(tileKey, 29.0));
	vivid = mix(0.82, 1.0, seam);
	copper = seam;
	copperPad = seam;
	cellSize = length(longEnd - right) / (filmScale * density);
`
});
