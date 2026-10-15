import { defineFilm } from './film.ts';

/**
 * Apollonian: three equal tangent discs generate the exact Apollonian reflection group. A point in a gap is
 * inverted through the one dual circle containing it until it reaches a generator disc; pulling that disc's
 * edge and groove direction back through the inversions reveals the corresponding circle in the gasket.
 */
export default defineFilm({
	name: 'apollonian',
	ground: 0.48,
	params: {
		rotation: { value: 0, min: -3.14159, max: 3.14159, step: 0.01, note: 'Turns the complete circle packing, in radians.' },
		rim: { value: 0.045, min: 0.005, max: 0.16, step: 0.001, note: 'Reflective rim width as a share of each circle radius.' },
		detail: { value: 14, min: 4, max: 20, step: 1, note: 'Maximum inversion depth; higher reveals smaller tangent circles.' },
		zoom: { value: 1, min: 0.3, max: 40, step: 0.05, note: 'Magnification of the gasket; zoom in to fill the card with a section of the circle packing.' },
		focusX: { value: 0, min: -1, max: 1, step: 0.01, note: 'Horizontal focus in enclosing-circle radii: -1 is the left rim, 0 the centre, 1 the right rim.' },
		focusY: { value: 0, min: -1, max: 1, step: 0.01, note: 'Vertical focus in enclosing-circle radii: -1 is the top rim, 0 the centre, 1 the bottom rim.' }
	},
	helpers: `
const float APOLLONIAN_INNER_RADIUS = 0.4641016151377546;
const float APOLLONIAN_INNER_OFFSET = 0.5358983848622454;
const float APOLLONIAN_CENTRAL_DUAL_RADIUS_SQUARED = 0.0717967697244908;
vec2 apollonianDirection(int index) {
	if (index == 0) return vec2(1.0, 0.0);
	if (index == 1) return vec2(-0.5, 0.8660254037844386);
	return vec2(-0.5, -0.8660254037844386);
}
vec2 apollonianDualCentre(int index) {
	return index == 0 ? vec2(0.0) : -2.0 * apollonianDirection(index - 1);
}
float apollonianDualRadiusSquared(int index) {
	return index == 0 ? APOLLONIAN_CENTRAL_DUAL_RADIUS_SQUARED : 3.0;
}
vec2 apollonianReflectVector(vec2 direction, vec2 normal) {
	return direction - 2.0 * normal * dot(normal, direction);
}
`,
	glsl: `
	// One unit is the enclosing circle's radius. At the shipped scale it nearly fills the card's width.
	float apollonianUnit = 2.18 * zoom / scale;
	float apollonianPixel = max(footprint / apollonianUnit, 1e-6);
	vec2 apollonianPoint = (p - v_view.zw - CARD * 0.5) / apollonianUnit + vec2(focusX, focusY);
	float apollonianCos = cos(rotation);
	float apollonianSin = sin(rotation);
	vec2 apollonianQ = vec2(
		apollonianCos * apollonianPoint.x - apollonianSin * apollonianPoint.y,
		apollonianSin * apollonianPoint.x + apollonianCos * apollonianPoint.y
	);
	// Columns of the orthogonal part of dq/dp. Every inversion adds one reflection; its scalar is kept separately.
	vec2 apollonianBasisX = vec2(apollonianCos, apollonianSin);
	vec2 apollonianBasisY = vec2(-apollonianSin, apollonianCos);
	vec2 apollonianPatchQ = apollonianQ;
	float apollonianScale = 1.0;
	float apollonianCode = 0.127;
	float apollonianGeneration = 0.0;
	float apollonianPacked = 0.0;
	float apollonianDepth = 0.0;
	float apollonianCircleRadius = 1.0;
	float apollonianGenerator = 0.0;
	vec2 apollonianTerminalVector = vec2(1.0, 0.0);

	if (dot(apollonianQ, apollonianQ) < 1.0) {
		for (int apollonianIteration = 0; apollonianIteration <= 20; apollonianIteration++) {
			// The Descartes generators are the three inner discs and the exterior of the enclosing circle.
			for (int apollonianInner = 0; apollonianInner < 3; apollonianInner++) {
				vec2 apollonianFromInner = apollonianQ - APOLLONIAN_INNER_OFFSET * apollonianDirection(apollonianInner);
				float apollonianInside = APOLLONIAN_INNER_RADIUS - length(apollonianFromInner);
				if (apollonianInside >= 0.0) {
					apollonianPacked = 1.0;
					apollonianDepth = apollonianInside / apollonianScale;
					apollonianCircleRadius = APOLLONIAN_INNER_RADIUS / apollonianScale;
					apollonianGenerator = float(apollonianInner);
					apollonianTerminalVector = apollonianFromInner;
				}
			}
			float apollonianOutside = length(apollonianQ) - 1.0;
			if (apollonianOutside >= 0.0) {
				apollonianPacked = 1.0;
				apollonianDepth = apollonianOutside / apollonianScale;
				apollonianCircleRadius = 1.0 / apollonianScale;
				apollonianGenerator = 3.0;
				apollonianTerminalVector = apollonianQ;
			}
			if (apollonianPacked > 0.5 || float(apollonianIteration) >= detail) break;

			// The four dual circles have disjoint interiors and cover exactly the generator-free part of the unit disc.
			int apollonianDual = -1;
			for (int apollonianCandidate = 0; apollonianCandidate < 4; apollonianCandidate++) {
				vec2 apollonianFromDual = apollonianQ - apollonianDualCentre(apollonianCandidate);
				if (dot(apollonianFromDual, apollonianFromDual) < apollonianDualRadiusSquared(apollonianCandidate)) {
					apollonianDual = apollonianCandidate;
					break;
				}
			}
			// A dual-circle tangency is part of the residual gasket, not a missing region.
			if (apollonianDual < 0) break;
			vec2 apollonianDualCentreHere = apollonianDualCentre(apollonianDual);
			vec2 apollonianFromDual = apollonianQ - apollonianDualCentreHere;
			float apollonianDistanceSquared = dot(apollonianFromDual, apollonianFromDual);
			if (apollonianDistanceSquared < 1e-10) {
				// The only reachable pole is the central inversion's centre. Infinity is in the outer generator,
				// whose inverse is the central packed circle of radius (2 - sqrt(3)) squared.
				apollonianPacked = 1.0;
				apollonianDepth = APOLLONIAN_CENTRAL_DUAL_RADIUS_SQUARED / apollonianScale;
				apollonianCircleRadius = APOLLONIAN_CENTRAL_DUAL_RADIUS_SQUARED / apollonianScale;
				apollonianGenerator = 3.0;
				apollonianTerminalVector = vec2(1.0, 0.0);
				break;
			}
			float apollonianFactor = apollonianDualRadiusSquared(apollonianDual) / apollonianDistanceSquared;
			vec2 apollonianNormal = apollonianFromDual * inversesqrt(apollonianDistanceSquared);
			apollonianBasisX = apollonianReflectVector(apollonianBasisX, apollonianNormal);
			apollonianBasisY = apollonianReflectVector(apollonianBasisY, apollonianNormal);
			apollonianQ = apollonianDualCentreHere + apollonianFromDual * apollonianFactor;
			apollonianScale = min(apollonianScale * apollonianFactor, 1e30);
			apollonianCode = fract(apollonianCode * 0.754877666 + float(apollonianDual + 1) * 0.173205081);
			apollonianGeneration += 1.0;
		}
	}

	float apollonianAA = max(apollonianPixel * 0.8, 1e-5);
	float apollonianTile = apollonianPacked * smoothstep(-apollonianAA, apollonianAA, apollonianDepth);
	float apollonianRimWidth = rim * apollonianCircleRadius;
	float apollonianRim = apollonianTile * (1.0 - smoothstep(
		apollonianRimWidth - apollonianAA,
		apollonianRimWidth + apollonianAA,
		apollonianDepth
	));
	float apollonianPatchDistance = 1.0 - length(apollonianPatchQ);
	float apollonianPatch = smoothstep(-apollonianAA, apollonianAA, apollonianPatchDistance);
	float apollonianOuterRim = 1.0 - smoothstep(
		rim * 0.7 - apollonianAA,
		rim * 0.7 + apollonianAA,
		abs(apollonianPatchDistance)
	);

	vec2 apollonianRadial = length(apollonianTerminalVector) > 1e-8
		? normalize(apollonianTerminalVector)
		: vec2(1.0, 0.0);
	vec2 apollonianLocalGroove = vec2(-apollonianRadial.y, apollonianRadial.x);
	vec2 apollonianPulledGroove = vec2(
		dot(apollonianBasisX, apollonianLocalGroove),
		dot(apollonianBasisY, apollonianLocalGroove)
	);
	vec2 apollonianPatchRadial = length(apollonianPatchQ) > 1e-8 ? normalize(apollonianPatchQ) : vec2(1.0, 0.0);
	vec2 apollonianPatchGroove = vec2(-apollonianPatchRadial.y, apollonianPatchRadial.x);
	groove = normalize(mix(vec2(0.8, 0.6), apollonianPulledGroove, apollonianTile) + apollonianPatchGroove * apollonianOuterRim + 1e-6);
	float apollonianTileSeed = hash(vec2(apollonianCode + apollonianGenerator * 0.193, apollonianGeneration * 0.371));
	seed = mix(0.08, apollonianTileSeed, apollonianTile);
	vivid = mix(0.06, 0.92, apollonianTile) * mix(0.55, 1.0, apollonianPatch);
	copper = apollonianTile * (1.0 - apollonianRim * 0.35);
	copperPad = max(apollonianRim, apollonianOuterRim * 0.9);
	shade = mix(0.82, 1.0, apollonianPatch) * (1.0 + 0.12 * max(apollonianRim, apollonianOuterRim));
	cellSize = apollonianPacked > 0.5
		? max(2.0 * apollonianCircleRadius * apollonianUnit, footprint)
		: 0.3 * apollonianUnit;
`
});
