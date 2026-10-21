import { LIGHT_SWING } from '../../tilt-math.ts';
import { defineFilm } from './film.ts';

/**
 * Quarter-turn reveal (ITW's 90° switch): an upright stripe field that hides a diamond. The diamond's lines match
 * the field's while the light falls from above or below the card, so it is absent; turning the card a quarter turn
 * in its own plane, so the light falls from the side, turns its lines across and lights it while the field dims.
 * It reads where the light rests with the card's own lean taken out, as a distant light would fall, so tilting
 * alone never shows it.
 */
export default defineFilm({
	name: 'quarter-turn',
	experimental: true,
	params: {
		stripes: { value: 7, min: 2, max: 20, step: 0.5, note: 'Stripes per card unit.' },
		size: { value: 1.5, min: 0.5, max: 2.4, step: 0.01, note: "Half the diamond's width, in card units." },
		start: { value: 0.6, min: 0, max: 1, step: 0.01, note: 'How far the light must swing to the side, as the sine of its angle off upright, before the diamond starts to show; the shipped light sits at 0.39 upright.' },
		full: { value: 0.8, min: 0, max: 1, step: 0.01, note: 'Where the diamond is fully shown; a quarter turn of the shipped light reaches 0.92.' }
	},
	glsl: `
	vec2 f = cardFace(p);
	// Where the light rests, in the card's own frame, with the shift its lean adds taken back out.
	vec2 light = (v_light.xy + degrees(asin(clamp(v_view.xy, -1.0, 1.0))) / ${LIGHT_SWING}.0 - 0.5) * CARD;
	float sideways = smoothstep(start, max(full, start + 0.01), abs(light.x) / max(length(light), 1e-3));
	float upright = smoothstep(0.35, 0.65, 0.5 + 0.5 * cos(f.x * stripes * 6.28318));
	float across = smoothstep(0.35, 0.65, 0.5 + 0.5 * cos(f.y * stripes * 6.28318));
	vec3 lit = mix(vec3(0.82, 0.84, 0.88), rainbow(f.x * 0.08 + f.y * 0.05 + dot(v_view.xy, vec2(3.0, 2.0))), 0.55);
	vec3 dark = vec3(0.16, 0.17, 0.2);
	vec3 field = mix(dark, lit, upright * (1.0 - 0.65 * sideways));
	// Upright, the diamond is the field exactly; sideways its lines turn across and brighten.
	vec3 gem = mix(dark, mix(lit, vec3(1.0), 0.3 * sideways), mix(upright, across, sideways));
	vec2 c = abs(f - CARD * 0.5);
	float inside = inked(c.x + c.y * 0.8 - size);
	own = vec4(mix(field, gem, inside), 1.0);
	ownFlash = inside * sideways * across * 0.8;
`
});
