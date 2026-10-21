import { defineFilm } from './film.ts';

/**
 * Quiet silver island (ITW's achromatic image and matte finish): a baseball silhouette in neutral silver set in
 * noisy rainbow foil, so the one calm shape reads against the speckle. The matte dial turns the silhouette into a
 * matte cutout that ignores the light altogether, for comparing which contrast reads better.
 */
export default defineFilm({
	name: 'quiet-island',
	experimental: true,
	params: {
		size: { value: 1.5, min: 0.6, max: 2.4, step: 0.01, note: 'Silhouette radius in card units.' },
		matte: { value: 0, min: 0, max: 1, step: 1, note: '0 prints the silhouette in achromatic silver that still catches the light; 1 prints a matte cutout.' },
		grain: { value: 7, min: 2, max: 20, step: 0.5, note: 'Foil speckles per card unit round the silhouette.' },
		seam: { value: 0.035, min: 0, max: 0.1, step: 0.001, note: 'Half-width of the seam lines cut through the silhouette, in silhouette radii.' },
		travel: { value: 0.12, min: 0.03, max: 0.4, step: 0.005, note: 'Lean, as the sine of the tilt, that counts as a full lean.' }
	},
	glsl: `
	vec2 f = cardFace(p);
	vec2 lean = v_view.xy / max(travel, 1e-3);
	vec2 u = (f - CARD * 0.5) * vec2(1.0, -1.0) / size;
	// The silhouette is a ball with its two seams cut out.
	float seams = min(abs(length(u - vec2(1.45, 0.0)) - 1.05), abs(length(u + vec2(1.45, 0.0)) - 1.05));
	float shape = max(length(u) - 1.0, -(seams - seam));
	float island = inked(shape * size);
	float sheen = 0.55 + 0.4 * smoothstep(-1.0, 1.0, dot(lean, vec2(0.6, 0.8)) + u.x * 0.25);
	vec3 color = mix(vec3(sheen), vec3(0.74, 0.74, 0.72), matte);
	own = vec4(color, island);
	ownFlash = mix(sheen * 0.35, 0.0, matte);
	// Round it, every speckle has its own groove, so neighbours flash different colours.
	vec2 cell = floor(f * grain);
	float turn = hash(cell + 2.0) * 6.28318;
	groove = vec2(cos(turn), sin(turn));
	seed = hash(cell + 9.0);
	vivid = 1.0;
	cellSize = 1.0 / grain;
`
});
