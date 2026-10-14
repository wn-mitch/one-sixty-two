import { definePlate } from './plate.ts';

/**
 * Leaf: one big sheet of metal leaf crumpled and smoothed back out. Folds crease it everywhere into sharp ridges and
 * valleys that run a little way and fade, with a finer layer of crinkles over them, so every facet catches the light
 * at its own angle.
 */
export default definePlate({
	name: 'leaf',
	feature: 0.05,
	gain: 2.05,
	scale: 0.48,
	params: {
		crinkle: { value: 5.8, min: 0.5, max: 12, step: 0.1, note: 'Folds per card unit; higher crumples the leaf finer.' },
		crush: { value: 0.32, min: 0, max: 1.5, step: 0.01, note: 'How deep the folds run.' },
		fine: { value: 0.35, min: 0, max: 1, step: 0.01, note: 'Strength of the finer crinkles over the folds.' }
	},
	helpers: `
// Crumpled leaf: three V-shaped folds per grid cell, each a crease along a random line that fades out within a cell
// of a random point, summed over the neighbouring cells so the sheet folds without breaking or showing the grid.
float leafFolds(vec2 q, float seed) {
	vec2 cell = floor(q);
	float height = 0.0;
	for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
		vec2 c = cell + vec2(float(i), float(j));
		for (int fold = 0; fold < 3; fold++) {
			vec2 key = c + seed + float(fold) * 17.3;
			vec2 d = q - c - hash2(key);
			float angle = hash(key + 7.1) * 3.14159;
			float crease = abs(dot(d, vec2(cos(angle), sin(angle))));
			height += (hash(key + 3.7) - 0.35) * crease * exp(-dot(d, d) * 4.0);
		}
	}
	return height;
}
`,
	height: `
	vec2 q = p * crinkle;
	return (leafFolds(q, 0.0) + leafFolds(q * 2.7 + 5.3, 41.0) * fine * 0.4) * crush * 2.5;
`
});
