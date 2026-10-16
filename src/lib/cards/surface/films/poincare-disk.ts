import { defineFilm } from './film.ts';

/**
 * Poincare disk: reflections in the two radial mirrors and the orthogonal edge circle fold the disk into one
 * (pi/p, pi/3, pi/2) hyperbolic triangle, so each p makes a genuine regular {p,3} tiling; the default is {12,3}, and
 * the Euclidean cells contract toward the unit-circle rim because the model is conformal.
 */
export default defineFilm({
	name: 'poincare-disk',
	ground: 1.06,
	scale: 0.436,
	params: {
		sides: { value: 12, min: 7, max: 12, step: 1, note: 'Polygon sides in the regular hyperbolic {p,3} tiling.' },
		rotation: { value: 0, min: -3.14159, max: 3.14159, step: 0.01, note: 'Rotate the disk without changing its circular geometry.' },
		zoom: { value: 0.92, min: 0.3, max: 40, step: 0.05, note: 'Magnification of the disk; zoom in to fill the card with a section of the tiling.' },
		focusX: { value: -0.015, min: -1, max: 1, step: 0.01, note: 'Horizontal focus in disk radii: -1 is the left rim, 0 the centre, 1 the right rim.' },
		focusY: { value: 0.001, min: -1, max: 1, step: 0.01, note: 'Vertical focus in disk radii: -1 is the top rim, 0 the centre, 1 the bottom rim.' }
	},
	glsl: `
	// p is in physical card units. Keep the disk circular in that space (5 by 7 cards), not card-normalized.
	float pd_diskRadius = 2.18 * zoom * 8.0 / filmScale;
	vec2 pd_origin = p - v_view.zw - CARD * 0.5 + vec2(focusX, focusY) * pd_diskRadius;
	float pd_radius = length(pd_origin) / pd_diskRadius;
	float pd_diskAa = max(length(fwidth(pd_origin / pd_diskRadius)), 0.000001);
	float pd_diskMask = 1.0 - smoothstep(1.0 - pd_diskAa * 1.5, 1.0 + pd_diskAa * 1.5, pd_radius);
	float pd_rim = 1.0 - smoothstep(pd_diskAa * 0.35, pd_diskAa * 1.8, abs(pd_radius - 1.0));

	// A right triangle for {p,3} has A=pi/p, B=pi/3, C=pi/2. Thus
	// cosh(R)=cot(A)cot(B), rho=tanh(R/2), and the edge circle is
	// |z|^2 - 2*d*z.x + 1 = 0, with d=(1+rho^2)/(2*rho*cos(A)).
	float pd_p = clamp(sides, 7.0, 12.0);
	float pd_half = 3.14159265 / pd_p;
	float pd_coshR = 1.0 / (tan(pd_half) * 1.7320508);
	float pd_rho = sqrt(max((pd_coshR - 1.0) / (pd_coshR + 1.0), 0.00001));
	float pd_mirrorCenter = (1.0 + pd_rho * pd_rho) / (2.0 * pd_rho * cos(pd_half));
	float pd_mirrorRadius2 = max(pd_mirrorCenter * pd_mirrorCenter - 1.0, 0.00001);
	vec2 pd_normal = vec2(cos(pd_half), sin(pd_half));

	// Clamp only the input at the unit circle: inversion then stays finite even on rim pixels.
	vec2 pd_z = pd_origin / pd_diskRadius;
	pd_z *= min(0.9995 / max(pd_radius, 0.00001), 1.0);
	float pd_rotCos = cos(rotation);
	float pd_rotSin = sin(rotation);
	pd_z = mat2(pd_rotCos, pd_rotSin, -pd_rotSin, pd_rotCos) * pd_z;

	// Bounded reflection walk. Radial mirrors are diameters; the third mirror is inversion in the
	// orthogonal edge circle. Twenty-four passes cover all resolvable pixels before the unit rim.
	float pd_cellCode = 0.137;
	float pd_wedgeCode = 0.311;
	float pd_crossings = 0.0;
	float pd_resolved = 0.0;
	float pd_scale = 1.0;
	for (int pd_iter = 0; pd_iter < 24; pd_iter++) {
		bool pd_changed = false;
		if (pd_z.y < 0.0) {
			pd_z.y = -pd_z.y;
			pd_wedgeCode = fract(pd_wedgeCode * 3.17 + 0.29);
			pd_changed = true;
		}
		float pd_cross = pd_normal.x * pd_z.y - pd_normal.y * pd_z.x;
		if (pd_cross > 0.0) {
			pd_z = 2.0 * dot(pd_z, pd_normal) * pd_normal - pd_z;
			pd_wedgeCode = fract(pd_wedgeCode * 3.17 + 0.61);
			pd_changed = true;
		}
		float pd_side = dot(pd_z, pd_z) - 2.0 * pd_mirrorCenter * pd_z.x + 1.0;
		if (pd_side < 0.0) {
			vec2 pd_delta = pd_z - vec2(pd_mirrorCenter, 0.0);
			float pd_den = max(dot(pd_delta, pd_delta), 0.0001);
			pd_z = vec2(pd_mirrorCenter, 0.0) + pd_mirrorRadius2 * pd_delta / pd_den;
			pd_scale *= pd_mirrorRadius2 / pd_den;
			pd_cellCode = fract(pd_cellCode * 11.73 + pd_wedgeCode * 0.83 + 0.11);
			pd_wedgeCode = fract(pd_wedgeCode * 3.17 + 0.47);
			pd_crossings += 1.0;
			pd_changed = true;
		}
		if (!pd_changed) {
			pd_resolved = 1.0;
			break;
		}
	}

	// Only the edge-circle mirror is a heptagon boundary; radial mirrors triangulate each cell but do not
	// split its colour. The implicit-circle distance gives a stable, derivative-aware copper edge.
	vec2 pd_edgeDelta = pd_z - vec2(pd_mirrorCenter, 0.0);
	float pd_edgeDistance = abs(dot(pd_z, pd_z) - 2.0 * pd_mirrorCenter * pd_z.x + 1.0) /
		(2.0 * max(length(pd_edgeDelta), 0.0001)) * pd_diskRadius / pd_scale;
	float pd_edgeAa = max(fwidth(pd_edgeDistance), 0.0015);
	float pd_seam = 1.0 - smoothstep(pd_edgeAa * 0.45, pd_edgeAa * 2.3, pd_edgeDistance);
	float pd_cellHue = hash(vec2(pd_cellCode * 17.0 + pd_crossings * 0.071, pd_p));
	float pd_angle = atan(pd_z.y, pd_z.x);
	float pd_orientation = pd_cellHue * 6.2831853 + pd_angle * 0.35 + rotation;

	groove = vec2(cos(pd_orientation), sin(pd_orientation));
	seed = mix(-1.0, 0.08 + 0.84 * pd_cellHue, pd_diskMask);
	vivid = 0.98 * pd_diskMask * mix(0.72, 1.0, pd_resolved);
	copper = pd_diskMask * max(pd_seam, pd_rim * 0.78);
	copperPad = pd_diskMask * max(pd_seam * 0.82, pd_rim);
	shade = mix(0.9, 1.0, pd_diskMask) * mix(0.76, 1.0, pd_resolved);
	// Inversion's conformal scale converts the fundamental polygon back to physical card units.
	cellSize = mix(1.0, 2.0 * pd_diskRadius * pd_rho / pd_scale, pd_diskMask);
`
});
