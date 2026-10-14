import { defineFilm } from './film.ts';

/**
 * HGH sequence: the hormone's 191 residues as gold dot-matrix microtext, line after line, each line picking up the
 * sequence further along and every square dot grooved to throw rainbow along the line.
 */
export default defineFilm({
	name: 'hgh-sequence',
	scale: 1.44,
	ground: 1.16,
	params: {
		density: { value: 2.2, min: 0.5, max: 8, step: 0.05, note: 'Dots per card unit; higher sets smaller type.' },
		tracking: { value: 1, min: 0, max: 6, step: 1, note: 'Blank dots between letters.' },
		leading: { value: 1, min: 0, max: 8, step: 1, note: 'Blank dots between lines.' },
		lineShift: { value: 75, min: 0, max: 191, step: 1, note: 'How many residues the sequence advances from one line to the next.' },
		dotSize: { value: 0.77, min: 0.1, max: 0.98, step: 0.01, note: 'Width of each dot\'s solid core, as a share of its square.' }
	},
	glsl: `
	// The fade keys on a pair of dots: letters still read as gold texture down to a couple of pixels a dot.
	cellSize = 2.0 / (filmScale * density);
	// Each letter is 5 dots wide and 6 high, with tracking and leading blank dots after it.
	vec2 q = p * filmScale * density;
	vec2 pitch = vec2(5.0 + tracking, 6.0 + leading);
	float line = floor(q.y / pitch.y);
	float column = floor(q.x / pitch.x);
	vec2 slot = mod(q, pitch);
	int dx_ = int(slot.x);
	int dy_ = int(slot.y);
	bool lit = dx_ < 5 && dy_ < 6 && microDot(column + line * lineShift, dx_, dy_);
	vec2 inDot = abs(fract(q) - 0.5);
	float ink = lit ? smoothstep(0.5, dotSize * 0.5, max(inDot.x, inDot.y)) : 0.0;
	groove = normalize(mix(vec2(0.6, 0.8), vec2(1.0, 0.0), ink) + 1e-4);
	seed = mix(hash(vec2(line, 3.0)) * 0.3, hash(vec2(column, line)), ink);
	vivid = mix(0.12, 1.0, ink);
	copper = ink;
	copperPad = ink * 0.75;
`
});
