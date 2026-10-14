import { defineFilm } from './film.ts';

/**
 * Mojo: a few whirlpools twist the grooves into spirals that slowly wind, so the rainbow swirls as the card turns and as it rests.
 */
export default defineFilm({
	name: 'mojo',
	scale: 0.47,
	// The spirals slowly wind on their own.
	animated: true,
	params: {
		wind: { value: 0.21, min: 0, max: 4, step: 0.01, note: 'How tightly each whirlpool winds; 0 leaves plain circles.' },
		stagger: { value: 2.41, min: 0, max: 6.28318, step: 0.01, note: 'How far apart the whirlpools start their spirals, in radians.' },
		core: { value: 1.16, min: 0.02, max: 6, step: 0.01, note: 'Size of each whirlpool\'s pull; larger lets them reach further and blend.' },
		speed: { value: 0.77, min: -2, max: 2, step: 0.01, note: 'How fast the spirals wind over time; 0 holds them still.' }
	},
	glsl: `
	vec2 swirl = vec2(0.0);
	for (int k = 0; k < 4; k++) {
		vec2 centre = CARD * vec2(0.2 + 0.6 * hash(vec2(float(k), 1.0)), 0.15 + 0.7 * hash(vec2(float(k), 2.0)));
		vec2 r = p - centre;
		float d = length(r) + 1e-3;
		float twist = d * filmScale * wind + float(k) * stagger + u_time * speed;
		vec2 tangent = vec2(-r.y, r.x) / d;
		vec2 radial = r / d;
		swirl += (tangent * cos(twist) + radial * sin(twist)) / (core + d * d);
	}
	groove = normalize(swirl + 1e-4);
	vivid = 1.0;
`
});
