import { definePlate } from './plate.ts';

/** Weld: columns of TIG beads, each a dome of stacked crescent ripples, with bands of heat tint either side. */
export default definePlate({
	name: 'weld',
	feature: 0.075,
	params: {
		spacing: { value: 0.45, min: 0.1, max: 3, step: 0.01, note: 'Distance between bead columns, in card units.' },
		width: { value: 0.16, min: 0.02, max: 1, step: 0.005, note: 'Half the width of each bead; past half the spacing, beads overlap.' },
		pitch: { value: 0.075, min: 0.01, max: 0.5, step: 0.001, note: 'Distance between ripples along a bead.' },
		crescent: { value: 1.2, min: 0, max: 6, step: 0.01, note: 'How far each ripple curves into a crescent; 0 runs them straight across.' },
		wander: { value: 0.03, min: 0, max: 0.3, step: 0.001, note: 'How far each bead wanders off a straight line.' },
		glow: { value: 0.8, min: 0, max: 2, step: 0.01, note: 'How strongly the heat tint colours the steel beside the beads.' }
	},
	helpers: `
// Weld: columns of TIG beads run down the plate, close together. Each bead is a dome of stacked crescent ripples, like overlapping
// coins, and the steel either side carries bands of heat tint. spacing, width, pitch, crescent and wander set the
// column spacing, bead half-width, ripple spacing, ripple curve and meander. Returns the bead's height and how near
// the heat zone a point sits (1 on the bead's edge, 0 clear of it).
vec2 weldBead(vec2 p, float spacing, float width, float pitch, float crescent, float wander) {
	p = p.yx;
	float row = floor(p.y / spacing);
	float centre = (row + 0.5) * spacing + sin(p.x * 1.3 + row * 2.1) * wander;
	float across = (p.y - centre) / width;
	float dome = sqrt(max(1.0 - across * across, 0.0));
	float ripple = fract((p.x + row * 0.37) / pitch + across * across * crescent);
	float height = dome * (0.7 + 0.3 * smoothstep(0.0, 0.75, ripple) * (1.0 - smoothstep(0.85, 1.0, ripple)));
	float heat = abs(across) > 1.0 ? smoothstep(1.4, 1.0, abs(across)) : 0.0;
	return vec2(height, heat);
}
`,
	height: `
	return weldBead(p, spacing, width, pitch, crescent, wander).x;
`,
	shade: `
	return vec2(0.0, weldBead(p, spacing, width, pitch, crescent, wander).y * glow);
`,
	tint: `
	return temperTint(1.0 - weldBead(p, spacing, width, pitch, crescent, wander).y);
`
});
