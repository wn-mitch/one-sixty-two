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
	W: '#...# #...# #.#.# #.#.# ##.## #...#', Y: '#...# .#.#. ..#.. ..#.. ..#.. ..#..'
};
const MICROTYPE_LETTERS = Object.keys(MICROTYPE);
const MICROTYPE_GLYPHS = MICROTYPE_LETTERS.map(letter => [...MICROTYPE[letter]!.replaceAll(' ', '')].reduce((bits, dot, index) => dot === '#' ? (bits | (1 << index)) >>> 0 : bits, 0));
/** The sequence as glyph indices, six 5-bit indices to a word. */
const HGH_GLYPHS = Array.from({ length: Math.ceil(HGH_SEQUENCE.length / 6) }, (_, word) =>
	[...HGH_SEQUENCE.slice(word * 6, word * 6 + 6)].reduce((bits, residue, slot) => (bits | (MICROTYPE_LETTERS.indexOf(residue) << (slot * 5))) >>> 0, 0));

/**
 * GLSL helpers several films share: the HGH sequence's dot-matrix microtype and aromatic residues, and
 * distances to a hexagon and a segment.
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
bool aromatic(float residue) { int r = int(mod(residue, HGH_LENGTH)); return ((HGH_AROMATIC[r / 32] >> uint(r % 32)) & 1u) == 1u; }
// How much of a feature this size survives at this pixel size: 1 when it spans several pixels, 0 once it would alias.
float resolve(float size) { return smoothstep(2.0, 4.5, size / footprint); }
float hexagon(vec2 p, float r) { p = abs(p); return max(dot(p, vec2(0.5, 0.86603)), p.x) - r; }
float segment(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0)); }
`;
