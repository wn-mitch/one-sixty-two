import { defineFilm } from './film.ts';

/**
 * Carpet: the Atlanta Marriott Marquis lobby carpet. Mosaic rosettes of tile rings sit on a square grid with gold
 * grout between every tile, and a split diamond in a field of small square tiles fills each gap between them.
 */
export default defineFilm({
	name: 'carpet',
	ground: 1.0,
	params: {
		density: { value: 0.084, min: 0.01, max: 0.4, step: 0.001, note: 'Rosettes per card unit; higher packs more, smaller rosettes.' },
		groutWidth: { value: 0.007, min: 0.001, max: 0.05, step: 0.001, note: 'Thickness of the gold grout lines between tiles.' },
		spokeCount: { value: 8, min: 2, max: 32, step: 1, note: 'Tiles in the innermost ring; each ring outward doubles it, up to the third.' },
		fieldTiles: { value: 10, min: 2, max: 30, step: 1, note: 'Small square tiles across each field between rosettes.' },
		diamond: { value: 0.16, min: 0.02, max: 0.5, step: 0.01, note: 'Size of the split diamond where four rosettes meet.' },
		ringTurn: { value: 1.2, min: 0, max: 3.14159, step: 0.01, note: 'How far the grooves turn from one ring to the next, in radians.' },
		jitter: { value: 0.54, min: 0, max: 3.14159, step: 0.01, note: 'Random turn of each tile\'s grooves within its ring.' }
	},
	glsl: `
	cellSize = 0.1 / (filmScale * density);
	// Carpet: the Atlanta Marriott Marquis lobby carpet. Mosaic rosettes on a square grid, each a hub and rings of
	// tiles cut by spokes that double outward, with gold grout between every tile. Where four rosettes meet, a
	// diamond split in four sits in a field of small square tiles. Each ring flashes its own colour.
	vec2 q = p * filmScale * density;
	vec2 t = fract(q) - 0.5;
	float r = length(t);
	float grout;
	float field;
	float tile;
	if (r < 0.47) {
		field = r < 0.06 ? 0.0 : r < 0.16 ? 1.0 : r < 0.27 ? 2.0 : r < 0.37 ? 3.0 : 4.0;
		float spokes = field < 0.5 ? 1.0 : spokeCount * pow(2.0, min(field - 1.0, 2.0));
		float a = (atan(t.y, t.x) / 6.28318 + 0.5) * spokes;
		tile = floor(a);
		float ringEdge = min(min(abs(r - 0.06), abs(r - 0.16)), min(min(abs(r - 0.27), abs(r - 0.37)), abs(r - 0.47)));
		float spokeEdge = field < 0.5 ? 1.0 : (0.5 - abs(fract(a) - 0.5)) * 6.28318 * r / spokes;
		grout = min(ringEdge, spokeEdge);
	} else {
		vec2 k = fract(q + 0.5) - 0.5;
		float d = abs(k.x) + abs(k.y);
		if (d < diamond) {
			field = 5.0;
			tile = (k.x > 0.0 ? 1.0 : 0.0) + (k.y > 0.0 ? 2.0 : 0.0);
			grout = min((diamond - d) * 0.7071, min(abs(k.x), abs(k.y)));
		} else {
			field = 6.0;
			vec2 m = k * fieldTiles;
			tile = hash(floor(m) + floor(q + 0.5) * 17.0) * 8.0;
			vec2 inTile = abs(fract(m) - 0.5);
			grout = min(min((0.5 - inTile.x) / fieldTiles, (0.5 - inTile.y) / fieldTiles), (d - diamond) * 0.7071);
		}
		grout = min(grout, r - 0.47);
	}
	float aa = length(fwidth(q)) * 0.7;
	float line = 1.0 - smoothstep(max(groutWidth - aa, 0.0), groutWidth + aa, grout);
	float angle = field * ringTurn + 0.3 + (hash(vec2(tile, field)) - 0.5) * jitter;
	groove = vec2(cos(angle), sin(angle));
	seed = field * 0.14 + mod(tile, 2.0) * 0.05;
	vivid = 0.9;
	copper = line;
	copperPad = line;
`
});
