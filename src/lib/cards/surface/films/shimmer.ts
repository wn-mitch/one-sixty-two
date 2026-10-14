import { defineFilm } from './film.ts';

/**
 * Shimmer: hairline streaks, each laid at its own slight angle, so lines of light skate along the card.
 */
export default defineFilm({
	name: 'shimmer',
	finish: 'brushed',
	params: {
		lines: { value: 6, min: 0.5, max: 40, step: 0.1, note: 'Streaks per card unit down the card.' },
		waver: { value: 2, min: 0, max: 12, step: 0.1, note: 'How far each streak wanders up and down across the card.' },
		stretch: { value: 1.5, min: 0, max: 10, step: 0.05, note: 'How quickly the wander changes along a streak; lower makes long, gentle waves.' },
		tilt: { value: 0.5, min: 0, max: 3.14159, step: 0.01, note: 'Range of angles between streaks, in radians.' },
		colour: { value: 0.45, min: 0, max: 1.5, step: 0.01, note: 'How saturated the streaks print.' }
	},
	glsl: `
	float row = floor(p.y * filmScale * lines + noise(vec2(p.x * stretch, p.y * 3.0)) * waver);
	float angle = (hash(vec2(row, 3.0)) - 0.5) * tilt;
	groove = vec2(cos(angle), sin(angle));
	seed = hash(vec2(row, 11.0));
	vivid = colour;
`
});
