import { defineFilm } from './film.ts';

/** Two overlapping spiral gratings with independent radial curvature and optional opposite winding. */
export default defineFilm({
	name: 'spiral-moire',
	palette: 'rainbow',
	scale: 0.2,
	ground: 0.3,
	params: {
		pitch: { value: 1.8, min: 0.5, max: 4, step: 0.05, note: 'Spiral turns per scaled card unit; higher makes the two gratings finer.' },
		tightness: { value: 12, min: 1, max: 12, step: 1, note: 'Interleaved spiral arms; whole arms keep each grating continuous around its centre.' },
		pitchOffset: { value: 0.168165137614679, min: 0, max: 0.18, step: 0.005, note: 'Relative pitch difference between the gratings; 0 gives equal pitch.' },
		offset: { value: 0.704307626146789, min: 0, max: 0.75, step: 0.01, note: 'Distance between spiral centres in card units; bends the interference bands.' },
		contrast: { value: 1.6, min: 0.2, max: 2, step: 0.05, note: 'Depth of the overlapping light and dark bands, independent of the colourway.' },
		slideWithTilt: { value: 1.61563455657492, min: 0, max: 4, step: 0.05, note: 'Move the second grating with tilt. Locked centres rotate only; 0 fixes the overlap.' },
		lockCenters: { value: 1, min: 0, max: 1, step: 1, note: '1 keeps both spirals at the same origin, ignoring offset and tilt translation. Tilt still rotates the second spiral.' },
		bendA: { value: 0.5, min: 0.5, max: 2, step: 0.01, note: 'First spiral radial bend: 1 gives evenly spaced turns; above 1 packs turns toward the rim, below 1 toward the centre.' },
		bendB: { value: 2, min: 0.5, max: 2, step: 0.01, note: 'Second spiral radial bend, independent of the first. Different bends create concentric interference.' },
		counterWound: { value: 1, min: 0, max: 1, step: 1, note: '1 reverses the second spiral, so clockwise and counterclockwise gratings cross.' }
	},
	helpers: `
// Filter each Fourier component separately. Filtering the two gratings before multiplying would erase
// the broad, resolvable difference bands when their fine carrier lines become subpixel.
float spiralMoireWave(float phase, vec2 gradient, vec2 pixelX, vec2 pixelY) {
	vec2 rate = vec2(dot(gradient, pixelX), dot(gradient, pixelY));
	return cos(phase) * exp(-0.25 * dot(rate, rate));
}
vec3 spiralMoirePhase(vec2 q, float frequency, float arms, float bend, float pivot) {
	float radius = length(q);
	float safeRadius = max(radius, 0.0001);
	float angle = radius > 0.0001 ? atan(q.y, q.x) : 0.0;
	vec2 radial = q / safeRadius;
	// A power-law radial phase changes curvature without fractional angular turns or a seam.
	float radialPower = pow(safeRadius / pivot, bend - 1.0);
	vec2 gradient = frequency * bend * radialPower * radial + arms * vec2(-q.y, q.x) / max(dot(q, q), 0.000001);
	return vec3(frequency * radius * radialPower + arms * angle, gradient);
}
`,
	glsl: `
	vec2 q = (p - v_view.zw - CARD * 0.5) * filmScale;
	vec2 pose = v_view.xy * u_shift * slideWithTilt;
	float turn = dot(pose, vec2(0.35, -0.55));
	float cs = cos(turn);
	float sn = sin(turn);
	mat2 rotation = mat2(cs, -sn, sn, cs);
	vec2 separation = lockCenters > 0.5 ? vec2(0.0) : (vec2(offset, offset * 0.35) + pose * 0.22) * filmScale;
	vec2 second = rotation * (q - separation);
	float arms = floor(tightness + 0.5);
	float frequency = 6.2831853 * pitch;
	float pivot = filmScale * CARD.x * 0.5;
	vec3 a = spiralMoirePhase(q, frequency, arms, bendA, pivot);
	vec3 b = spiralMoirePhase(second, frequency * (1.0 + pitchOffset), counterWound > 0.5 ? -arms : arms, bendB, pivot);
	// Transform the second phase gradient back into the first grating's coordinate frame.
	vec2 gradientB = mat2(cs, sn, -sn, cs) * b.yz;
	vec2 pixelX = dFdx(q);
	vec2 pixelY = dFdy(q);
	float carrierA = spiralMoireWave(a.x, a.yz, pixelX, pixelY);
	float carrierB = spiralMoireWave(b.x, gradientB, pixelX, pixelY);
	float difference = spiralMoireWave(a.x - b.x, a.yz - gradientB, pixelX, pixelY);
	float sum = spiralMoireWave(a.x + b.x, a.yz + gradientB, pixelX, pixelY);
	// Exact product of (0.5 + 0.5*cos(a)) and (0.5 + 0.5*cos(b)), with pixel filtering applied.
	float overlap = 0.25 + 0.25 * (carrierA + carrierB) + 0.125 * (difference + sum);
	float ink = clamp(0.5 + (overlap - 0.25) * contrast, 0.0, 1.0);
	vec2 slope = a.yz + gradientB;
	groove = length(slope) > 0.0001 ? normalize(vec2(-slope.y, slope.x)) : vec2(1.0, 0.0);
	seed = 0.08 * difference;
	vivid = 0.85;
	copper = ink;
	copperPad = 0.0;
	shade = mix(0.4, 1.15, ink);
	// The visible repeat is the beat envelope, not its finer carrier, which is filtered above.
	cellSize = 1.0 / (filmScale * pitch * max(pitchOffset, 0.005));
`
});
