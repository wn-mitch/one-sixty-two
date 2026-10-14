import { definePlate } from './plate.ts';

/** Sunburst: fine rays fanning out from a point below the bottom of the card. */
export default definePlate({
	name: 'sunburst',
	feature: 0.12,
	params: {
		rays: { value: 120, min: 4, max: 600, step: 1, note: 'Rays around the full circle; whole numbers avoid a seam.' },
		cx: { value: 2.5, min: -5, max: 10, step: 0.01, note: 'Where the rays start across the card; the card is 5 wide.' },
		cy: { value: 8.5, min: -5, max: 15, step: 0.01, note: 'Where the rays start down the card; the card is 7 tall, so 8.5 sits below it.' },
		sharp: { value: 3, min: 0.5, max: 30, step: 0.1, note: 'How thin each ray is.' },
		twist: { value: 0, min: -60, max: 60, step: 0.1, note: 'Curls the rays into a spiral; 0 keeps them straight.' }
	},
	height: `
	vec2 d = p - vec2(cx, cy);
	return pow(0.5 + 0.5 * cos(atan(d.y, d.x) * rays + length(d) * twist), sharp);
`
});
