import { HGH_SEQUENCE } from '../../hgh.ts';

// The HGH film draws a ring wherever a residue is aromatic.
const HGH_AROMATIC = Array.from({ length: Math.ceil(HGH_SEQUENCE.length / 32) }, (_, word) =>
	[...HGH_SEQUENCE.slice(word * 32, word * 32 + 32)].reduce((bits, residue, bit) => 'FYWH'.includes(residue) ? (bits | (1 << bit)) >>> 0 : bits, 0));

/** A 5×6 dot-matrix face for the twenty amino-acid letters, rows top to bottom, for the HGH sequence film. */
const MICROTYPE: Readonly<Record<string, string>> = {
	A: '.###. #...# #...# ##### #...# #...#', C: '.#### #.... #.... #.... #.... .####', D: '####. #...# #...# #...# #...# ####.',
	E: '##### #.... ####. #.... #.... #####', F: '##### #.... ####. #.... #.... #....', G: '.#### #.... #.### #...# #...# .###.',
	H: '#...# #...# ##### #...# #...# #...#', I: '##### ..#.. ..#.. ..#.. ..#.. #####', K: '#...# #..#. ###.. #..#. #...# #...#',
	L: '#.... #.... #.... #.... #.... #####', M: '#...# ##.## #.#.# #...# #...# #...#', N: '#...# ##..# #.#.# #..## #...# #...#',
	P: '####. #...# ####. #.... #.... #....', Q: '.###. #...# #...# #.#.# #..#. .##.#', R: '####. #...# ####. #.#.. #..#. #...#',
	S: '.#### #.... .###. ....# ....# ####.', T: '##### ..#.. ..#.. ..#.. ..#.. ..#..', V: '#...# #...# #...# #...# .#.#. ..#..',
	W: '#...# #...# #.#.# #.#.# ##.## #...#', Y: '#...# .#.#. ..#.. ..#.. ..#.. ..#..',
	// Letters past the amino acids, for inscriptions; appended so the sequence's glyph numbers stay put.
	X: '#...# .#.#. ..#.. ..#.. .#.#. #...#'
};
const MICROTYPE_LETTERS = Object.keys(MICROTYPE);
const MICROTYPE_GLYPHS = MICROTYPE_LETTERS.map(letter => [...MICROTYPE[letter]!.replaceAll(' ', '')].reduce((bits, dot, index) => dot === '#' ? (bits | (1 << index)) >>> 0 : bits, 0));
/** The sequence as glyph indices, six 5-bit indices to a word. */
const HGH_GLYPHS = Array.from({ length: Math.ceil(HGH_SEQUENCE.length / 6) }, (_, word) =>
	[...HGH_SEQUENCE.slice(word * 6, word * 6 + 6)].reduce((bits, residue, slot) => (bits | (MICROTYPE_LETTERS.indexOf(residue) << (slot * 5))) >>> 0, 0));

/** The secret-inning inscription as glyph numbers, -1 for a space. */
const EXTRA_INNINGS = [...'EXTRA INNINGS'].map(letter => letter === ' ' ? -1 : MICROTYPE_LETTERS.indexOf(letter));

/**
 * GLSL helpers several films share: the dot-matrix microtype, with the HGH sequence's letters and aromatic
 * residues and the secret-inning inscription; pixel-wide antialiasing; and distances to a hexagon, a segment, an
 * arc, a five-pointed star and the numerals 162.
 */
export const SHARED_FILM_GLSL = `
const uint HGH_AROMATIC[${HGH_AROMATIC.length}] = uint[](${HGH_AROMATIC.map(word => `${word}u`).join(', ')});
const float HGH_LENGTH = ${HGH_SEQUENCE.length}.0;
const uint MICROTYPE[${MICROTYPE_GLYPHS.length}] = uint[](${MICROTYPE_GLYPHS.map(word => `${word}u`).join(', ')});
const uint HGH_GLYPHS[${HGH_GLYPHS.length}] = uint[](${HGH_GLYPHS.map(word => `${word}u`).join(', ')});
bool microDot(float residue, int x, int y) {
	int r = int(mod(residue, HGH_LENGTH));
	uint glyph = MICROTYPE[(HGH_GLYPHS[r / 6] >> uint((r % 6) * 5)) & 31u];
	return ((glyph >> uint(y * 5 + x)) & 1u) == 1u;
}
bool typeDot(int glyph, int x, int y) { return ((MICROTYPE[glyph] >> uint(y * 5 + x)) & 1u) == 1u; }
const int EXTRA_INNINGS[${EXTRA_INNINGS.length}] = int[](${EXTRA_INNINGS.join(', ')});
bool aromatic(float residue) { int r = int(mod(residue, HGH_LENGTH)); return ((HGH_AROMATIC[r / 32] >> uint(r % 32)) & 1u) == 1u; }
// How much of a feature this size survives at this pixel size: 1 when it spans several pixels, 0 once it would alias.
float resolve(float size) { return smoothstep(2.0, 4.5, size / footprint); }
float hexagon(vec2 p, float r) { p = abs(p); return max(dot(p, vec2(0.5, 0.86603)), p.x) - r; }
float segment(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0)); }
// Coverage of a stroke or shape at signed distance d (card units), antialiased over one screen pixel.
float inked(float d) { return 1.0 - smoothstep(-footprint, footprint, d); }
// Distance to the arc of radius r round c running anticlockwise from angle a0 to a1, in radians.
float arc(vec2 p, vec2 c, float r, float a0, float a1) {
	vec2 d = p - c;
	if (mod(atan(d.y, d.x) - a0, 6.28318) <= a1 - a0) return abs(length(d) - r);
	return min(length(p - c - r * vec2(cos(a0), sin(a0))), length(p - c - r * vec2(cos(a1), sin(a1))));
}
// Distance to the centre line of the numerals 162, one unit tall and centred on the origin, y up.
float digits162(vec2 p) {
	vec2 one = p + vec2(0.78, 0.0);
	float d = min(min(segment(one, vec2(0.0, -0.5), vec2(0.0, 0.5)), segment(one, vec2(0.0, 0.5), vec2(-0.2, 0.32))), segment(one, vec2(-0.2, -0.5), vec2(0.2, -0.5)));
	d = min(d, min(abs(length(p - vec2(0.0, -0.2)) - 0.3), arc(p, vec2(0.35, -0.2), 0.65, 1.745, 3.1416)));
	vec2 two = p - vec2(0.78, 0.0);
	d = min(d, min(arc(two, vec2(0.0, 0.22), 0.28, -0.698, 2.793), segment(two, vec2(0.214, 0.04), vec2(-0.3, -0.5))));
	return min(d, segment(two, vec2(-0.3, -0.5), vec2(0.3, -0.5)));
}
// Signed distance to a five-pointed star of outer radius r; rf sets how deep its points cut in.
float star5(vec2 p, float r, float rf) {
	const vec2 k1 = vec2(0.809017, -0.587785);
	const vec2 k2 = vec2(-0.809017, -0.587785);
	p.x = abs(p.x);
	p -= 2.0 * max(dot(k1, p), 0.0) * k1;
	p -= 2.0 * max(dot(k2, p), 0.0) * k2;
	p.x = abs(p.x);
	p.y -= r;
	vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
	float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
	return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
`;
