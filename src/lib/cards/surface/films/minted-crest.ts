import { defineFilm } from './film.ts';

/**
 * Minted crest (ITW's embossed effect): a foil-stamped 162 seal that is flat but reads as raised. The bevel round
 * its rim and numerals is shaded from the light's side, so tilting carries each bevel face from bright to dark;
 * flat tops carry a soft radial grating and the recessed field a sunburst.
 */
export default defineFilm({
	name: 'minted-crest',
	experimental: true,
	params: {
		size: { value: 1.6, min: 0.8, max: 2.4, step: 0.01, note: 'Seal radius in card units.' },
		bevel: { value: 0.09, min: 0.01, max: 0.2, step: 0.005, note: 'Bevel width, as a fraction of the seal radius.' },
		stroke: { value: 0.075, min: 0.03, max: 0.15, step: 0.005, note: 'Half-width of the numerals, as a fraction of the seal radius.' },
		swing: { value: 1.5, min: 0, max: 4, step: 0.05, note: 'How far a full lean swings the light round the seal; above about 1 it crosses to the far side.' },
		travel: { value: 0.12, min: 0.03, max: 0.4, step: 0.005, note: 'Lean, as the sine of the tilt, that counts as a full lean.' }
	},
	helpers: `
// Signed distance to the seal's raised parts, in seal radii: its rim and the numerals.
float crestRaised(vec2 u, float stroke) {
	float rim = abs(length(u) - 0.92) - 0.07;
	return min(rim, digits162(u / 0.46) * 0.46 - stroke);
}
`,
	glsl: `
	vec2 f = cardFace(p);
	vec2 lean = v_view.xy / max(travel, 1e-3);
	vec2 u = (f - CARD * 0.5) * vec2(1.0, -1.0) / size;
	float radius = length(u);
	float seal = inked((radius - 1.0) * size);
	float d = crestRaised(u, stroke);
	float e = 0.004;
	vec2 slope = vec2(crestRaised(u + vec2(e, 0.0), stroke) - crestRaised(u - vec2(e, 0.0), stroke), crestRaised(u + vec2(0.0, e), stroke) - crestRaised(u - vec2(0.0, e), stroke));
	vec2 outward = length(slope) > 1e-6 ? normalize(slope) : vec2(0.0);
	// The light rests at the upper left and swings with the lean, so a bevel face turns bright toward it and dark away.
	vec2 toward = normalize(vec2(lean.x, -lean.y) * swing + vec2(-0.6, 0.6));
	float facing = 0.5 - 0.5 * dot(outward, toward);
	vec3 deep = vec3(0.3, 0.19, 0.05);
	vec3 gold = vec3(0.9, 0.68, 0.28);
	vec3 hot = vec3(1.0, 0.94, 0.7);
	float raised = inked(d * size);
	float onBevel = raised * (1.0 - smoothstep(bevel * 0.6, bevel, -d));
	vec3 top = mix(gold, rainbow(radius * 2.0 + dot(lean, vec2(0.6, 0.4))), 0.2);
	vec3 bevelColor = mix(deep, hot, pow(facing, 1.5));
	// The recessed field is a sunburst grating, darker than the raised metal.
	float theta = atan(u.y, u.x);
	vec3 field = mix(gold * 0.45, rainbow(theta * 0.477 + dot(lean, vec2(0.5, 0.5))), 0.25) * (0.75 + 0.25 * cos(theta * 48.0));
	vec3 color = mix(field, mix(top, bevelColor, onBevel), raised);
	own = vec4(color, seal);
	ownFlash = onBevel * pow(facing, 3.0) * 0.8;
	groove = vec2(0.6, 0.8);
	vivid = 0.6;
`
});
