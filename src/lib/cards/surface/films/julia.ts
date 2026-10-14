import { defineFilm } from './film.ts';

/**
 * Julia: a Julia set from near the Mandelbrot set's seahorse valley, where the boundary curls into nested double
 * spirals. Its constant circles slowly, so the spirals breathe and wind, and its grooves turn with the escape count, so
 * each band winds around the spirals as one ribbon of colour.
 */
export default defineFilm({
	name: 'julia',
	animated: true,
	ground: 0.62,
	params: {
		cx: { value: -0.764, min: -1.2, max: 0.5, step: 0.001, note: 'Real part of the constant; spirals live near -0.75, the seahorse valley.' },
		cy: { value: 0.109, min: -0.8, max: 0.8, step: 0.001, note: 'Imaginary part of the constant.' },
		wobble: { value: 0.006, min: 0, max: 0.05, step: 0.0005, note: 'How far the constant circles, which winds and unwinds the spirals.' },
		speed: { value: 0.15, min: 0, max: 2, step: 0.01, note: 'How fast it circles.' },
		zoom: { value: 3, min: 0.3, max: 40, step: 0.05, note: 'Magnification into the spiral centre.' },
		focus: { value: 1, min: 0, max: 1, step: 0.01, note: 'Centres the view on the point the spirals wind around (1) or on the whole set (0).' },
		twist: { value: 0.35, min: 0, max: 3, step: 0.01, note: 'How fast the grooves turn from one escape band to the next.' },
		bands: { value: 5, min: 1, max: 24, step: 0.5, note: 'Escape steps per colour band.' }
	},
	glsl: `
	cellSize = 0.5 / (filmScale * 0.125);
	vec2 c = vec2(cx, cy) + wobble * vec2(cos(u_time * speed), sin(u_time * speed));
	// The repelling fixed point, (1 - sqrt(1 - 4c)) / 2: the boundary spirals wind around it and its preimages.
	vec2 w = vec2(1.0 - 4.0 * c.x, -4.0 * c.y);
	float wr = sqrt(length(w));
	float wa = atan(w.y, w.x) * 0.5;
	vec2 fixedPoint = (vec2(1.0, 0.0) - wr * vec2(cos(wa), sin(wa))) * 0.5;
	vec2 z = fixedPoint * focus + (p - v_view.zw - CARD * 0.5) / (CARD.y * 0.36) * (8.0 / filmScale) / zoom;
	float escaped = 0.0;
	float steps = 0.0;
	for (int k = 0; k < 96; k++) {
		z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
		if (dot(z, z) > 64.0) { escaped = 1.0; break; }
		steps += 1.0;
	}
	// Smooth iteration count, so the bands blend instead of stepping.
	float smoothSteps = escaped > 0.5 ? steps + 1.0 - log2(log2(max(dot(z, z), 1.0001)) * 0.5) : 96.0;
	float band = fract(smoothSteps / bands);
	float edge = escaped > 0.5 ? smoothstep(6.0, 40.0, smoothSteps) : 1.0;
	// The grooves turn smoothly with the escape count, so each band around the spirals sweeps as one ribbon.
	float turn = smoothSteps * twist;
	groove = escaped > 0.5 ? vec2(cos(turn), sin(turn)) : vec2(0.8, 0.6);
	seed = escaped > 0.5 ? band : 0.4;
	vivid = mix(0.35, 1.0, edge);
	copper = edge;
	copperPad = escaped > 0.5 ? smoothstep(0.9, 1.0, band) * edge : 0.0;
`
});
