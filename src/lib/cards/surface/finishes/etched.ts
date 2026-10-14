import { defineFinish } from '../films/film.ts';

/** Etched: fine engraved lines cut along each piece's grooves, so every feature reads as line work that flashes edge by edge. */
export default defineFinish({
	name: 'etched',
	params: {
		pitch: { value: 60, min: 10, max: 240, step: 1, note: 'Lines per card unit.' },
		depth: { value: 0.35, min: 0, max: 1.5, step: 0.01, note: 'How deep the lines cut.' }
	},
	glsl: `
	vec2 across = vec2(-groove.y, groove.x);
	depth *= resolve(1.0 / pitch);
	float line = sin(dot(p, across) * pitch * 6.28318);
	normal = normalize(normal + vec3(across * line * depth * 0.18, 0.0));
	sweep += line * depth * 0.05;
`
});
