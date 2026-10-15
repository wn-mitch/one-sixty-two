import { definePlate } from './plate.ts';

/**
 * Wallpaper: a repeating damask of hooked palmettes, side leaves and fine scrolls. The ornament is a raised die,
 * rather than a colour texture, so its relief catches and releases the foil highlight as the card turns.
 */
export default definePlate({
	name: 'wallpaper',
	feature: 0.055,
	gain: 0.82,
	params: {
		density: { value: 1.7, min: 0.5, max: 5, step: 0.05, note: 'Damask repeats per card unit; higher packs the wallpaper more tightly.' },
		aspect: { value: 1.15, min: 0.6, max: 2, step: 0.01, note: 'Height of each repeat against its width.' },
		petal: { value: 0.92, min: 0.45, max: 1.4, step: 0.01, note: 'Scale of the palmette leaves within each repeat.' },
		curl: { value: 0.16, min: -0.35, max: 0.45, step: 0.01, note: 'Hook in the palmette tips and side leaves.' },
		spread: { value: 0.28, min: 0.12, max: 0.46, step: 0.01, note: 'Distance of the side leaves and scrolls from the central palmette.' },
		ridge: { value: 0.032, min: 0.006, max: 0.09, step: 0.001, note: 'Width of the embossed damask strokes.' }
	},
	helpers: `
// A soft-edged leaf pointing toward +y. Its width swells around the middle, then a hook bends its tip aside.
float wallpaperLeaf(vec2 p, float length, float width, float hook) {
	float t = clamp((p.y + length * 0.5) / length, 0.0, 1.0);
	p.x -= hook * t * t;
	float halfWidth = sin(3.14159 * t) * width + 0.012;
	return max(abs(p.x) - halfWidth, abs(p.y) - length * 0.5);
}

vec2 wallpaperTurn(vec2 p, float angle) {
	float c = cos(angle);
	float s = sin(angle);
	return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

// One damask repeat: an upright palmette, paired side leaves and circular scrolls joined by a stem.
float wallpaperDamask(vec2 p, float petal, float curl, float spread) {
	float d = wallpaperLeaf(p - vec2(0.0, 0.12), 0.84 * petal, 0.19 * petal, curl);
	d = min(d, wallpaperLeaf(wallpaperTurn(p - vec2(-spread, -0.03), -0.86), 0.54 * petal, 0.13 * petal, curl * 0.55));
	d = min(d, wallpaperLeaf(wallpaperTurn(p - vec2(spread, -0.03), 0.86), 0.54 * petal, 0.13 * petal, -curl * 0.55));
	d = min(d, wallpaperLeaf(p - vec2(0.0, -0.36), 0.38 * petal, 0.105 * petal, -curl * 0.45));
	float stem = max(abs(p.x) - 0.018, abs(p.y + 0.14) - 0.42 * petal);
	float scrollL = abs(length(p - vec2(-spread * 1.05, -0.29)) - 0.13 * petal) - 0.022;
	float scrollR = abs(length(p - vec2(spread * 1.05, -0.29)) - 0.13 * petal) - 0.022;
	return min(d, min(stem, min(scrollL, scrollR)));
}

// The nearest ornamental stroke in the repeating, half-offset wallpaper. A 3x3 neighbourhood covers every scroll.
float wallpaperNearest(vec2 q, float aspect, float petal, float curl, float spread) {
	float best = 1e5;
	float row0 = floor(q.y / aspect);
	for (int j = -1; j <= 1; j++) {
		float row = row0 + float(j);
		float shift = mod(row, 2.0) * 0.5;
		float col0 = floor(q.x - shift);
		for (int i = -1; i <= 1; i++) {
			vec2 center = vec2(col0 + float(i) + shift + 0.5, (row + 0.5) * aspect);
			vec2 local = vec2(q.x - center.x, (q.y - center.y) / aspect);
			best = min(best, wallpaperDamask(local, petal, curl, spread));
		}
	}
	return best;
}
`,
	height: `
	float d = wallpaperNearest(p * density, aspect, petal, curl, spread);
	float broad = 1.0 - smoothstep(ridge * 1.8, ridge * 3.6, abs(d));
	float crest = 1.0 - smoothstep(0.0, ridge, abs(d));
	return (broad * 0.32 + crest * 0.68) * 0.18 / density;
`
});
