import { defineFilm } from './film.ts';

/**
 * Floating constellation (ITW's 2D/3D multi-plane): three printed planes at different apparent depths. Stars float
 * above a diamond grid that sits on the card's surface, and a field of tiny dots lies recessed beneath it. Tilt
 * slides the stars one way and the dots the other while the grid and the printed border hold still, so the border
 * is the depth reference.
 */
export default defineFilm({
	name: 'floating-constellation',
	experimental: true,
	params: {
		density: { value: 0.12, min: 0.04, max: 0.4, step: 0.005, note: 'Star cells per card unit; about half hold a star.' },
		above: { value: 0.35, min: 0, max: 1.5, step: 0.01, note: 'How far the stars slide at a full lean, in card units: their height above the grid.' },
		below: { value: 0.22, min: 0, max: 1.5, step: 0.01, note: 'How far the dots slide the other way: their depth beneath the grid.' },
		grid: { value: 0.62, min: 0.2, max: 2, step: 0.01, note: 'Diamond grid spacing across, in card units.' },
		dots: { value: 0.2, min: 0.06, max: 0.6, step: 0.005, note: 'Spacing of the recessed dots, in card units.' },
		weight: { value: 0.01, min: 0.003, max: 0.04, step: 0.001, note: 'Grid and border line half-width in card units.' },
		travel: { value: 0.12, min: 0.03, max: 0.4, step: 0.005, note: 'Lean, as the sine of the tilt, that counts as a full lean.' }
	},
	glsl: `
	vec2 f = cardFace(p);
	vec2 lean = v_view.xy / max(travel, 1e-3);
	vec3 color = vec3(0.06, 0.07, 0.11);
	// Beneath: tiny dots, jittered on a fine grid, sliding against the lean.
	vec2 fd = f + lean * below;
	vec2 dotCell = floor(fd / dots);
	vec2 dotAt = (dotCell + 0.3 + 0.4 * hash2(dotCell + 7.0)) * dots;
	float dotInk = inked(length(fd - dotAt) - dots * 0.16) * resolve(dots * 0.32);
	color = mix(color, vec3(0.45, 0.52, 0.72), dotInk);
	// The surface: a diamond grid that never moves.
	vec2 lattice = vec2(f.x / grid + f.y / (grid * 1.4), f.x / grid - f.y / (grid * 1.4));
	vec2 off = abs(fract(lattice) - 0.5);
	float gridInk = inked((0.5 - max(off.x, off.y)) * grid * 0.57 - weight);
	color = mix(color, vec3(0.66, 0.69, 0.76), gridInk * 0.75);
	// Above: stars in about half the cells, sliding with the lean.
	float cells = filmScale * density;
	vec2 fs = f - lean * above;
	vec2 starCell = floor(fs * cells);
	float pick = hash(starCell + 11.0);
	vec2 starAt = (starCell + 0.3 + 0.4 * hash2(starCell + 13.0)) / cells;
	float starSize = (0.32 + 0.4 * hash(starCell + 17.0)) / cells * 0.35;
	float starInk = pick < 0.5 ? inked(star5((fs - starAt) * vec2(1.0, -1.0), starSize, 0.45)) : 0.0;
	vec3 starColor = mix(vec3(1.0), rainbow(pick * 2.0 + dot(lean, vec2(0.3, 0.2))), 0.45);
	color = mix(color, starColor, starInk);
	// The printed border, on the surface with the grid.
	vec2 edge = abs(f - CARD * 0.5) - (CARD * 0.5 - 0.2);
	float frame = inked(abs(max(edge.x, edge.y)) - weight * 2.0);
	color = mix(color, vec3(0.86, 0.88, 0.92), frame);
	own = vec4(color, 1.0);
	ownFlash = starInk * 0.8 + frame * 0.3;
	cellSize = 1.0 / cells;
`
});
