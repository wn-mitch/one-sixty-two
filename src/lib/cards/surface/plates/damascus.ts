import { definePlate } from './plate.ts';

/** Damascus: pattern-welded steel, many thin folded layers swept through broad swirls; its dark layers darken the metal. */
export default definePlate({
	name: 'damascus',
	feature: 0.0625,
	params: {
		folds: { value: 16, min: 2, max: 80, step: 0.5, note: 'How many layers pack into each sweep; higher is finer steel.' },
		breadth: { value: 0.6, min: 0.05, max: 4, step: 0.01, note: 'How often the broad swirls turn; lower makes them broader.' },
		twist: { value: 2.4, min: 0, max: 10, step: 0.05, note: 'How hard the swirls drag the layers around.' },
		wander: { value: 1, min: 0, max: 4, step: 0.01, note: 'How far the layers meander between swirls.' },
		chatter: { value: 1, min: 0, max: 10, step: 0.05, note: 'How much each line jitters where the hammer moved it.' },
		bite: { value: 3, min: 1, max: 12, step: 0.1, note: 'How thin the layers run in the darker stretches between bright bunches.' }
	},
	helpers: `
// Damascus: pattern-welded steel. Many thin folded layers sweep through broad swirls, each line jittering
// where the hammer moved it, and the layers bunch into tight bright groups between darker runs. folds sets the
// layer count, breadth and twist the swirls, wander the meander, chatter the jitter and bite the dark runs' thinness.
float damascus(vec2 p, float folds, float breadth, float twist, float wander, float chatter, float bite) {
	vec2 swirl = vec2(noise(p * breadth), noise(p * breadth + 5.2));
	vec2 q = p + (swirl - 0.5) * twist;
	float flow = (noise(q * 0.9) * 2.2 + noise(q * 2.2 + 3.0) * 0.8) * wander;
	float jitter = (noise(p * vec2(30.0, 12.0)) * 0.035 + noise(p * 70.0) * 0.012) * chatter;
	float layers = 0.5 + 0.5 * sin((q.y * 0.6 + q.x * 0.35 + flow + jitter) * 6.28318 * folds);
	float bunch = smoothstep(0.3, 0.7, noise(q * 1.6 + 2.0));
	return pow(layers, mix(bite, 1.2, bunch));
}
`,
	height: `
	return damascus(p, folds, breadth, twist, wander, chatter, bite) * 0.08;
`,
	shade: `
	// Thinner than a few pixels the layers would alias, so they settle to an even grey instead.
	float resolved = smoothstep(1.5, 3.5, 0.0625 / (footprint * plateScale));
	return vec2(1.0 - smoothstep(0.2, 0.7, mix(0.4, damascus(p, folds, breadth, twist, wander, chatter, bite), resolved)), 0.0);
`
});
