import { definePlate } from './plate.ts';

/** Diamond plate: raised domed lozenges on a grid, alternating their slant like tread plate. */
export default definePlate({
	name: 'diamond-plate',
	feature: 0.12,
	gain: 0.9,
	params: {
		pitch: { value: 0.24, min: 0.05, max: 2, step: 0.005, note: 'Grid spacing between lozenges, in card units.' },
		lozenge: { value: 0.4, min: 0.05, max: 1, step: 0.005, note: 'Half the length of each lozenge, as a share of its cell.' },
		girth: { value: 0.12, min: 0.02, max: 0.6, step: 0.005, note: 'Half the width of each lozenge, as a share of its cell.' },
		alternate: { value: 1, min: 0, max: 1, step: 1, note: '1 alternates the slant like tread plate; 0 slants every lozenge the same way.' }
	},
	height: `
	vec2 q = p / pitch;
	vec2 cell = floor(q);
	vec2 l = fract(q) - 0.5;
	float turn = mod(cell.x + cell.y, 2.0) < 0.5 ? 1.0 : mix(1.0, -1.0, alternate);
	vec2 r = vec2(l.x + turn * l.y, l.y - turn * l.x) * 0.7071;
	// Domed, so each lozenge's whole face turns the light, not just its edge.
	return sqrt(max(1.0 - abs(r.x) / lozenge - abs(r.y) / girth, 0.0));
`
});
