import { defineFilm } from './film.ts';

/**
 * Double helix: twisted ladders down the card, two strands winding around each other, joined by base-pair
 * rungs.
 */
export default defineFilm({
	name: 'double-helix',
	scale: 1.71633218654434,
	ground: 1.5,
	params: {
		density: { value: 0.3, min: 0.05, max: 1.5, step: 0.005, note: 'Helix size against the card; higher packs more, smaller helices.' },
		spacing: { value: 1.17165519877676, min: 0.6, max: 5, step: 0.05, note: 'Distance between neighbouring helices.' },
		pitch: { value: 1.44158543577982, min: 0.3, max: 10, step: 0.05, note: 'How fast the strands wind down the card.' },
		radius: { value: 0.573021788990826, min: 0.1, max: 1.5, step: 0.01, note: 'How far each strand swings out from the helix axis.' },
		strandWidth: { value: 0.052998375382263, min: 0.01, max: 0.3, step: 0.005, note: 'Half the thickness of each strand.' },
		swell: { value: 0.0357702599388379, min: 0, max: 0.2, step: 0.005, note: 'How much a strand thickens where it faces the viewer.' },
		rungs: { value: 11, min: 1, max: 20, step: 1, note: 'Base-pair rungs per half turn.' },
		slideWithTilt: { value: 0.2, min: 0, max: 4, step: 0.05, note: 'Walk the helices vertically with tilt, each column at its own rate. 0 fixes the pattern; 1 gives the full effect.' }
	},
	glsl: `
	cellSize = 1.0 / (filmScale * density);
	vec2 q = p * filmScale * density;
	float column = floor(q.x / spacing);
	// Tilt, not time, drives the walk; a held pose holds the pattern and returning restores it.
	float walk = dot(v_view.xy, vec2(0.6, 1.0)) * u_shift * slideWithTilt;
	q.y += walk * (0.6 + 1.4 * hash(vec2(column, 8.0))) * 6.2831853 / pitch;
	float x = q.x - (column + 0.5) * spacing;
	float phase = q.y * pitch + column * 1.3;
	float a = radius * sin(phase);
	float b = radius * sin(phase + 3.14159);
	// Strands' widths swell where they face the viewer, as a helix does in depth.
	float wa = strandWidth + swell * cos(phase);
	float wb = strandWidth - swell * cos(phase);
	float strandA = smoothstep(wa + 0.03, wa, abs(x - a));
	float strandB = smoothstep(wb + 0.03, wb, abs(x - b));
	float rungStep = 3.14159 / rungs;
	float rungPhase = mod(phase, rungStep) - rungStep * 0.5;
	float rung = smoothstep(0.06, 0.03, abs(rungPhase / pitch)) * step(min(a, b), x) * step(x, max(a, b));
	float strand = max(strandA, strandB);
	float ink = max(strand, rung * 0.8);
	vec2 along = normalize(vec2(radius * pitch * cos(phase), 1.0));
	groove = normalize(mix(vec2(0.6, 0.8), strand > rung ? along : vec2(1.0, 0.0), ink) + 1e-4);
	seed = mix(hash(vec2(column, 1.0)) * 0.3, strandA > strandB ? 0.2 : strandB > 0.0 ? 0.6 : hash(vec2(floor(phase / rungStep), column)), ink);
	vivid = mix(0.12, 1.0, ink);
	copper = ink;
	copperPad = rung * smoothstep(0.12, 0.0, min(abs(x - a), abs(x - b)));
`
});
