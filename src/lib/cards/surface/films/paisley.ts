import { defineFilm } from './film.ts';

/**
 * GLSL for the paisley boteh, shared by the paisley film and plate. Each module that includes it passes its own
 * prefix, so a program carrying both never defines a function twice. Defines `<prefix>Boteh`, `<prefix>Nearest`
 * and `<prefix>Lines`; needs `hash`.
 */
export function botehGlsl(prefix: string): string {
	return `
// One boteh, the paisley teardrop, in its own frame: a round bulb of radius 0.3 at the origin and a tail rising along
// +y for \`tail\`, tapering to a point. Each point turns about the bulb by an angle that grows with the square of its
// height, so the tail hooks over by \`curl\` radians at its tip. Signed distance, negative inside.
float ${prefix}Boteh(vec2 p, float tail, float curl) {
	float rise = clamp(p.y / tail, 0.0, 1.2);
	float a = curl * rise * rise;
	p = vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a));
	p.x = abs(p.x);
	// A tapered capsule: the bulb and a tiny tip circle joined by their tangent lines.
	float b = 0.288 / tail;
	float k = sqrt(1.0 - b * b);
	float along = dot(p, vec2(-b, k));
	// Exact round the bulb, where the bend barely turns anything; along the hooked tail it is only approximate.
	return along < 0.0 ? length(p) - 0.3 : along > k * tail ? length(p - vec2(0.0, tail)) - 0.012 : dot(p, vec2(k, b)) - 0.3;
}

// The nearest boteh to q, in cell units, among the brick-laid cells around it, rows pitch apart. Returns its signed
// distance; frame holds the point in that boteh's own frame (xy), its turn (z) and its cell's hash (w; above 0.5 it is mirrored).
float ${prefix}Nearest(vec2 q, float size, float pitch, float tail, float curl, float tilt, float jitter, out vec4 frame) {
	float best = 1e5;
	frame = vec4(0.0);
	float row0 = floor(q.y / pitch);
	for (int j = -1; j <= 1; j++) {
		float row = row0 + float(j);
		float shift = mod(row, 2.0) * 0.5;
		float col0 = floor(q.x - shift);
		for (int i = -1; i <= 1; i++) {
			vec2 cell = vec2(col0 + float(i), row);
			float h = hash(cell * 1.31 + 7.7);
			// Neighbours along a row point opposite ways, so each tail tucks in beside the next bulb.
			float turn = tilt + mod(cell.x, 2.0) * 3.14159 + (h - 0.5) * jitter;
			vec2 d = q - vec2(cell.x + shift + 0.5, (row + 0.5) * pitch);
			vec2 local = vec2(d.x * cos(turn) + d.y * sin(turn), d.y * cos(turn) - d.x * sin(turn)) / size;
			// Centre the teardrop on its cell, and mirror half of them so the curls hook both ways.
			local.y += tail * 0.3;
			if (h > 0.5) local.x = -local.x;
			float dist = ${prefix}Boteh(local, tail, curl) * size;
			if (dist < best) { best = dist; frame = vec4(local, turn, h); }
		}
	}
	return best;
}

// A boteh's printed lines, from its frame point and signed distance d (cell units): x is the distance to its outline
// or the nearest inner ring, y the signed distance to its row of dots or the eye at its core, and z the ring band the
// point lies in, 0 outermost. Rings sit evenly inside the bulb; dots run round the outer band.
vec3 ${prefix}Lines(vec2 local, float d, float size, float rings, float dots) {
	float spacing = 0.3 * size / (rings + 1.6);
	float depth = -d;
	float band = max(floor(depth / spacing), 0.0);
	float ring = depth > 0.0 && depth < spacing * (rings + 0.5) ? abs(fract(depth / spacing + 0.5) - 0.5) * spacing : abs(d);
	vec2 c = local - vec2(0.0, 0.08);
	float n = max(floor(dots + 0.5), 1.0);
	float arc = (fract(atan(c.x, c.y) / 6.28318 * n) - 0.5) * 6.28318 * length(c) * size / n;
	float bead = dots < 0.5 ? 1e5 : length(vec2(arc, depth - spacing * 0.5)) - spacing * 0.28;
	float eye = (rings + 0.75) * spacing - depth;
	return vec3(ring, min(bead, eye), band);
}
`;
}

