import { defineFilm } from './film.ts';

// An intentional 5-by-6 terminal alphabet: 0, 1, 2, 7, A, F, Z, <, >, +, = and /.
// Store the same readable row notation as the shared microtype, but do not couple rain to a residue sequence.
const GLYPHS = [
	'.###. #..## #.#.# ##..# #...# .###.',
	'..#.. .##.. ..#.. ..#.. ..#.. .###.',
	'.###. #...# ....# ..##. .#... #####',
	'##### ....# ...#. ..#.. .#... .#...',
	'.###. #...# #...# ##### #...# #...#',
	'##### #.... ####. #.... #.... #....',
	'##### ....# ...#. ..#.. .#... #####',
	'...#. ..#.. .#... .#... ..#.. ...#.',
	'.#... ..#.. ...#. ...#. ..#.. .#...',
	'..... ..#.. ##### ..#.. ..... .....',
	'..... ##### ..... ##### ..... .....',
	'....# ...#. ..#.. ..#.. .#... #....'
].map(rows => [...rows.replaceAll(' ', '')].reduce((bits, dot, index) => dot === '#' ? (bits | (1 << index)) >>> 0 : bits, 0));

/** Digital rain etched into dark foil; each column follows absolute tilt, never elapsed time. */
export default defineFilm({
	name: 'matrix',
	palette: 'mint',
	ground: 0.025,
	params: {
		density: { value: 0.65, min: 0.15, max: 1.5, step: 0.01, note: 'Glyphs per card unit; higher packs more, smaller code.' },
		spacing: { value: 1.2, min: 1, max: 2.5, step: 0.05, note: 'Distance between vertical code columns, in glyph widths.' },
		trail: { value: 10, min: 3, max: 24, step: 1, note: 'Maximum glyphs in each fading tail; columns have slightly different lengths.' },
		gap: { value: 6, min: 2, max: 20, step: 1, note: 'Blank rows between one rain tail and the next bright head.' },
		slideWithTilt: { value: 1, min: 0, max: 4, step: 0.05, note: 'Move code columns with tilt at different rates. 0 fixes the code; returning to a pose restores it.' }
	},
	helpers: `
const uint MATRIX_GLYPHS[${GLYPHS.length}] = uint[](${GLYPHS.map(bits => `${bits}u`).join(', ')});
float matrixGlyph(vec2 pixel, vec2 aa, int glyph) {
	ivec2 dotIndex = ivec2(floor(pixel));
	if (dotIndex.x < 0 || dotIndex.x >= 5 || dotIndex.y < 0 || dotIndex.y >= 6) return 0.0;
	uint bit = uint(dotIndex.y * 5 + dotIndex.x);
	float lit = float((MATRIX_GLYPHS[glyph] >> bit) & 1u);
	vec2 edge = abs(fract(pixel) - 0.5);
	vec2 coverage = 1.0 - smoothstep(vec2(0.46) - aa, vec2(0.46) + aa, edge);
	return lit * coverage.x * coverage.y;
}
`,
	glsl: `
	float frequency = filmScale * density;
	cellSize = 1.0 / frequency;
	vec2 q = p * frequency / vec2(1.0, 1.45);
	float column = floor(q.x / spacing);
	float columnSeed = hash(vec2(column, 13.0));
	float tailLength = floor(trail * (0.7 + 0.3 * columnSeed));
	float period = tailLength + gap;
	float walk = dot(v_view.xy, vec2(0.6, 1.0)) * u_shift * slideWithTilt;
	// Whole columns travel continuously; their glyph identities and head-to-tail order remain attached.
	q.y -= walk * (0.6 + 1.4 * hash(vec2(column, 8.0))) * 10.0;
	q.y += columnSeed * period;
	float row = floor(q.y);
	float age = mod(-row, period);
	float head = 1.0 - step(0.5, age);
	float tail = pow(max(1.0 - age / tailLength, 0.0), 1.65);
	float brightness = mix(0.68 * tail, 1.0, head);
	vec2 pixel = vec2((q.x - (column + 0.5) * spacing) / 0.84 + 0.5, (fract(q.y) - 0.5) / 0.82 + 0.5) * vec2(5.0, 6.0);
	// Differentiate continuous coordinates, not fract(row), to avoid false blur at cell boundaries.
	vec2 aa = max(fwidth(q) * vec2(5.0 / 0.84, 6.0 / 0.82) * 0.5, vec2(0.001));
	int glyph = int(floor(hash(vec2(column, row)) * ${GLYPHS.length}.0));
	float ink = matrixGlyph(pixel, aa, glyph) * brightness;
	groove = vec2(0.0, 1.0);
	seed = columnSeed * 0.15;
	// Heads catch pale silver; tails retain the selected colourway rather than hard-coded green.
	vivid = 1.0 - head * 0.8;
	copper = ink;
	copperPad = 0.0;
	shade = 0.85 + 0.25 * head;
`
});
