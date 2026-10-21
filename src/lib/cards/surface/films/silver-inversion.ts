import { defineFilm } from './film.ts';

/**
 * Silver inversion (ITW's achrogram): a quartered black and silver crest, two quarters checkered and two solid,
 * that swaps positive for negative in one crisp step as the card leans past a set angle. The solid quarters make the
 * swap read, since an inverted checker alone looks merely shifted. It prints in mono silver, with no rainbow anywhere.
 */
export default defineFilm({
	name: 'silver-inversion',
	experimental: true,
	palette: 'mono-silver',
	params: {
		size: { value: 1.7, min: 0.8, max: 2.4, step: 0.01, note: 'Crest half-height in card units.' },
		squares: { value: 6, min: 2, max: 16, step: 1, note: 'Checker squares across the crest.' },
		flip: { value: 0.3, min: -1, max: 1, step: 0.01, note: 'Lean, in full leans toward the lower right, where the crest inverts; at rest it shows its positive.' },
		sharp: { value: 0.05, min: 0.005, max: 0.4, step: 0.005, note: 'Half-width of the swap, in full leans.' },
		travel: { value: 0.12, min: 0.03, max: 0.4, step: 0.005, note: 'Lean, as the sine of the tilt, that counts as a full lean.' }
	},
	helpers: `
// Signed distance to a heater shield, in crest units: straight sides to the waist, then two arcs to a point.
float inversionShield(vec2 u) {
	vec2 a = vec2(abs(u.x), u.y);
	float box = max(a.x - 0.85, u.y - 0.95);
	float point = length(a - vec2(-0.353, -0.05)) - 1.203;
	return u.y < -0.05 ? max(box, point) : box;
}
`,
	glsl: `
	vec2 f = cardFace(p);
	vec2 lean = v_view.xy / max(travel, 1e-3);
	vec2 u = (f - CARD * 0.5) * vec2(1.0, -1.0) / size;
	float d = inversionShield(u);
	float crest = inked(d * size);
	vec2 square = floor((u + 2.0) * squares * 0.5 / 0.85);
	float checker = mod(square.x + square.y, 2.0);
	// Quartered at the centre line and the waist: black upper left, silver lower right, checkers between.
	bool left = u.x < 0.0;
	bool upper = u.y > -0.05;
	float positive = left && upper ? 0.0 : !left && !upper ? 1.0 : checker;
	float inverted = smoothstep(-sharp, sharp, dot(lean, vec2(0.7071, 0.7071)) - flip);
	float silver = mix(positive, 1.0 - positive, inverted);
	float sheen = 0.88 + 0.1 * sin(f.x * 0.9 + f.y * 0.6 + dot(lean, vec2(2.0, 1.4)));
	vec3 color = mix(vec3(0.07), vec3(0.86, 0.87, 0.9) * sheen, silver);
	float rim = max(inked((abs(d) - 0.025) * size), inked((min(abs(u.x), abs(u.y + 0.05)) - 0.012) * size) * crest);
	color = mix(color, vec3(0.9, 0.91, 0.93), rim);
	own = vec4(color, crest);
	ownFlash = silver * 0.3 + rim * 0.3;
	groove = vec2(0.6, 0.8);
	vivid = 0.4;
`
});