/**
 * Paisley: boteh teardrops with curled tips, packed in brick-laid rows that point alternate ways like a bandana
 * print. Copper traces each outline and its inner rings, with a row of gold dots and a gold eye inside. The grooves in
 * each boteh follow its contours, turning a quarter between rings, so each motif sweeps colour round its curl and
 * neighbours flash in different colours.
 */
export default defineFilm({
	name: 'paisley',
	ground: 0.8,
	params: {
		density: { value: 0.13, min: 0.03, max: 0.6, step: 0.005, note: 'Botehs per card unit; higher packs more, smaller motifs.' },
		size: { value: 1.0, min: 0.4, max: 1.4, step: 0.01, note: 'Size of each boteh against its cell; higher crowds them together.' },
		pitch: { value: 0.72, min: 0.4, max: 1.4, step: 0.01, note: 'Distance between rows against the spacing along a row; lower nests the rows tighter.' },
		tail: { value: 0.62, min: 0.32, max: 0.9, step: 0.01, note: 'How far the tail reaches past the bulb.' },
		curl: { value: 2.1, min: 0, max: 3, step: 0.01, note: 'How far the tail hooks over at its tip, in radians.' },
		outline: { value: 0.03, min: 0.002, max: 0.05, step: 0.001, note: 'Thickness of the copper outline and rings.' },
		rings: { value: 2, min: 0, max: 5, step: 1, note: 'Inner outlines echoing the teardrop inside each boteh.' },
		dots: { value: 16, min: 0, max: 32, step: 1, note: 'Gold dots round the outer band of each boteh; 0 leaves them out.' },
		tilt: { value: 0.5, min: -3.14159, max: 3.14159, step: 0.01, note: 'Turn of every boteh, in radians.' },
		jitter: { value: 0.7, min: 0, max: 3.14159, step: 0.01, note: 'Random turn of each boteh, in radians.' }
	},
	helpers: botehGlsl('paisleyFilm'),
	glsl: `
	cellSize = 1.0 / (filmScale * density);
	vec2 q = p * filmScale * density;
	vec4 frame;
	float d = paisleyFilmNearest(q, size, pitch, tail, curl, tilt, jitter, frame);
	vec3 lines = paisleyFilmLines(frame.xy, d, size, rings, dots);
	float aa = length(fwidth(q)) * 0.7;
	float ink = 1.0 - smoothstep(max(outline - aa, 0.0), outline + aa, lines.x);
	float bead = 1.0 - smoothstep(-aa, aa, lines.y);
	float inside = 1.0 - smoothstep(-aa, aa, d);
	// The contour's slope in the boteh's frame, turned back onto the card: unmirrored, then unrotated.
	vec2 e = vec2(0.01, 0.0);
	vec2 slope = vec2(paisleyFilmBoteh(frame.xy + e, tail, curl) - paisleyFilmBoteh(frame.xy - e, tail, curl),
		paisleyFilmBoteh(frame.xy + e.yx, tail, curl) - paisleyFilmBoteh(frame.xy - e.yx, tail, curl));
	if (frame.w > 0.5) slope.x = -slope.x;
	slope = vec2(slope.x * cos(frame.z) - slope.y * sin(frame.z), slope.x * sin(frame.z) + slope.y * cos(frame.z));
	slope = normalize(slope + 1e-5);
	// Grooves run along the contours in one band and across them in the next, so the rings read as bands of colour.
	vec2 flow = mod(lines.z, 2.0) < 0.5 ? vec2(-slope.y, slope.x) : slope;
	// The ground is one continuous groove, so it sweeps in one colour and the botehs stand out of it.
	groove = normalize(mix(vec2(0.62, 0.78), flow, inside) + 1e-4);
	seed = mix(0.0, frame.w * 0.7 + lines.z * 0.11, inside);
	vivid = mix(0.15, 0.95, inside);
	shade = mix(0.8, 1.0, inside);
	copper = max(ink, bead);
	copperPad = bead;
`
});
