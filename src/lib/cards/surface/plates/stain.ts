import { definePlate } from './plate.ts';

/** Stain: heat-tint patina, many small oxide spots in temper colours over flat steel; the scene's stain dial sets how many. */
export default definePlate({
	name: 'stain',
	feature: 0.2,
	params: {
		spots: { value: 4, min: 1, max: 20, step: 0.1, note: 'Large spots per card unit; higher makes them smaller and closer.' },
		fine: { value: 9, min: 2, max: 40, step: 0.1, note: 'Fine spots per card unit in the second scatter that fills heavy stains.' },
		size: { value: 1, min: 0.2, max: 2, step: 0.01, note: 'Grows or shrinks every spot.' },
		ragged: { value: 0.7, min: 0, max: 3, step: 0.01, note: 'How ragged the spot edges are; 0 leaves clean circles.' },
		film: { value: 1, min: 0, max: 2, step: 0.01, note: 'How strongly the oxide tints the steel.' }
	},
	helpers: `
// Stain: heat-tint patina, the CS "Stained" look. Many small oxide spots scatter over the steel, each with its
// own size, ragged edge and temper colour; plateStain sets how many there are. spots and fine are each scatter's
// density, size scales every spot and ragged roughens their edges. Returns coverage and the spot's heat.
vec2 stainSpots(vec2 p, float spots, float fine, float size, float ragged) {
	float cover = 0.0;
	float heat = 0.0;
	// Two scatters: larger spots, and from about half coverage up a second, finer one that fills between them.
	for (int layer = 0; layer < 2; layer++) {
		float density = layer == 0 ? spots : fine;
		float chance = layer == 0 ? plateStain * 1.15 : plateStain * 1.6 - 0.5;
		vec2 q = p * density + float(layer) * 17.3;
		vec2 cell = floor(q);
		for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
			vec2 c = cell + vec2(float(i), float(j));
			if (hash(c + 41.0) > chance) continue;
			// Spots grow with coverage, so a heavy stain merges into a mottled crust. A spot past 0.7 of a cell
			// would be clipped by the neighbours searched, so it stops there.
			float radius = min((0.1 + 0.4 * hash(c + 7.0) * hash(c + 13.0)) * mix(0.8, 1.6, plateStain) * size, 0.7);
			float d = length(q - c - hash2(c + 3.0)) / radius + (noise(q * 3.0 + c * 1.7) - 0.5) * ragged;
			float spot = smoothstep(1.0, 0.7, d);
			if (spot > cover) heat = hash(c + 19.0);
			cover = max(cover, spot);
		}
	}
	return vec2(cover, heat);
}
`,
	height: `
	return 0.0;
`,
	shade: `
	return vec2(0.0, stainSpots(p, spots, fine, size, ragged).x * film);
`,
	tint: `
	return temperTint(stainSpots(p, spots, fine, size, ragged).y);
`
});
