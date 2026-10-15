import { wallpaperGlsl, wallpaperParams } from '../wallpaper-ornament.ts';
import { defineFilm } from './film.ts';

/** Engraved palmettes and acanthus, with diffraction following the same ornamental die as the foil plate. */
export default defineFilm({
	name: 'wallpaper',
	ground: 0.38,
	params: {
		...wallpaperParams,
		density: { ...wallpaperParams.density!, value: 0.09, min: 0.04, max: 0.6, step: 0.005 }
	},
	helpers: wallpaperGlsl('wallpaperFilm'),
	glsl: `
	cellSize = 1.0 / (filmScale * density);
	vec2 q = p * filmScale * density;
	vec2 flow;
	float variant;
	vec3 marks = wallpaperFilmOrnament(q, aspect, petal, curl, spread, ridge, veins, beads, flow, variant);
	float aa = max(length(fwidth(q)) * 0.55, 0.0002);
	float body = 1.0 - smoothstep(-aa, aa + ridge, marks.x);
	float ink = 1.0 - smoothstep(max(ridge - aa, 0.0), ridge + aa, marks.y);
	float bead = 1.0 - smoothstep(-aa, aa, marks.z);
	// The leaf midrib, its curved fan and each scroll steer the diffraction, rather than a global rainbow wash.
	groove = normalize(mix(vec2(0.6, 0.8), flow, max(body, ink)) + vec2(1e-5));
	seed = (variant * 0.19 + dot(flow, vec2(0.17, 0.11))) * max(body, ink);
	vivid = mix(0.25, 0.92, body);
	shade = mix(0.78, 1.0, body);
	copper = max(ink, bead);
	copperPad = bead * 0.35;
`
});
