import { defineFilm } from './film.ts';

/**
 * Fibonacci: a sunflower head of seeds set at the golden angle from the card's centre, each seed a little
 * dish; its neighbours sit at Fibonacci offsets, so those are the only ones to check.
 */
export default defineFilm({
	name: 'fibonacci',
	ground: 0.62,
	params: {
		seedSpacing: { value: 2.4, min: 0.4, max: 10, step: 0.05, note: 'Distance between neighbouring seeds; higher grows a larger head.' },
		seedSize: { value: 0.85, min: 0.1, max: 1.5, step: 0.01, note: 'Seed radius as a share of the spacing.' },
		divergence: { value: 1, min: 0.5, max: 1.5, step: 0.0001, note: 'Turn between successive seeds, as a share of the golden angle; 1 packs them evenly, and any other opens gaps and spokes.' },
		centreX: { value: 0.5, min: 0, max: 1, step: 0.01, note: 'Across position of the head\'s centre, as a share of the card width.' },
		centreY: { value: 0.45, min: 0, max: 1, step: 0.01, note: 'Down position of the head\'s centre, as a share of the card height.' }
	},
	glsl: `
	vec2 centre = CARD * vec2(centreX, centreY) + v_view.zw;
	float spacing = seedSpacing / filmScale;
	cellSize = spacing;
	vec2 r = p - centre;
	float n0 = dot(r, r) / (spacing * spacing);
	float best = 1e4;
	float bestN = 0.0;
	const float GOLDEN = 2.39996323;
	float turn = GOLDEN * divergence;
	for (int k = 0; k < 12; k++) {
		float offset = k == 0 ? 0.0 : k == 1 ? 1.0 : k == 2 ? 2.0 : k == 3 ? 3.0 : k == 4 ? 5.0 : k == 5 ? 8.0 : k == 6 ? 13.0 : k == 7 ? 21.0 : k == 8 ? 34.0 : k == 9 ? 55.0 : k == 10 ? 89.0 : 144.0;
		for (int sgn = -1; sgn <= 1; sgn += 2) {
			float n = floor(n0 + 0.5) + float(sgn) * offset;
			if (n < 0.0) continue;
			vec2 seedAt = sqrt(n) * spacing * vec2(cos(n * turn), sin(n * turn));
			float d = length(r - seedAt);
			if (d < best) { best = d; bestN = n; }
		}
	}
	float size = spacing * seedSize;
	float ink = smoothstep(size, size * 0.8, best);
	vec2 toward = best > 1e-4 ? normalize(r - sqrt(bestN) * spacing * vec2(cos(bestN * turn), sin(bestN * turn))) : vec2(1.0, 0.0);
	groove = normalize(mix(vec2(0.6, 0.8), vec2(-toward.y, toward.x), ink) + 1e-4);
	// Seeds along the same spiral arm share a colour, so the arms read in both directions.
	seed = mix(0.1, fract(bestN / 21.0) * 0.5 + fract(bestN / 34.0) * 0.5, ink);
	vivid = mix(0.12, 1.0, ink);
	copper = ink;
	copperPad = ink * smoothstep(size * 0.35, 0.0, best);
`
});
