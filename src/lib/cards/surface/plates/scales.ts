import { definePlate } from './plate.ts';

/** Scales: overlapping rounded scales like snakeskin, each domed toward its free edge so the rows ripple as the card turns. */
export default definePlate({
	name: 'scales',
	feature: 0.12,
	params: {
		size: { value: 3.2, min: 1, max: 16, step: 0.1, note: 'Scales per card unit across.' },
		dome: { value: 1.4, min: 0.2, max: 4, step: 0.05, note: 'How sharply each scale rises toward its edge.' },
		stretch: { value: 0.55, min: 0.3, max: 1.5, step: 0.01, note: 'Row spacing against the scale width; lower overlaps the rows more.' }
	},
	height: `
	vec2 q = vec2(p.x * size, p.y * size / stretch);
	// Each scale is a disc hanging below its row line; rows are laid from the bottom up, so every row covers the top of
	// the one beneath and only its rounded lower edge shows.
	float height = 0.0;
	for (int j = 1; j >= -1; j--) {
		float row = floor(q.y) + float(j);
		float shift = mod(row, 2.0) * 0.5;
		float cx = floor(q.x - shift + 0.5) + shift;
		for (int i = -1; i <= 1; i++) {
			vec2 d = vec2(q.x - cx - float(i), (q.y - row) * stretch);
			float r = length(d) / 0.62;
			if (r < 1.0 && d.y > -0.1) height = pow(r, dome);
		}
	}
	return height;
`
});
