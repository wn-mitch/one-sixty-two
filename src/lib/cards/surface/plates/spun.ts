import { definePlate } from './plate.ts';

/** Spun: concentric lathe rings around a centre, with a little chatter where the tool wavered. */
export default definePlate({
	name: 'spun',
	feature: 0.12,
	params: {
		rings: { value: 50, min: 5, max: 300, step: 0.5, note: 'How tightly the rings pack.' },
		cx: { value: 2.5, min: -5, max: 10, step: 0.01, note: 'Ring centre across the card; the card is 5 wide.' },
		cy: { value: 3.5, min: -5, max: 12, step: 0.01, note: 'Ring centre down the card; the card is 7 tall.' },
		chatter: { value: 0.35, min: 0, max: 3, step: 0.01, note: 'How much the rings wobble; 0 is a perfect lathe.' },
		lobes: { value: 7, min: 0, max: 40, step: 1, note: 'Wobbles around each ring.' },
		twist: { value: 9, min: 0, max: 60, step: 0.1, note: 'How fast the wobble rotates from ring to ring, which spirals it outward.' }
	},
	height: `
	vec2 d = p - vec2(cx, cy);
	float r = length(d);
	return 0.5 + 0.5 * sin(r * rings + sin(atan(d.y, d.x) * lobes + r * twist) * chatter);
`
});
