import { defineFinish } from '../films/film.ts';

/** Sparkle: glitter flakes set at random tilts, each flashing on its own as the card turns. */
export default defineFinish({
	name: 'sparkle',
	params: {
		density: { value: 40, min: 5, max: 160, step: 1, note: 'Flakes per card unit.' },
		tilt: { value: 0.6, min: 0, max: 2, step: 0.01, note: 'How far each flake leans.' }
	},
	glsl: `
	tilt *= resolve(1.0 / density);
	vec2 cell = floor(p * density);
	vec2 lean = hash2(cell + 11.0) - 0.5;
	normal = normalize(normal + vec3(lean * tilt, 0.0));
	sweep += (hash(cell + 3.0) - 0.5) * tilt * 0.5;
`
});
