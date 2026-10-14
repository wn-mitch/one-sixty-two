import { defineFinish } from '../films/film.ts';

/** Brushed: long fine scratches in one direction, so the colour streaks along them and shimmers across them. */
export default defineFinish({
	name: 'brushed',
	params: {
		angle: { value: 0, min: -90, max: 90, step: 1, note: 'Direction of the strokes, in degrees from horizontal.' },
		fineness: { value: 160, min: 20, max: 600, step: 5, note: 'Strokes per card unit across the grain.' },
		depth: { value: 0.5, min: 0, max: 2, step: 0.01, note: 'How strongly the strokes break up the colour.' }
	},
	glsl: `
	float a = radians(angle);
	depth *= resolve(3.0 / fineness);
	vec2 along = vec2(cos(a), sin(a));
	vec2 q = vec2(dot(p, along), dot(p, vec2(-along.y, along.x)));
	float grain = noise(vec2(q.x * 2.5, q.y * fineness)) * 0.7 + noise(vec2(q.x * 7.0, q.y * fineness * 3.0)) * 0.3;
	sweep += (grain - 0.5) * depth * 0.5;
	normal = normalize(normal + vec3(vec2(-along.y, along.x) * (grain - 0.5) * depth * 0.2, 0.0));
`
});
