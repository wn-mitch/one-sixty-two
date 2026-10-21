import { defineFilm } from './film.ts';

/**
 * Chasing rosette (ITW's fine-line guilloche): a spirograph medallion of interwoven wave strands in two bands.
 * Tilt chases light along the strands; alternate strands chase the opposite way, so the light runs outward on
 * one and inward on its neighbour, and the two bands turn against each other. The fine lines stay visible between
 * highlights.
 */
export default defineFilm({
	name: 'chasing-rosette',
	experimental: true,
	params: {
		size: { value: 2.1, min: 0.8, max: 2.5, step: 0.01, note: 'Medallion radius in card units.' },
		lobes: { value: 12, min: 3, max: 30, step: 1, note: 'Waves round each strand.' },
		strands: { value: 6, min: 1, max: 12, step: 1, note: 'Interwoven strands in each band.' },
		amplitude: { value: 0.11, min: 0, max: 0.3, step: 0.005, note: 'How far each strand swings in and out, as a fraction of the radius.' },
		weight: { value: 0.012, min: 0.003, max: 0.05, step: 0.001, note: 'Line half-width in card units.' },
		lights: { value: 3, min: 1, max: 12, step: 1, note: 'Chasing lights on each strand.' },
		chase: { value: 1, min: 0, max: 4, step: 0.05, note: 'How far the lights run from one full lean to the other, in gaps between lights.' },
		glow: { value: 0.08, min: 0.01, max: 0.5, step: 0.005, note: 'Length of each chasing light, as a fraction of the gap between lights.' },
		travel: { value: 0.12, min: 0.03, max: 0.4, step: 0.005, note: 'Lean, as the sine of the tilt, that counts as a full lean.' }
	},
	helpers: `
// The nearest strand of a guilloche band round the origin: its distance, how strongly a chasing light catches
// there, and which strand it is. The band's strands swing about radius r by a, each a fraction of a lobe apart;
// the lights run round each strand, so they swing in and out with its waves as they go.
void rosetteBand(vec2 u, float r, float a, float lobes, float strands, float lights, float chase, float glow, float turn, inout float best, inout float lit, inout float which) {
	float radius = length(u);
	float theta = atan(u.y, u.x);
	for (int i = 0; i < 12; i++) {
		if (float(i) >= strands) break;
		float phase = float(i) / strands * 6.28318;
		float wave = lobes * theta + phase;
		float slope = a * lobes * cos(wave) / max(radius, 1e-3);
		float d = abs(radius - r - a * sin(wave)) / sqrt(1.0 + slope * slope);
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
	float best = 1e3;
	float lit = 0.0;
	float which = 0.0;
	rosetteBand(u, size * 0.74, size * amplitude, lobes, strands, lights, h * chase, glow, 1.0, best, lit, which);
	rosetteBand(u, size * 0.42, size * amplitude * 0.8, lobes * 0.5, strands, lights, h * chase, glow, -1.0, best, lit, which);
	// Plain rims bound each band.
	float rim = min(abs(length(u) - size), abs(length(u) - size * 0.58));
	rim = min(rim, abs(length(u) - size * 0.24));
	float lines = inked(best - weight);
	float rims = inked(rim - weight * 1.3);
	vec3 hot = mix(vec3(1.0), rainbow(h + which), 0.65);
	vec3 color = mix(vec3(0.42, 0.45, 0.5), hot, lit);
	own = vec4(mix(color, vec3(0.78, 0.8, 0.84), rims * (1.0 - lines)), max(lines, rims));
	ownFlash = lit * lines;
	// Spun grooves round the medallion, dimmed so the lines lead.
	vec2 around = length(u) > 1e-3 ? normalize(vec2(-u.y, u.x)) : vec2(1.0, 0.0);
	groove = around;
	vivid = 0.25;
	shade = 0.3;
`
});
