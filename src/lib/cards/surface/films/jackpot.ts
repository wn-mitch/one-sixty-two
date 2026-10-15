import { defineFilm } from './film.ts';

/**
 * Jackpot: every era's film, from the 1950s bubbles to the 2020s dollar signs, flickering through in a shuffled
 * order and almost always mid-crossfade, so the card looks like it hides a surprise.
 */
export default defineFilm({
	name: 'jackpot',
	animated: true,
	blend: ['atomic', 'mojo', 'carpet', 'xfractor', 'circuit', 'double-helix', 'cracked-ice', 'dollar'],
	params: {
		hold: { value: 0.1, min: 0, max: 10, step: 0.05, note: 'Seconds each era\'s film holds before the next fades in.' },
		fade: { value: 0.4, min: 0.05, max: 6, step: 0.05, note: 'Seconds each crossfade takes.' }
	},
	glsl: ''
});
