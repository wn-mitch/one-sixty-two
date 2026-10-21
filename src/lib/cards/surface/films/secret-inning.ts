import { defineFilm } from './film.ts';

/**
 * Secret inning (ITW's latent effect): an ordinary refractor field with a small EXTRA INNINGS inscription hidden
 * in it. The inscription is absent at every ordinary viewing angle and emerges only when the card is leaned well
 * back, toward an acute angle.
 */
export default defineFilm({
	name: 'secret-inning',
	experimental: true,
	params: {
		reveal: { value: 0.75, min: 0.1, max: 1.5, step: 0.01, note: 'Lean back, in full leans, where the inscription is half shown.' },
		sharp: { value: 0.15, min: 0.01, max: 0.6, step: 0.01, note: 'How gradually it emerges round that lean.' },
		height: { value: 0.2, min: 0.06, max: 0.6, step: 0.005, note: 'Letter height in card units.' },
		y: { value: 0.82, min: 0.05, max: 0.95, step: 0.005, note: 'Where the inscription sits down the card, as a fraction of its height.' },
		travel: { value: 0.12, min: 0.03, max: 0.4, step: 0.005, note: 'Lean, as the sine of the tilt, that counts as a full lean.' }
	},
	glsl: `
	vec2 f = cardFace(p);
	vec2 lean = v_view.xy / max(travel, 1e-3);
	// Dot-matrix letters, five dots by six, with a dot's gap between letters.
	float dotSize = height / 6.0;
	float width = 13.0 * 6.0 * dotSize - dotSize;
	vec2 local = (f - vec2(CARD.x * 0.5 - width * 0.5, CARD.y * y - height * 0.5)) / dotSize;
	int column = int(floor(local.x));
	int row = int(floor(local.y));
	int letter = column / 6;
	float ink = 0.0;
	if (local.x >= 0.0 && row >= 0 && row < 6 && letter < 13 && column % 6 < 5) {
		int glyph = EXTRA_INNINGS[letter];
		if (glyph >= 0 && typeDot(glyph, column % 6, row)) ink = inked((length(fract(local) - 0.5) - 0.42) * dotSize);
	}
	float shown = smoothstep(reveal - sharp, reveal + sharp, lean.y);
	own = vec4(mix(vec3(1.0), rainbow(0.5 + dot(lean, vec2(0.3, 0.5))), 0.5), ink * shown);
	ownFlash = shown;
	// The rest is a plain refractor: one continuous groove, full colour.
	groove = vec2(0.6, 0.8);
	vivid = 1.0;
`
});
