import { defineFilm } from './film.ts';

/**
 * Chasing rosette (after ITW's fine-line guilloche): interwoven wave strands in two bands that run round the card's
 * own outline as a border. Tilt chases light along the strands; alternate strands chase the opposite way, so the
 * light runs outward on one and inward on its neighbour, and the two bands turn against each other. The fine lines
 * stay visible between highlights.
 */
export default defineFilm({
	name: 'chasing-rosette',
	params: {
		border: { value: 1.02, min: 0.4, max: 2.4, step: 0.01, note: 'Scale of the border bands in card units; with amplitude it sets how far in from the edge they reach.' },
		lobes: { value: 23, min: 3, max: 40, step: 1, note: 'Waves round each outer strand; the inner band has half as many, rounded.' },
		strands: { value: 11, min: 1, max: 12, step: 1, note: 'Interwoven strands in each band.' },
		amplitude: { value: 0.125, min: 0.01, max: 0.3, step: 0.005, note: 'How far each strand swings in and out, as a fraction of the border; the bands are as wide as their swing.' },
		weight: { value: 0.01, min: 0.003, max: 0.05, step: 0.001, note: 'Line half-width in card units.' },
		lights: { value: 7, min: 1, max: 12, step: 1, note: 'Chasing lights on each strand.' },
		chase: { value: 1.5, min: 0, max: 4, step: 0.05, note: 'How far the lights run from one full lean to the other, in gaps between lights.' },
		glow: { value: 0.175, min: 0.01, max: 0.5, step: 0.005, note: 'Length of each chasing light, as a fraction of the gap between lights.' },
		travel: { value: 0.14, min: 0.03, max: 0.4, step: 0.005, note: 'Lean, as the sine of the tilt, that counts as a full lean.' }
	},
	helpers: `
// How far in from the edge of a box of half-size b a point inside it sits. The edge's corners round to radius r,
// and the inward offsets soften by k, so bands deep inside still turn a curve rather than a mitre.
float rosetteInset(vec2 q, vec2 b, float r, float k) {
	vec2 d = abs(q) - b + r;
	float inner = max(d.x, d.y);
	float h = clamp(0.5 + 0.5 * (d.x - d.y) / k, 0.0, 1.0);
	inner = max(inner, mix(d.y, d.x, h) + k * h * (1.0 - h));
	return r - (d.x > 0.0 && d.y > 0.0 ? length(d) : inner);
}
// Where a point sits going anticlockwise round a box of half-size b, as a fraction of the way round, measured
// along the box's sides so lobes space evenly on long and short sides alike.
float rosetteAround(vec2 u, vec2 b) {
	vec2 s = u / b;
	float along;
	if (abs(s.x) >= abs(s.y)) along = s.x > 0.0 ? b.y * s.y / s.x : 2.0 * b.x + 2.0 * b.y - b.y * s.y / -s.x;
	else along = s.y > 0.0 ? b.y + b.x - b.x * s.x / s.y : 3.0 * b.y + 3.0 * b.x + b.x * s.x / -s.y;
	return fract(along / (4.0 * (b.x + b.y)));
}
// The nearest strand of a guilloche band: its distance, how strongly a chasing light catches there, and which
// strand it is. Strands are traced in a band's own coordinates: depth in from its outer rim (card units) and
// theta round it, with stretch how many radians of theta one card unit spans there. Each strand swings about
// depth r by a, a fraction of a lobe from its neighbours; the lights run round each strand, so they swing in and
// out with its waves as they go.
void rosetteBand(float depth, float theta, float stretch, float r, float a, float lobes, float strands, float lights, float chase, float glow, float turn, inout float best, inout float lit, inout float which) {
	for (int i = 0; i < 12; i++) {
		if (float(i) >= strands) break;
		float phase = float(i) / strands * 6.28318;
		float wave = lobes * theta + phase;
		float slope = a * lobes * cos(wave) * stretch;
		float d = abs(depth - r - a * sin(wave)) / sqrt(1.0 + slope * slope);
		// Even strands chase one way and odd strands the other; the band's turn flips both.
		float direction = (mod(float(i), 2.0) < 0.5 ? 1.0 : -1.0) * turn;
		float gap = abs(fract((theta + phase / lobes) / 6.28318 * lights - direction * chase + 0.5) - 0.5);
		float catchLight = exp(-gap * gap / max(glow * glow, 1e-5));
		if (d < best) { best = d; lit = catchLight; which = float(i) / strands; }
	}
}
`,
	glsl: `
	vec2 f = cardFace(p);
	vec2 lean = v_view.xy / max(travel, 1e-3);
	vec2 u = (f - CARD * 0.5) * vec2(1.0, -1.0);
	float h = dot(lean, vec2(0.6, 0.8)) * 0.5;
	// Bands run in from the card's own edge, with corners close to its own, softening as they go inward.
	// Theta goes round by distance along the sides; stretch follows the band's shorter perimeter inside.
	vec2 outline = CARD * 0.5;
	float depth = rosetteInset(u, outline, 0.2, border * 0.6);
	float theta = rosetteAround(u, outline) * 6.28318;
	float stretch = 6.28318 / max(4.0 * (outline.x + outline.y) - 8.0 * depth, 1.0);
	float best = 1e3;
	float lit = 0.0;
	float which = 0.0;
	// The outer band's strands swing out to the edge itself; the inner band starts where the outer one ends.
	float a = border * amplitude;
	rosetteBand(depth, theta, stretch, a, a, lobes, strands, lights, h * chase, glow, 1.0, best, lit, which);
	rosetteBand(depth, theta, stretch, a * 2.8, a * 0.8, floor(lobes * 0.5 + 0.5), strands, lights, h * chase, glow, -1.0, best, lit, which);
	float lines = inked(best - weight);
	vec3 hot = mix(vec3(1.0), rainbow(h + which), 0.65);
	own = vec4(mix(vec3(0.42, 0.45, 0.5), hot, lit), lines);
	ownFlash = lit * lines;
	// Spun grooves round the centre, dimmed so the lines lead.
	vec2 around = length(u) > 1e-3 ? normalize(vec2(-u.y, u.x)) : vec2(1.0, 0.0);
	groove = around;
	vivid = 0.25;
	shade = 0.3;
`
});
