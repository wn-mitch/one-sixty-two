import { defineFilm } from './film.ts';

/**
 * Galaxy: a grand-design spiral seen at a slant. A bright bulge sits at the card's centre; thin logarithmic arms wind
 * out from it, each with a dark dust lane along its inner edge and knots of new stars along its crest, and the disc
 * turns faster near the core than at its rim. The grooves run along the arms, so the colour streams down them.
 */
export default defineFilm({
	name: 'galaxy',
	animated: true,
	ground: 0.62,
	params: {
		arms: { value: 2, min: 1, max: 6, step: 1, note: 'Number of spiral arms.' },
		twist: { value: 4.2, min: 0.5, max: 10, step: 0.1, note: 'How tightly the arms wind.' },
		width: { value: 0.22, min: 0.05, max: 1, step: 0.01, note: 'Arm thickness.' },
		bulge: { value: 0.22, min: 0.02, max: 0.8, step: 0.01, note: 'Size of the bright core.' },
		dust: { value: 0.7, min: 0, max: 1.5, step: 0.01, note: 'Darkness of the dust lanes.' },
		incline: { value: 0.72, min: 0.2, max: 1, step: 0.01, note: 'How face-on the disc is; 1 looks straight down on it.' },
		speed: { value: 0.18, min: 0, max: 2, step: 0.01, note: 'How fast the disc turns.' }
	},
	glsl: `
	vec2 r = p - v_view.zw - CARD * 0.5;
	float unit = 2.2 * 8.0 / filmScale;
	cellSize = 0.3 * unit;
	// The disc tilts away from the viewer: turned a little, then squashed across its tilt.
	r = mat2(0.88, 0.48, -0.48, 0.88) * r;
	r.y /= incline;
	float radius = length(r) / unit;
	float angle = atan(r.y, r.x);
	// Differential rotation: the core turns quickly, the outer arms barely.
	float spin = u_time * speed / (0.35 + radius);
	float phase = arms * (angle - spin) - log(radius + 0.03) * twist * arms;
	float sharp = 1.0 / max(width, 0.01);
	float arm = pow(0.5 + 0.5 * cos(phase), sharp);
	// The dust lane trails just inside each arm's crest.
	float lane = pow(0.5 + 0.5 * cos(phase + 0.6), sharp * 1.6);
	float disc = exp(-radius * 1.5);
	float core = exp(-radius * radius / (bulge * bulge));
	float knots = smoothstep(0.6, 0.9, noise(r / unit * 16.0 + vec2(spin * 2.0, 0.0))) * arm;
	float light = clamp((arm * (0.75 + 0.6 * knots) * 2.6 * disc + core) * (1.0 - min(lane * dust * smoothstep(0.08, 0.3, radius), 0.9)), 0.0, 1.0);
	vec2 starUv = (p - v_view.zw) * 26.0 / unit;
	float star = step(0.988, hash(floor(starUv))) * smoothstep(0.45, 0.05, length(fract(starUv) - 0.5));
	// Along the arm: perpendicular to the direction the arm's phase climbs.
	vec2 radial = length(r) > 1e-4 ? r / length(r) : vec2(1.0, 0.0);
	vec2 around = vec2(-radial.y, radial.x);
	vec2 climb = around - radial * twist;
	groove = normalize(mix(vec2(0.6, 0.8), vec2(-climb.y, climb.x), light) + 1e-4);
	seed = mix(0.1, radius * 0.4 + arm * 0.2, light);
	vivid = mix(0.1, 1.0, light);
	copper = light;
	copperPad = max(core * 0.85, max(star, knots * disc * 0.8));
	// Space between the arms is dark.
	shade = mix(0.3, 1.0, smoothstep(0.0, 0.5, light + star));
`
});
