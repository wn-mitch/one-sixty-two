import { defineFilm } from './film.ts';

/**
 * Order-three Gosper flowsnake. Both A and B move forward; + turns counterclockwise by 60 degrees.
 * Integer axial coordinates preserve every one of its 7^3 segments without trigonometric drift.
 */
const GOSPER_RULES = { A: 'A-B--B+A++AA+B-', B: '+A-BB--B-A++A+B' } as const;
const GOSPER_AXES = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] as const;

/** Six bit planes per lattice row: bit x records an incident edge in that plane's direction. */
function gosperRows(): string {
	let path = 'A';
	for (let order = 0; order < 3; order++) {
		path = path.replace(/[AB]/g, symbol => GOSPER_RULES[symbol as keyof typeof GOSPER_RULES]);
	}
	// The complete order-three path occupies axial x = -5..19 and y = -24..0.
	const rows = new Uint32Array(25 * 6);
	let x = 0;
	let y = 0;
	let direction = 0;
	for (const symbol of path) {
		if (symbol === '+') direction = (direction + 1) % 6;
		else if (symbol === '-') direction = (direction + 5) % 6;
		else {
			const [dx, dy] = GOSPER_AXES[direction]!;
			const start = (y + 24) * 6 + direction;
			rows[start] = rows[start]! | (1 << (x + 5));
			x += dx;
			y += dy;
			const end = (y + 24) * 6 + (direction + 3) % 6;
			rows[end] = rows[end]! | (1 << (x + 5));
		}
	}
	return Array.from(rows, row => `${row}u`).join(', ');
}

export default defineFilm({
	name: 'gosper',
	ground: 0.24,
	params: {
		density: { value: 0.85, min: 0.25, max: 2, step: 0.01, note: 'Flowsnake islands per card unit; higher makes the full curves smaller.' },
		lineWidth: { value: 0.14, min: 0.04, max: 0.24, step: 0.005, note: 'Reflective ribbon half-width in unit-length Gosper segments.' },
		rotation: { value: 0, min: -3.14159, max: 3.14159, step: 0.01, note: 'Turns the complete flowsnake islands and their grooves, in radians.' }
	},
	helpers: `
const uint GOSPER_ROWS[150] = uint[](${gosperRows()});
const vec2 GOSPER_DIRECTIONS[6] = vec2[](
	vec2(1.0, 0.0), vec2(0.5, 0.866025404), vec2(-0.5, 0.866025404),
	vec2(-1.0, 0.0), vec2(-0.5, -0.866025404), vec2(0.5, -0.866025404)
);
`,
	glsl: `
float patternScale = max(filmScale * density, 0.0001);
float cs = cos(rotation);
float sn = sin(rotation);
mat2 turn = mat2(cs, sn, -sn, cs);
vec2 q = transpose(turn) * p * patternScale;
// Complete, separated islands: the entire path fits inside this repeat with a one-unit margin.
// Its Cartesian bounds are (-9.5, -12*sqrt(3)) to (10.5, 0), centred at (0.5, -6*sqrt(3)).
vec2 repeatSize = vec2(22.0, 22.784609691);
q = mod(q + repeatSize * 0.5, repeatSize) - repeatSize * 0.5;
q += vec2(0.5, -10.392304845);

// Locate the containing equilateral triangle on the unit triangular lattice.
vec2 axial = vec2(q.x - q.y * 0.577350269, q.y * 1.154700538);
ivec2 base = ivec2(floor(axial));
vec2 f = fract(axial);
bool upper = f.x + f.y > 1.0;
float distanceToPath = 0.5;
int closestDirection = 0;
// Any unit lattice edge not incident to these three vertices is at least sqrt(3)/2 away
// from the triangle. Only the radius-0.5 neighbourhood is needed, so this omits no ink.
// Three vertices times six bit tests; only present edges need a segment-distance evaluation.
for (int corner = 0; corner < 3; corner++) {
	ivec2 vertex = base + (corner == 0 ? (upper ? ivec2(1) : ivec2(0))
		: corner == 1 ? ivec2(1, 0) : ivec2(0, 1));
	ivec2 index = vertex + ivec2(5, 24);
	if (index.x < 0 || index.x >= 25 || index.y < 0 || index.y >= 25) continue;
	vec2 start = vec2(float(vertex.x) + float(vertex.y) * 0.5, float(vertex.y) * 0.866025404);
	vec2 relative = q - start;
	for (int direction = 0; direction < 6; direction++) {
		uint row = GOSPER_ROWS[index.y * 6 + direction];
		if ((row & (1u << uint(index.x))) == 0u) continue;
		vec2 tangent = GOSPER_DIRECTIONS[direction];
		float along = clamp(dot(relative, tangent), 0.0, 1.0);
		float d = length(relative - tangent * along);
		if (d < distanceToPath) {
			distanceToPath = d;
			closestDirection = direction % 3;
		}
	}
}
// The bounded footprint keeps all visible support below the exact search radius of 0.5.
float aa = clamp(footprint * patternScale * 0.7, 0.002, 0.18);
float width = clamp(lineWidth, 0.04, 0.24);
float ribbon = 1.0 - smoothstep(width - aa, width + aa, distanceToPath);
float fineEdge = 1.0 - smoothstep(0.018, 0.018 + aa, abs(distanceToPath - width * 0.72));
groove = turn * normalize(mix(vec2(1.0, 0.0), GOSPER_DIRECTIONS[closestDirection], ribbon));
seed = 0.14 * float(closestDirection) * ribbon;
vivid = 0.7;
copper = ribbon;
shade = 0.88 + fineEdge * ribbon * 0.24;
cellSize = 1.0 / patternScale;
`
});
