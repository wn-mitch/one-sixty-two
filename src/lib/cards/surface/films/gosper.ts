import { defineFilm, glslFloat } from './film.ts';
import { GOSPER_BOUND_RADIUS, GOSPER_CHILDREN, GOSPER_MAX_DETAIL } from './gosper-curve.ts';

/** A finite connected flowsnake, sampled through its seven-child similarity hierarchy rather than tiled. */
export default defineFilm({
	name: 'gosper',
	ground: 0.24,
	params: {
		density: { value: 0.85, min: 0.25, max: 2, step: 0.01, note: 'Sampling density; higher shows a wider section of the same connected curve.' },
		lineWidth: { value: 0.14, min: 0.04, max: 0.24, step: 0.005, note: 'Reflective ribbon half-width as a share of the smallest Gosper segment.' },
		rotation: { value: 0, min: -3.14159, max: 3.14159, step: 0.01, note: 'Turns the sampled flowsnake and its grooves, in radians.' },
		detail: { value: 6, min: 1, max: GOSPER_MAX_DETAIL, step: 1, note: 'Subdivision order: one connected finite curve with 7 to the power of this many segments.' },
		zoom: { value: 16, min: 0.3, max: 40, step: 0.05, note: 'Magnification of one flowsnake; zoom out to see its finite boundary, not repeated copies.' },
		focusX: { value: 0, min: -1, max: 1, step: 0.01, note: 'Horizontal sample offset in whole-curve endpoint spans; zero samples the interior.' },
		focusY: { value: 0, min: -1, max: 1, step: 0.01, note: 'Vertical sample offset in whole-curve endpoint spans; zero samples the interior.' }
	},
	helpers: `
// Each vec4 contains a child origin and its complex similarity axis. A and B have seven children each.
const vec4 GOSPER_CHILDREN[14] = vec4[](
	${GOSPER_CHILDREN.map(child => `vec4(${[...child.start, ...child.axis].map(glslFloat).join(', ')})`).join(',\n\t')}
);
const int GOSPER_KINDS[14] = int[](${GOSPER_CHILDREN.map(child => child.kind).join(', ')});
const float GOSPER_SHRINK = 0.3779644730092272;
vec2 gosperMultiply(vec2 a, vec2 b) {
	return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// Exact distance within the ribbon's support. Each rejected disk bounds every descendant of that node.
// The stack stores one ancestor per level, not the exponentially many segments. There is no visit cap
// that could truncate a branch or break the connected curve at a subdivision boundary.
vec3 gosperSample(vec2 point, int order, float support) {
	vec2 origins[${GOSPER_MAX_DETAIL + 1}];
	vec2 axes[${GOSPER_MAX_DETAIL + 1}];
	int kinds[${GOSPER_MAX_DETAIL + 1}];
	int nextChildren[${GOSPER_MAX_DETAIL + 1}];
	origins[0] = vec2(0.0);
	axes[0] = vec2(1.0, 0.0);
	kinds[0] = 0;
	nextChildren[0] = 0;
	int level = 0;
	float nodeSize = 1.0;
	float nearest = support;
	vec2 tangent = vec2(1.0, 0.0);
	while (level >= 0) {
		int child = nextChildren[level];
		if (child == 7) {
			level--;
			nodeSize /= GOSPER_SHRINK;
			continue;
		}
		nextChildren[level] = child + 1;
		int index = kinds[level] * 7 + child;
		vec4 transform = GOSPER_CHILDREN[index];
		vec2 origin = origins[level] + gosperMultiply(axes[level], transform.xy);
		vec2 axis = gosperMultiply(axes[level], transform.zw);
		float childSize = nodeSize * GOSPER_SHRINK;
		vec2 fromCentre = point - origin - axis * 0.5;
		float bound = childSize * ${glslFloat(GOSPER_BOUND_RADIUS)} + nearest;
		if (dot(fromCentre, fromCentre) > bound * bound) continue;
		if (level + 1 == order) {
			vec2 relative = point - origin;
			float along = clamp(dot(relative, axis) / dot(axis, axis), 0.0, 1.0);
			float distanceToSegment = length(relative - axis * along);
			if (distanceToSegment < nearest) {
				nearest = distanceToSegment;
				tangent = axis / childSize;
			}
		} else {
			level++;
			origins[level] = origin;
			axes[level] = axis;
			kinds[level] = GOSPER_KINDS[index];
			nextChildren[level] = 0;
			nodeSize = childSize;
		}
	}
	return vec3(nearest, tangent);
}
`,
	glsl: `
int order = int(clamp(floor(detail + 0.5), 1.0, ${glslFloat(GOSPER_MAX_DETAIL)}));
float unit = 2.18 * zoom / max(scale * density, 0.0001);
float segmentLength = pow(GOSPER_SHRINK, float(order));
cellSize = unit * segmentLength;
float cs = cos(rotation);
float sn = sin(rotation);
mat2 turn = mat2(cs, sn, -sn, cs);
vec2 point = transpose(turn) * ((p - v_view.zw - CARD * 0.5) / unit + vec2(focusX, focusY));
point += vec2(0.5, -0.2);
float ribbon = 0.0;
float fineEdge = 0.0;
vec2 tangent = vec2(1.0, 0.0);
// The shared foil compositor completely replaces unresolved detail with its smooth sweep. Avoid walking
// invisible geometry there; otherwise support is at most 0.42 leaf segments, independent of zoom/order.
if (cellSize > footprint * 1.5) {
	float aa = clamp(footprint / cellSize * 0.7, 0.002, 0.18);
	float width = clamp(lineWidth, 0.04, 0.24);
	vec3 sampled = gosperSample(point, order, (width + aa) * segmentLength);
	float distanceToPath = sampled.x / segmentLength;
	ribbon = 1.0 - smoothstep(width - aa, width + aa, distanceToPath);
	fineEdge = 1.0 - smoothstep(0.018, 0.018 + aa, abs(distanceToPath - width * 0.72));
	tangent = sampled.yz;
}
groove = turn * tangent;
seed = atan(tangent.y, tangent.x) * 0.133690152 * ribbon;
vivid = 0.7;
copper = ribbon;
shade = 0.88 + fineEdge * ribbon * 0.24;
`
});
