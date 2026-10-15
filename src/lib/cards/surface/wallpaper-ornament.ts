import type { Dial } from './films/film.ts';

/** The same engraved die drives wallpaper foil relief and holographic groove direction. */
export const wallpaperParams: Record<string, Dial> = {
	density: { value: 0.72, min: 0.35, max: 3, step: 0.01, note: 'Ornamental bouquets per card unit; higher repeats the damask more finely.' },
	aspect: { value: 1.45, min: 1, max: 2, step: 0.01, note: 'Height of the upright damask repeat against its width.' },
	petal: { value: 1, min: 0.8, max: 1.1, step: 0.01, note: 'Fullness of the palmette bouquet within its vine framework.' },
	curl: { value: 0.24, min: 0, max: 0.42, step: 0.01, note: 'Hook of the acanthus leaves and their engraved midribs.' },
	spread: { value: 0.28, min: 0.22, max: 0.32, step: 0.01, note: 'Fan of the outer palmette leaves.' },
	ridge: { value: 0.006, min: 0.003, max: 0.015, step: 0.001, note: 'Width of the nested engraved outlines and connecting stems.' },
	veins: { value: 7, min: 3, max: 12, step: 1, note: 'Fine diagonal veins inside each ornamental leaf.' },
	beads: { value: 14, min: 0, max: 24, step: 1, note: 'Beads along the larger scalloped leaves; zero leaves plain edges.' }
};

