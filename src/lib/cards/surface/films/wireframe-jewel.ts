import { defineFilm } from './film.ts';

/**
 * Wireframe jewel (ITW's wireframing): the outline of a brilliant-cut diamond seen from above, its table, girdle and
 * star facets drawn as fine lines over the ordinary holo. Each edge catches the light in its own narrow range of
 * tilt directions, so leaning round the card walks a glint from facet to facet; at rest the outline stays a quiet
 * silver.
 */
export default defineFilm({
	name: 'wireframe-jewel',
	experimental: true,
	params: {
		size: { value: 1.7, min: 0.6, max: 2.4, step: 0.01, note: 'Girdle radius in card units.' },
		table: { value: 0.55, min: 0.2, max: 0.85, step: 0.01, note: 'Table size, as a fraction of the girdle.' },
		spread: { value: 0.35, min: 0.05, max: 1.5, step: 0.01, note: 'How wide a range of tilt directions each edge catches, in radians.' },
		weight: { value: 0.016, min: 0.004, max: 0.06, step: 0.001, note: 'Line half-width in card units.' },
		travel: { value: 0.12, min: 0.03, max: 0.4, step: 0.005, note: 'Lean, as the sine of the tilt, that counts as a full lean.' }
	},
	helpers: `
// Keeps the nearest edge and how it catches: edges are numbered so each catches its own tilt direction.
void jewelEdge(vec2 u, vec2 a, vec2 b, float index, float direction, float amount, float spread, inout float best, inout float caught, inout float which) {
	float d = segment(u, a, b);
	float aim = fract(index * 0.618034) * 6.28318;
	float off = abs(mod(direction - aim + 3.14159, 6.28318) - 3.14159);
	if (d < best) { best = d; caught = amount * exp(-off * off / max(spread * spread, 1e-4)); which = index; }
}
`,
	glsl: `
	vec2 f = cardFace(p);
	vec2 lean = v_view.xy / max(travel, 1e-3);
	vec2 u = (f - CARD * 0.5) * vec2(1.0, -1.0) / size;
	// Which way the card leans, and whether it leans far enough to catch any edge.
	float direction = atan(-lean.y, lean.x);
	float amount = smoothstep(0.2, 0.6, length(lean));
	float best = 1e3;
	float caught = 0.0;
	float which = 0.0;
	for (int k = 0; k < 8; k++) {
		float angle = float(k) * 0.785398;
		vec2 girdle = vec2(cos(angle), sin(angle));
		vec2 girdleNext = vec2(cos(angle + 0.785398), sin(angle + 0.785398));
		vec2 tableAt = table * vec2(cos(angle + 0.392699), sin(angle + 0.392699));
		vec2 tableNext = table * vec2(cos(angle + 1.178097), sin(angle + 1.178097));
		jewelEdge(u, girdle, girdleNext, float(k), direction, amount, spread, best, caught, which);
		jewelEdge(u, tableAt, tableNext, float(k + 8), direction, amount, spread, best, caught, which);
		jewelEdge(u, tableAt, girdle, float(k + 16), direction, amount, spread, best, caught, which);
		jewelEdge(u, tableAt, girdleNext, float(k + 24), direction, amount, spread, best, caught, which);
	}
	float ink = inked(best * size - weight);
	vec3 hot = mix(vec3(1.0), rainbow(which / 32.0 + dot(lean, vec2(0.2, 0.3))), 0.5);
	own = vec4(mix(vec3(0.62, 0.65, 0.7), hot, caught), ink);
	ownFlash = caught;
	groove = vec2(0.6, 0.8);
	vivid = 0.5;
	shade = 0.8;
`
});
