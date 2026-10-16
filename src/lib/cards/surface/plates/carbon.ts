import { definePlate } from './plate.ts';

/** Carbon fibre: a 2x2 twill of rounded tows; the tows running across are black fibre, those running down are the foil. */
export default definePlate({
	name: 'carbon',
	feature: 0.11,
	gain: 0.325616399082569,
	params: {
		weave: { value: 5.99827981651376, min: 2, max: 40, step: 0.1, note: 'Tows per card unit; higher is a tighter weave.' },
		fibres: { value: 140, min: 0, max: 200, step: 1, note: 'How finely the fibre lines run along each tow.' },
		sheen: { value: 0.870508409785933, min: 0, max: 1, step: 0.01, note: 'How strongly the fibre lines ripple each tow.' },
		black: { value: 0.85, min: 0, max: 1, step: 0.01, note: 'How dark the black tows run.' },
		edge: { value: 2, min: 0, max: 2, step: 0.01, note: 'How dark the gaps between tows run.' }
	},
	helpers: `
// Carbon fibre: a 2x2 twill of tows, each rounded across its width and running across or down. The tows
// running across are black fibre and those running down are the foil, so the metal weaves through black.
// weave is tows per card unit, fibres how finely fibre lines run along a tow and sheen how much they ripple it.
// Returns height, whether the tow is black, and how near its edge the point sits.
vec3 carbonWeave(vec2 p, float weave, float fibres, float sheen) {
	vec2 q = p * weave;
	bool across = mod(floor(q.x) - floor(q.y), 4.0) < 2.0;
	float t = fract(across ? q.y : q.x);
	float tow = sin(t * 3.14159);
	float fibre = 0.5 + 0.5 * sin((across ? q.y : q.x) * fibres);
	return vec3(tow * 0.85 + fibre * sheen, across ? 1.0 : 0.0, 1.0 - tow);
}
`,
	height: `
	return carbonWeave(p, weave, fibres, sheen).x;
`,
	shade: `
	vec3 tows = carbonWeave(p, weave, fibres, sheen);
	return vec2(min(tows.y * black + tows.z * tows.z * edge, 1.0), 0.0);
`
});