/** Prefix every helper so a card can carry this die as both its plate and its film. */
export function wallpaperGlsl(prefix: string): string {
	return `
// marks: signed leaf silhouette, engraved stroke distance, signed bead distance.
void ${prefix}Mark(vec3 detail, vec2 direction, inout vec3 marks, inout vec2 flow) {
	if (detail.y < marks.y) flow = direction;
	marks = min(marks, detail);
}

// A hooked, scalloped lance leaf with a second outline, a midrib and feathered veins.
void ${prefix}Leaf(vec2 p, vec2 root, vec2 tip, float width, float hook, float veins, float beads,
	inout vec3 marks, inout vec2 flow) {
	vec2 axis = tip - root;
	float reach = length(axis);
	axis /= reach;
	vec2 across = vec2(axis.y, -axis.x);
	vec2 delta = p - root;
	float along = dot(delta, axis);
	float t = clamp(along / reach, 0.0, 1.0);
	float x = dot(delta, across) - hook * reach * t * t;
	float scallop = 1.0 + 0.09 * cos(t * 31.4159265);
	float breadth = width * pow(max(sin(t * 3.14159265), 0.0), 0.72) * scallop;
	float ends = max(-along, along - reach);
	float d = max(abs(x) - breadth, ends);
	float inset = width * 0.24;
	float outline = min(abs(d), abs(d + inset));
	float midrib = max(abs(x), max(reach * 0.08 - along, along - reach * 0.94));
	float veinPhase = (t - abs(x) / reach * 0.85) * veins;
	float vein = abs(fract(veinPhase + 0.5) - 0.5) * reach / veins;
	vein = max(vein, d + inset * 1.65);
	float stroke = min(outline, min(midrib, vein));
	float bead = 1e3;
	if (beads > 0.5) {
		float beadAlong = (fract(t * beads + 0.5) - 0.5) * reach / beads;
		bead = max(length(vec2(beadAlong, d + inset * 0.48)) - width * 0.075,
			max(reach * 0.1 - along, along - reach * 0.9));
	}
	vec2 tangent = normalize(axis + across * (hook * 2.0 * t));
	${prefix}Mark(vec3(d, stroke, bead), tangent, marks, flow);
}

// An open inward-coiling scroll, not a closed circle. Two angular candidates cover its curled tip.
void ${prefix}Scroll(vec2 p, vec2 center, float radius, float ridge, inout vec3 marks, inout vec2 flow) {
	vec2 v = p - center;
	float angle = mod(atan(v.y, v.x) + 1.5707963, 6.2831853);
	float r = length(v);
	float stroke = 1e3;
	for (int turn = 0; turn < 2; turn++) {
		float a = angle + float(turn) * 6.2831853;
		float t = clamp(a / 8.2, 0.0, 1.0);
		float target = radius * (1.0 - 0.78 * t);
		vec2 point = vec2(sin(t * 8.2), -cos(t * 8.2)) * target;
		float distanceToCoil = a <= 8.2 ? abs(r - target) : length(v - point);
		stroke = min(stroke, distanceToCoil);
	}
	vec2 tangent = normalize(vec2(-v.y, v.x) - v * 0.12 + vec2(1e-5));
	${prefix}Mark(vec3(stroke - ridge * 1.5, stroke, 1e3), tangent, marks, flow);
}

// One bounded repeat, with staggered large/small bouquets and continuous serpentine border vines.
// Folding only x produces paired leaves without searching neighbouring cells or evaluating both halves.
vec3 ${prefix}Ornament(vec2 q, float aspect, float petal, float curl, float spread, float ridge,
	float veins, float beads, out vec2 flow, out float variant) {
	float column = floor(q.x + 0.5);
	variant = mod(column, 2.0);
	vec2 p = vec2(q.x - column, 0.5 - fract(q.y / aspect + variant * 0.5 + 0.5));
	float mirror = p.x < 0.0 ? -1.0 : 1.0;
	p.x = abs(p.x);
	vec3 marks = vec3(1e3);
	flow = vec2(0.0, 1.0);
	float size = petal * mix(1.0, 0.82, variant);

	// The vine is periodic through the top and bottom of the repeat, with a curling branch at its waist.
	float vinePhase = p.y * 6.2831853;
	float vineX = 0.38 + 0.08 * cos(vinePhase);
	float vine = abs(p.x - vineX);
	${prefix}Mark(vec3(vine - ridge * 1.6, min(vine, abs(vine - ridge * 2.8)), 1e3),
		normalize(vec2(-0.502655 * sin(vinePhase), 1.0)), marks, flow);
	${prefix}Scroll(p, vec2(0.3, -0.245), 0.13, ridge, marks, flow);
	float branchT = clamp(p.x / 0.394, 0.0, 1.0);
	float branchY = mix(-0.3 * size, -0.3, branchT) - 0.075 * sin(branchT * 3.14159265);
	float branch = max(abs(p.y - branchY), p.x - 0.394);
	vec2 branchFlow = normalize(vec2(0.394, 0.3 * (size - 1.0) - 0.235619 * cos(branchT * 3.14159265)));
	${prefix}Mark(vec3(branch - ridge * 1.5, branch, 1e3), branchFlow, marks, flow);

	// Four staggered acanthus leaflets grow from each side vine. Only the nearest tier can reach p.
	float tier = floor((p.y + 0.5) * 4.0);
	float rootY = (tier + 0.5) * 0.25 - 0.5;
	float rootX = 0.38 + 0.08 * cos(rootY * 6.2831853);
	${prefix}Leaf(p, vec2(rootX, rootY - 0.075), vec2(rootX - 0.12, rootY + 0.1),
		0.031, -curl * 0.4, veins * 0.65, 0.0, marks, flow);

	// A small pendant bouquet alternates with the broader palmette, leaving breathing room in the lattice.
	vec2 b = p / size;
	vec3 bouquet = vec3(1e3);
	vec2 bouquetFlow = vec2(0.0, 1.0);
	${prefix}Leaf(b, vec2(0.0, -0.17), vec2(0.0, 0.385), 0.077, 0.0,
		veins + 2.0, beads, bouquet, bouquetFlow);
	// Three feather-like lobes fan out on either side of the tall central spear.
	for (int lobe = 0; lobe < 3; lobe++) {
		float k = float(lobe);
		vec2 tip = vec2(spread * (0.6 + 0.19 * k), 0.32 - k * 0.115);
		${prefix}Leaf(b, vec2(0.018 + k * 0.006, -0.205 + k * 0.006), tip,
			0.055 - k * 0.006, curl * (0.55 + k * 0.2), veins, beads, bouquet, bouquetFlow);
	}
	// Chalice, lower leaf pair and seed-shaped pendant join the crown to its stalk.
	${prefix}Leaf(b, vec2(0.0, -0.32), vec2(0.15, -0.18), 0.039, -curl,
		veins * 0.6, 0.0, bouquet, bouquetFlow);
	${prefix}Leaf(b, vec2(0.0, -0.43), vec2(0.0, -0.285), 0.032, 0.0,
		veins * 0.5, 0.0, bouquet, bouquetFlow);
	float stalk = max(abs(b.x), abs(b.y + 0.245) - 0.12);
	${prefix}Mark(vec3(stalk - ridge, stalk, 1e3), vec2(0.0, 1.0), bouquet, bouquetFlow);
	${prefix}Mark(bouquet * size, bouquetFlow, marks, flow);
	flow = normalize(vec2(flow.x * mirror, -flow.y * aspect));
	return marks;
}
`;
}
