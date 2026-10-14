import { defineFilm } from './film.ts';

/**
 * Dollar: upright, double-barred gold dollar signs on a smooth ground, set on a diamond lattice so each row sits
 * between the signs of the next. Each sign flashes as one solid shape.
 */
export default defineFilm({
	name: 'dollar',
	ground: 0.9,
	params: {
		density: { value: 0.17, min: 0.03, max: 1, step: 0.005, note: 'Signs per card unit; higher packs more, smaller signs.' },
		across: { value: 0.23, min: 0.15, max: 1, step: 0.01, note: 'Half the lattice spacing across, in sign units.' },
		down: { value: 0.5, min: 0.25, max: 1.5, step: 0.01, note: 'Half the lattice spacing down, in sign units.' },
		weight: { value: 0.049, min: 0.01, max: 0.15, step: 0.001, note: 'Stroke thickness of the S and its bars.' },
		bowl: { value: 0.105, min: 0.04, max: 0.25, step: 0.005, note: 'Radius of the two bowls that make the S.' },
		barGap: { value: 0.045, min: 0, max: 0.2, step: 0.005, note: 'How far each bar sits from the middle; 0 merges them into one.' },
		barLength: { value: 0.33, min: 0, max: 0.6, step: 0.01, note: 'How far the bars reach above and below the middle.' }
	},
	glsl: `
	cellSize = 0.6 / (filmScale * density);
	// The diamond lattice: across and down are half a cell's width and height, in sign units.
	vec2 q = p * filmScale * density;
	vec2 g = q / vec2(across, down);
	vec2 r = vec2(g.x + g.y, g.y - g.x) * 0.5;
	vec2 cell = floor(r);
	vec2 f = fract(r) - 0.5;
	// Back to sign units, upright; card y runs down, so c flips it up.
	vec2 c = vec2(f.x - f.y, -(f.x + f.y)) * vec2(across, down);
	vec2 top = c - vec2(0.0, bowl);
	vec2 bottom = c - vec2(0.0, -bowl);
	float upper = abs(length(top) - bowl);
	float lower = abs(length(bottom) - bowl);
	// The top bowl opens at its lower right and the bottom bowl at its upper left, which makes the S.
	if (top.x > 0.0 && top.y < 0.0 && top.x > -top.y * 0.3) upper = 1.0;
	if (bottom.x < 0.0 && bottom.y > 0.0 && -bottom.x > bottom.y * 0.3) lower = 1.0;
	// Two bars through the S, the older double-struck dollar.
	float bar = abs(c.y) < barLength ? abs(abs(c.x) - barGap) : 1.0;
	float stroke = min(min(upper, lower), bar * 1.8);
	float ink = smoothstep(weight, weight * 0.6, stroke);
	// The whole sign shares one groove, so it flashes as one solid shape rather than breaking up round its curves.
	vec2 dir = vec2(0.0, 1.0);
	// The ground is one continuous groove, so it sweeps in one colour and only the signs stand out.
	groove = normalize(mix(vec2(0.62, 0.78), dir, ink) + 1e-4);
	seed = mix(0.0, hash(cell + 5.0), ink);
	vivid = mix(0.15, 1.0, ink);
	copper = ink;
	copperPad = ink * 0.9;
`
});
