import { defineFilm } from './film.ts';

/**
 * Morphing geometry (the ITW brochure's morphing geometric shapes): a medallion that changes from a hexagon to a
 * six-pointed star as the card leans across, filled with rainbow rings that pulse outward as it leans up and down.
 * The two run on separate axes, and the outline stays silver, so the shape change reads on its own.
 */
export default defineFilm({
	name: 'morphing-geometry',
	experimental: true,
	params: {
		size: { value: 1.6, min: 0.6, max: 2.4, step: 0.01, note: 'Medallion radius in card units.' },
		inner: { value: 0.5, min: 0.2, max: 0.9, step: 0.01, note: 'Star\'s inner corners, as a fraction of its points.' },
		morph: { value: 0.6, min: 0.05, max: 1.5, step: 0.01, note: 'Lean across, in full leans, from all hexagon to all star.' },
		rings: { value: 3.5, min: 0.5, max: 10, step: 0.1, note: 'Rainbow rings per medallion radius.' },
		pulse: { value: 0.6, min: 0, max: 4, step: 0.05, note: 'Rings a full lean up or down pushes outward; a whole number returns to the same picture.' },
		weight: { value: 0.03, min: 0.005, max: 0.1, step: 0.001, note: 'Outline half-width in card units.' },
		travel: { value: 0.12, min: 0.03, max: 0.4, step: 0.005, note: 'Lean, as the sine of the tilt, that counts as a full lean.' }
	},
	helpers: `
// Signed distance to a six-pointed star with points of radius 1 up and at every 60 degrees from there.
float morphStar(vec2 u, float inner) {
	vec2 s = vec2(u.y, -u.x);
	float a = atan(s.y, s.x);
	float local = mod(a + 0.5236, 1.0472) - 0.5236;
	vec2 q = length(s) * vec2(cos(local), abs(sin(local)));
	vec2 tip = vec2(1.0, 0.0);
	vec2 corner = inner * vec2(0.866025, 0.5);
	vec2 edge = corner - tip;
	float side = edge.x * (q.y - tip.y) - edge.y * (q.x - tip.x);
	return segment(q, tip, corner) * (side > 0.0 ? -1.0 : 1.0);
}
`,
	glsl: `
	vec2 f = cardFace(p);
	vec2 lean = v_view.xy / max(travel, 1e-3);
	vec2 u = (f - CARD * 0.5) * vec2(1.0, -1.0) / size;
	// The hexagon's corners sit where the star's points do, so the morph pulls the corners out into points.
	float amount = smoothstep(-morph, morph, lean.x);
	float d = mix(hexagon(u, 0.82), morphStar(u, inner) * 0.9, amount) * size;
	float inside = inked(d);
	float outline = inked(abs(d) - weight);
	vec3 fill = mix(rainbow(length(u) * rings - lean.y * pulse), vec3(1.0), 0.15) * 0.9;
	vec3 color = mix(fill, vec3(0.88, 0.9, 0.94), outline);
	own = vec4(color, max(inside, outline));
	ownFlash = outline * 0.5 + inside * 0.2;
	groove = vec2(0.6, 0.8);
	vivid = 0.5;
`
});
