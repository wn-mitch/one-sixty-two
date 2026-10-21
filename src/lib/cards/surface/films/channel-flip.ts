import { defineFilm } from './film.ts';

/**
 * Channel flip (ITW's two- or three-image channel switch): one round badge whose viewing angle selects a baseball,
 * a diamond or the numerals 162. Leaning across the card steps through them with a narrow changeover, so each
 * image reads on its own instead of ghosting into the next. Facing straight on shows the diamond.
 */
export default defineFilm({
	name: 'channel-flip',
	experimental: true,
	params: {
		size: { value: 1.7, min: 0.8, max: 2.5, step: 0.01, note: 'Badge radius in card units.' },
		channels: { value: 3, min: 2, max: 3, step: 1, note: 'Two images (baseball and 162) or three (with the diamond between).' },
		edge: { value: 0.04, min: 0.005, max: 0.3, step: 0.005, note: 'Half-width of each changeover, in full leans; small is a crisp switch.' },
		weight: { value: 0.045, min: 0.01, max: 0.12, step: 0.001, note: 'Line half-width, as a fraction of the badge radius.' },
		travel: { value: 0.12, min: 0.03, max: 0.4, step: 0.005, note: 'Lean, as the sine of the tilt, that counts as a full lean.' }
	},
	helpers: `
// Distance to a baseball's outline, seams and stitches in a badge of radius 1.
float flipBall(vec2 u) {
	float d = abs(length(u) - 0.78);
	if (length(u) < 0.78) {
		for (int side = 0; side < 2; side++) {
			vec2 c = vec2(side == 0 ? 1.25 : -1.25, 0.0);
			vec2 r = u - c;
			float seam = abs(length(r) - 0.85);
			d = min(d, seam);
			// Stitches cross the seam as short dashes, 0.11 apart along it.
			float along = fract(atan(r.y, r.x) * 0.85 / 0.11) - 0.5;
			d = min(d, max(seam - 0.08, (abs(along) - 0.15) * 0.11));
		}
	}
	return d;
}
// Distance to an infield diamond, its bases, mound, foul lines and the outfield fence.
float flipDiamond(vec2 u) {
	vec2 home = vec2(0.0, -0.62);
	float d = abs(abs(u.x) + abs(u.y + 0.02) - 0.6);
	d = min(d, segment(vec2(abs(u.x), u.y), vec2(0.6, -0.02), vec2(0.86, 0.24)));
	d = min(d, arc(u, home, 1.22, 0.785, 2.356));
	d = min(d, max(length(u + vec2(0.0, 0.02)) - 0.06, 0.0));
	vec2 b = vec2(abs(u.x), u.y);
	float base = max(abs(b.x - 0.6) + abs(b.y + 0.02), 0.0) - 0.07;
	base = min(base, abs(u.x) + abs(u.y - 0.58) - 0.07);
	base = min(base, abs(u.x) + abs(u.y - home.y) - 0.07);
	return min(d, max(base, 0.0));
}
`,
	glsl: `
	vec2 f = cardFace(p);
	vec2 lean = v_view.xy / max(travel, 1e-3);
	vec2 u = (f - CARD * 0.5) * vec2(1.0, -1.0) / size;
	float badge = inked((length(u) - 1.0) * size);
	// Each image owns a band of lean across the card; the changeovers between them are only 2 * edge wide.
	float x = lean.x;
	float three = step(2.5, channels);
	float low = mix(0.0, -0.3333, three);
	float high = mix(0.0, 0.3333, three);
	float ball = 1.0 - smoothstep(low - edge, low + edge, x);
	float numerals = smoothstep(high - edge, high + edge, x);
	float field = max(1.0 - ball - numerals, 0.0) * three;
	float w = weight * size;
	float inkBall = inked(flipBall(u) * size - w);
	float inkField = inked(flipDiamond(u) * size - w);
	float inkNumerals = inked(digits162(u / 0.5) * 0.5 * size - w * 1.4);
	vec3 color = vec3(0.12, 0.13, 0.16);
	color = mix(color, mix(rainbow(0.02 + x * 0.1), vec3(1.0), 0.35), inkBall * ball);
	color = mix(color, mix(rainbow(0.36 + x * 0.1), vec3(1.0), 0.35), inkField * field);
	color = mix(color, mix(rainbow(0.7 + x * 0.1), vec3(1.0), 0.35), inkNumerals * numerals);
	float rim = inked(abs(length(u) - 0.97) * size - w * 0.8);
	color = mix(color, vec3(0.8, 0.82, 0.86), rim);
	own = vec4(color, badge);
	ownFlash = max(max(inkBall * ball, inkField * field), inkNumerals * numerals) * 0.8;
	groove = vec2(0.6, 0.8);
	vivid = 0.6;
`
});
