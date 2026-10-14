import { defineFilm } from './film.ts';

/**
 * QR code: tiles of 25 by 25 modules, each with the three finder squares in its corners and data modules
 * between, every dark module a little mirror whose grooves turn with it.
 */
export default defineFilm({
	name: 'qr-code',
	ground: 0.62,
	params: {
		density: { value: 0.85, min: 0.2, max: 4, step: 0.01, note: 'Modules per card unit; higher packs more, smaller modules.' },
		tileSize: { value: 25, min: 15, max: 61, step: 1, note: 'Modules along each side of a code.' },
		sparsity: { value: 0.55, min: 0, max: 1, step: 0.01, note: 'Share of data modules left light.' },
		dotSize: { value: 0.84, min: 0.1, max: 0.98, step: 0.01, note: 'Width of each dark module\'s solid core, as a share of its square.' },
		spin: { value: 1, min: 0, max: 1, step: 0.01, note: 'Range of groove angles across dark modules, as a share of a full turn; 0 runs them all one way.' }
	},
	glsl: `
	cellSize = 1.0 / (filmScale * density);
	vec2 q = p * filmScale * density;
	vec2 module = floor(q);
	vec2 tile = floor(module / tileSize);
	vec2 local = module - tile * tileSize;
	float dark = step(sparsity, hash(module + tile * 3.1));
	// Finder squares: a 7 by 7 ring, a light ring inside it and a 3 by 3 centre, in three corners.
	for (int c = 0; c < 3; c++) {
		vec2 corner = c == 0 ? vec2(0.0) : c == 1 ? vec2(tileSize - 7.0, 0.0) : vec2(0.0, tileSize - 7.0);
		vec2 d = local - corner;
		if (d.x >= -1.0 && d.y >= -1.0 && d.x <= 7.0 && d.y <= 7.0) {
			float ring = max(abs(d.x - 3.0), abs(d.y - 3.0));
			dark = ring > 3.5 ? 0.0 : ring > 2.5 ? 1.0 : ring > 1.5 ? 0.0 : 1.0;
		}
	}
	vec2 inModule = abs(fract(q) - 0.5);
	float ink = dark * smoothstep(0.5, dotSize * 0.5, max(inModule.x, inModule.y));
	float angle = hash(module + 9.0) * spin * 6.28318;
	groove = normalize(mix(vec2(0.6, 0.8), vec2(cos(angle), sin(angle)), ink) + 1e-4);
	seed = mix(hash(tile) * 0.3, hash(module), ink);
	vivid = mix(0.12, 1.0, ink);
	copper = ink;
`
});
