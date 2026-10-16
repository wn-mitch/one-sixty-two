import { defineFilm } from './film.ts';

/** Soft rising wisps: layered currents stretch the smoke into translucent, iridescent folds. */
export default defineFilm({
	name: 'smoke',
	animated: true,
	ground: 0.48,
	palette: 'ice',
	params: {
		density: { value: 0.075, min: 0.02, max: 0.3, step: 0.005, note: 'Size of the billows; higher makes finer smoke.' },
		speed: { value: 0.12, min: 0, max: 0.6, step: 0.01, note: 'How fast the smoke rises.' },
		curl: { value: 2.4, min: 0, max: 5, step: 0.1, note: 'How far the currents fold the wisps.' },
		veil: { value: 0.55, min: 0.1, max: 1, step: 0.01, note: 'Density of the translucent smoke.' }
	},
	helpers: `
float smokeCloud(vec2 q) {
	return noise(q) * 0.57 + noise(q * 2.03 + 7.1) * 0.29 + noise(q * 4.09 + 19.3) * 0.14;
}
`,
	glsl: `
	vec2 q = (p - v_view.zw) * filmScale * density;
	cellSize = 1.0 / (filmScale * density);
	float t = u_time * speed;
	q.y += t;
	vec2 current = vec2(smokeCloud(q * 0.7 + vec2(t * 0.16, 0.0)), smokeCloud(q * 0.7 + vec2(9.2, -t * 0.13))) - 0.5;
	vec2 folded = q + current * curl;
	float cloud = smokeCloud(folded * vec2(1.0, 0.65));
	float ribbon = 1.0 - abs(sin(folded.x * 2.2 + cloud * 5.0));
	float mist = smoothstep(0.28, 0.78, cloud) * mix(0.3, 1.0, ribbon);
	groove = normalize(vec2(0.35 + current.x, 1.0 + current.y));
	seed = cloud * 0.8 + current.x * 0.25;
	vivid = mix(0.12, 0.7, mist);
	copper = clamp(mist * veil * 1.6, 0.0, 1.0);
	copperPad = mist * 0.22;
	shade = mix(0.55, 1.0, mist);
`
});
