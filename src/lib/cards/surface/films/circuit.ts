import { CIRCUIT_CELLS, CIRCUIT_RANGE, CIRCUIT_TEXELS_PER_CELL } from '../circuit-tile.ts';
import { defineFilm } from './film.ts';

/**
 * Circuit: a 1990s circuit board. Long copper traces run mostly straight, turn 45 degrees and end in drilled ring
 * pads, read from a tile grown on the CPU; the copper streams rainbow along each trace over an etched silver ground.
 */
export default defineFilm({
	name: 'circuit',
	finish: 'etched',
	scale: 1.14,
	ground: 0.87,
	// Spun grooves show through the etched ground between the traces.
	under: 'spun',
	params: {
		density: { value: 1.0, min: 0.2, max: 4, step: 0.01, note: 'Wire cells per card unit; higher packs more, finer traces.' },
		traceWidth: { value: 0.14, min: 0.02, max: 0.45, step: 0.01, note: 'Half the width of each trace, in wire cells.' },
		padClearance: { value: 0.32, min: 0, max: 0.4, step: 0.01, note: 'How far traces stop short of the pad centres.' },
		padRadius: { value: 0.25, min: 0.05, max: 0.45, step: 0.01, note: 'Radius of each drilled ring pad, in wire cells.' },
		padRing: { value: 0.12, min: 0.02, max: 0.4, step: 0.01, note: 'Half the thickness of each pad ring.' }
	},
	glsl: `
	cellSize = 1.0 / (filmScale * density);
	// Circuit: long wires that run mostly straight and turn 45 degrees, packed edge to edge and ending in
	// drilled ring pads, read from a pre-grown tile (circuit-tile.ts). Rainbow runs along the copper on a finely
	// hatched silver mask. Units are wire cells.
	vec2 q = p * filmScale * density;
	vec2 uv = q / ${CIRCUIT_CELLS.toFixed(1)};
	vec4 wires = texture(u_circuit, uv);
	ivec2 texel = ivec2(mod(floor(uv * ${(CIRCUIT_CELLS * CIRCUIT_TEXELS_PER_CELL).toFixed(1)}), ${(CIRCUIT_CELLS * CIRCUIT_TEXELS_PER_CELL).toFixed(1)}));
	vec4 nearest = texelFetch(u_circuit, texel, 0);
	float traceDistance = (1.0 - wires.r) * ${CIRCUIT_RANGE.toFixed(2)};
	float padDistance = (1.0 - wires.g) * ${CIRCUIT_RANGE.toFixed(2)};
	float aa = max(length(fwidth(q)) * 0.6, 0.01);
	float trace = smoothstep(traceWidth + aa, traceWidth - aa, traceDistance) * smoothstep(padClearance, padClearance + aa, padDistance);
	float pad = smoothstep(padRing + aa, padRing - aa, abs(padDistance - padRadius));
	int direction = int(nearest.b * 4.0);
	vec2 dir = direction == 0 ? vec2(1.0, 0.0) : direction == 1 ? vec2(0.7071, 0.7071) : direction == 2 ? vec2(0.0, 1.0) : vec2(0.7071, -0.7071);
	vec2 radial = vec2(dFdx(wires.g), dFdy(wires.g));
	vec2 around = length(radial) > 1e-5 ? normalize(vec2(-radial.y, radial.x)) : vec2(1.0, 0.0);
	float metal = max(trace, pad);
	copper = metal;
	copperPad = pad;
	groove = normalize(mix(mix(vec2(0.6, 0.8), dir, trace), around, pad) + 1e-4);
	seed = mix(0.1, nearest.a, metal);
	vivid = mix(0.12, 1.0, metal);
`
});
