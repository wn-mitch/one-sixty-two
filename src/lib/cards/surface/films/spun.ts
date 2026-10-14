import { defineFilm } from './film.ts';

/**
 * Spun grooves: circles around the card's centre, a rainbow that sweeps round as the light moves.
 */
export default defineFilm({
	name: 'spun',
	params: {
		cx: { value: 0.5, min: -0.5, max: 1.5, step: 0.01, note: 'Across-card position of the centre the circles spin around, as a fraction of the width.' },
		cy: { value: 0.5, min: -0.5, max: 1.5, step: 0.01, note: 'Down-card position of the centre, as a fraction of the height.' },
		lean: { value: 0, min: -1.5708, max: 1.5708, step: 0.01, note: 'Turns the grooves off the circles toward the radius, so the rings open into a spiral.' },
		colour: { value: 1, min: 0, max: 1.5, step: 0.01, note: 'How saturated the rainbow prints.' }
	},
	glsl: `
	vec2 r = p - CARD * vec2(cx, cy);
	vec2 around = length(r) > 1e-3 ? normalize(vec2(-r.y, r.x)) : vec2(1.0, 0.0);
	groove = mat2(cos(lean), sin(lean), -sin(lean), cos(lean)) * around;
	vivid = colour;
`
});
