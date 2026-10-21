import { defineFilm } from './film.ts';

/**
 * Lens lettering (ITW's letter lens effect): rows of small printed 162s under a round magnifying bead. Inside the
 * bead the numerals are magnified and, as the card tilts, slide across it as if seen through a lens under a point
 * light. Magnification and slide are tied, so a stronger lens also moves its numerals further.
 */
export default defineFilm({
	name: 'lens-lettering',
	experimental: true,
	params: {
		print: { value: 0.3, min: 0.1, max: 1, step: 0.01, note: 'Height of the printed numerals, in card units.' },
		size: { value: 1.25, min: 0.4, max: 2.4, step: 0.01, note: 'Bead radius in card units.' },
		magnify: { value: 2.2, min: 1, max: 5, step: 0.05, note: 'How much the bead enlarges the numerals at its centre.' },
		slide: { value: 0.5, min: 0, max: 2, step: 0.01, note: 'Card units the magnified numerals slide at a full lean, per unit of magnification past 1.' },
		travel: { value: 0.12, min: 0.03, max: 0.4, step: 0.005, note: 'Lean, as the sine of the tilt, that counts as a full lean.' }
	},
	helpers: `
// Coverage of the printed rows of 162 at a face position, with letters print units tall.
float lensPrint(vec2 at, float print, float pixel) {
	vec2 cell = vec2(print * 2.7, print * 1.7);
	vec2 g = at / cell;
	g.x += mod(floor(g.y), 2.0) * 0.5;
	vec2 q = (fract(g) - 0.5) * cell / print * vec2(1.0, -1.0);
	float d = (digits162(q) - 0.09) * print;
	return 1.0 - smoothstep(-pixel, pixel, d);
}
`,
	glsl: `
	vec2 f = cardFace(p);
	vec2 lean = v_view.xy / max(travel, 1e-3);
	vec2 c = CARD * 0.5;
	float r = length(f - c) / size;
	float bead = inked((r - 1.0) * size);
	// Strongest at the bead's centre, easing toward its rim.
	float power = mix(magnify, 1.0 + (magnify - 1.0) * 0.4, r * r);
	vec2 seen = c + (f - c) / power + lean * slide * (magnify - 1.0);
	float outside = lensPrint(f, print, footprint);
	float inside = lensPrint(seen, print, footprint / power);
	vec3 ink = mix(vec3(0.85, 0.87, 0.9), rainbow(f.x * 0.1 + f.y * 0.07 + dot(lean, vec2(0.3, 0.2))), 0.5);
	vec3 seenInk = mix(vec3(1.0), rainbow(seen.x * 0.1 + seen.y * 0.07 + dot(lean, vec2(0.3, 0.2))), 0.45);
	// The bead darkens toward its rim, rings at its edge and holds a highlight on the side facing the light.
	vec3 glass = mix(vec3(0.16, 0.17, 0.21), seenInk, inside) * (1.0 - 0.35 * r * r);
	float ring = inked((abs(r - 1.0) - 0.025) * size);
	vec2 spot = c + size * 0.45 * normalize((v_light.xy - 0.5) * CARD + vec2(1e-3));
	float glint = exp(-dot(f - spot, f - spot) / (0.03 * size * size));
	glass = mix(glass, vec3(1.0), max(ring * 0.8, glint * 0.85));
	own = vec4(mix(ink, glass, bead), max(outside, bead));
	ownFlash = bead * (inside * 0.6 + glint * 0.6) + (1.0 - bead) * outside * 0.3;
	groove = vec2(0.6, 0.8);
	vivid = 0.5;
	shade = 0.7;
`
});
