import { defineFilm } from './film.ts';

/**
 * Turning baseball (ITW's 3D stereogram): a ball in a fixed circular medallion. Its seam is the real baseball
 * curve on a sphere, so as the card tilts the seam swings round and over the ball and the view implies volume and
 * rotation, while the medallion and the ball's outline stay put.
 */
export default defineFilm({
	name: 'turning-baseball',
	experimental: true,
	params: {
		size: { value: 1.55, min: 0.8, max: 2.4, step: 0.01, note: 'Medallion radius in card units.' },
		spin: { value: 1.1, min: 0, max: 3.2, step: 0.01, note: 'How far the ball turns at a full lean, in radians.' },
		bend: { value: 0.38, min: 0.15, max: 0.48, step: 0.005, note: 'How far the seam swings off the equator; higher bends it toward a tennis ball.' },
		weight: { value: 0.022, min: 0.005, max: 0.08, step: 0.001, note: 'Seam line half-width, in ball radii.' },
		stitches: { value: 40, min: 10, max: 100, step: 1, note: 'Stitches round the whole seam.' },
		travel: { value: 0.12, min: 0.03, max: 0.4, step: 0.005, note: 'Lean, as the sine of the tilt, that counts as a full lean.' }
	},
	helpers: `
// A point on the baseball seam: the curve a + b = 1 traces on the unit sphere.
vec3 seamPoint(float t, float a, float b) {
	return vec3(a * cos(t) + b * cos(3.0 * t), a * sin(t) - b * sin(3.0 * t), 2.0 * sqrt(a * b) * sin(2.0 * t));
}
`,
	glsl: `
	vec2 f = cardFace(p);
	vec2 lean = v_view.xy / max(travel, 1e-3);
	vec2 u = (f - CARD * 0.5) * vec2(1.0, -1.0) / size;
	float radius = length(u);
	float medallion = inked((radius - 1.0) * size);
	vec3 color = vec3(0.1, 0.11, 0.14);
	// The medallion's rim, a fixed bevelled ring.
	float rim = inked((abs(radius - 0.95) - 0.035) * size);
	color = mix(color, mix(vec3(0.5, 0.52, 0.56), vec3(0.92, 0.93, 0.96), 0.5 + 0.5 * u.y), rim);
	float ball = inked((radius - 0.84) * size);
	float seamInk = 0.0;
	float stitchInk = 0.0;
	float along = 0.0;
	if (radius < 0.84) {
		vec2 s = u / 0.84;
		vec3 n = vec3(s, sqrt(max(1.0 - dot(s, s), 0.0)));
		// Into the ball's own frame: undo its yaw with the lean across and its pitch with the lean down.
		float yaw = -lean.x * spin;
		float pitch = lean.y * spin * 0.8;
		vec3 b = vec3(n.x * cos(yaw) + n.z * sin(yaw), n.y, -n.x * sin(yaw) + n.z * cos(yaw));
		b = vec3(b.x, b.y * cos(pitch) - b.z * sin(pitch), b.y * sin(pitch) + b.z * cos(pitch));
		float a = 1.0 - bend;
		float best = 1e3;
		vec3 previous = seamPoint(0.0, a, bend);
		for (int i = 1; i <= 64; i++) {
			float t = float(i) / 64.0 * 6.28318;
			vec3 next = seamPoint(t, a, bend);
			vec3 ab = next - previous;
			float h = clamp(dot(b - previous, ab) / dot(ab, ab), 0.0, 1.0);
			float d = length(b - previous - ab * h);
			if (d < best) { best = d; along = (float(i - 1) + h) / 64.0; }
			previous = next;
		}
		// The seam is a groove; the stitches are dashes either side of it.
		float px = footprint / (size * 0.84);
		seamInk = 1.0 - smoothstep(weight - px, weight + px, best);
		float dash = abs(fract(along * stitches) - 0.5);
		stitchInk = (1.0 - smoothstep(0.05 - px, 0.05 + px, abs(best - 0.075))) * step(dash, 0.28);
		float lightness = 0.62 + 0.38 * dot(n, normalize(vec3(-0.4, 0.5, 0.8)));
		vec3 hide = mix(vec3(0.86, 0.86, 0.84), rainbow(dot(n.xy, lean) * 0.4 + n.x * 0.3), 0.18) * lightness;
		vec3 thread = mix(vec3(0.85, 0.16, 0.16), rainbow(along + lean.x * 0.2), 0.35) * (0.7 + 0.3 * lightness);
		color = mix(color, hide, ball);
		color = mix(color, hide * 0.55, seamInk);
		color = mix(color, thread, stitchInk);
	}
	own = vec4(color, medallion);
	ownFlash = rim * 0.4 + stitchInk * 0.5;
	vec2 around = length(u) > 1e-3 ? normalize(vec2(-u.y, u.x)) : vec2(1.0, 0.0);
	groove = around;
	vivid = 0.5;
`
});
