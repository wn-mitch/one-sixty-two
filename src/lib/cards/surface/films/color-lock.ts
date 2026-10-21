import { defineFilm } from './film.ts';

/**
 * Color lock (ITW's true colouring): a baseball printed in spectral holo colour that resolves to its familiar white
 * hide and red stitching only as the card faces straight on, then drifts back through the spectrum as it tilts
 * away.
 */
export default defineFilm({
	name: 'color-lock',
	experimental: true,
	params: {
		size: { value: 1.5, min: 0.6, max: 2.4, step: 0.01, note: 'Ball radius in card units.' },
		lock: { value: 0.22, min: 0.03, max: 1, step: 0.01, note: 'How near straight on, in full leans, the true colours hold.' },
		spread: { value: 0.8, min: 0, max: 3, step: 0.05, note: 'How far through the spectrum a full lean shifts the colours.' },
		stitches: { value: 60, min: 20, max: 120, step: 1, note: 'Stitches round each seam circle.' },
		travel: { value: 0.12, min: 0.03, max: 0.4, step: 0.005, note: 'Lean, as the sine of the tilt, that counts as a full lean.' }
	},
	glsl: `
	vec2 f = cardFace(p);
	vec2 lean = v_view.xy / max(travel, 1e-3);
	vec2 u = (f - CARD * 0.5) * vec2(1.0, -1.0) / size;
	float ball = inked((length(u) - 1.0) * size);
	float stitchInk = 0.0;
	float seamInk = 0.0;
	for (int side = 0; side < 2; side++) {
		vec2 r = u - vec2(side == 0 ? 1.45 : -1.45, 0.0);
		float seam = abs(length(r) - 1.05);
		seamInk = max(seamInk, inked((seam - 0.012) * size));
		float dash = abs(fract(atan(r.y, r.x) / 6.28318 * stitches) - 0.5);
		stitchInk = max(stitchInk, inked((abs(seam - 0.07) - 0.035) * size) * step(dash, 0.22));
	}
	float shadeBall = 0.85 + 0.15 * dot(normalize(vec3(u, sqrt(max(1.0 - dot(u, u), 0.0)))), normalize(vec3(-0.4, 0.5, 0.8)));
	vec3 hide = vec3(0.95, 0.94, 0.9) * shadeBall;
	vec3 thread = vec3(0.82, 0.08, 0.1);
	float t = dot(lean, vec2(0.7071, 0.7071)) * spread;
	vec3 hideShift = mix(vec3(0.82), rainbow(t + u.x * 0.15), 0.6) * shadeBall;
	vec3 threadShift = rainbow(t + 0.5);
	float locked = exp(-dot(lean, lean) / max(lock * lock, 1e-5));
	vec3 color = mix(mix(hideShift, hide, locked), hide * 0.7, seamInk);
	color = mix(color, mix(threadShift, thread, locked), stitchInk);
	own = vec4(color, ball);
	ownFlash = (1.0 - locked) * 0.4;
	groove = vec2(0.6, 0.8);
	vivid = 0.6;
`
});
