import { defineFilm } from './film.ts';

/**
 * Rolling snowflake (ITW's high-resolution lines with kinetic effect): a staggered field of fine-line six-armed
 * snowflakes that never move. Tilt rolls a highlight out along each arm in turn and round the flake; each flake
 * starts its roll at its own phase, so the field ripples rather than flashing together.
 */
export default defineFilm({
	name: 'rolling-snowflake',
	experimental: true,
	params: {
		density: { value: 0.11, min: 0.04, max: 0.4, step: 0.005, note: 'Snowflakes per card unit; higher packs more, smaller flakes.' },
		radius: { value: 0.42, min: 0.2, max: 0.5, step: 0.01, note: 'Arm length, as a fraction of a flake cell.' },
		weight: { value: 0.022, min: 0.005, max: 0.08, step: 0.001, note: 'Line half-width in card units.' },
		glow: { value: 0.09, min: 0.01, max: 0.3, step: 0.005, note: 'Length of the rolling highlight, as a fraction of the path round one flake.' },
		rolls: { value: 1, min: 0, max: 4, step: 0.05, note: 'Trips round a flake from one full lean to the other.' },
		stagger: { value: 1, min: 0, max: 1, step: 0.01, note: 'How far apart the flakes start their roll; 0 rolls them in step.' },
		travel: { value: 0.12, min: 0.03, max: 0.4, step: 0.005, note: 'Lean, as the sine of the tilt, that counts as a full lean.' }
	},
	helpers: `
// Distance to a six-armed snowflake of arm length r centred on the origin, and how far along its path the nearest
// stroke sits: out each arm from the centre in turn, anticlockwise, as a fraction of the whole path.
float snowflake(vec2 q, float r, out float path) {
	float a = atan(q.y, q.x);
	float sector = floor((a + 0.5236) / 1.0472);
	float local = a - sector * 1.0472;
	vec2 s = length(q) * vec2(cos(local), abs(sin(local)));
	float d = segment(s, vec2(0.0), vec2(r, 0.0));
	d = min(d, segment(s, vec2(r * 0.45, 0.0), vec2(r * 0.45, 0.0) + r * 0.24 * vec2(0.5, 0.866)));
	d = min(d, segment(s, vec2(r * 0.72, 0.0), vec2(r * 0.72, 0.0) + r * 0.16 * vec2(0.5, 0.866)));
	d = min(d, abs(hexagon(q, r * 0.12)));
	path = (mod(sector, 6.0) + clamp(s.x / r, 0.0, 1.0)) / 6.0;
	return d;
}
`,
	glsl: `
	vec2 f = cardFace(p);
	vec2 lean = v_view.xy / max(travel, 1e-3);
	float cells = filmScale * density;
	// A hexagonal lattice: rows 0.866 of a cell apart, alternate rows half a cell across.
	vec2 g = f * cells * vec2(1.0, 1.1547);
	g.x += mod(floor(g.y), 2.0) * 0.5;
	vec2 cell = floor(g);
	vec2 q = (fract(g) - 0.5) * vec2(1.0, -0.866);
	// Turned 30 degrees, so each flake's arms reach between its neighbours rather than toward them.
	q = mat2(0.866, 0.5, -0.5, 0.866) * q;
	float path;
	float ink = inked(snowflake(q, radius, path) / cells - weight);
	// Only the light moves: the highlight's place on the path follows the lean, offset per flake.
	float phase = dot(lean, vec2(0.55, 0.85)) * rolls * 0.5 + hash(cell + 3.0) * stagger;
	float gap = abs(fract(path - phase + 0.5) - 0.5);
	float lit = exp(-gap * gap / max(glow * glow, 1e-5));
	vec3 hot = mix(vec3(1.0), rainbow(phase + path * 0.5), 0.4);
	own = vec4(mix(vec3(0.6, 0.63, 0.68), hot, lit), ink);
	ownFlash = lit;
	// A dim, even refractor ground, so the lines carry the effect.
	groove = vec2(0.6, 0.8);
	vivid = 0.25;
	shade = 0.4;
	cellSize = 1.0 / cells;
`
});
