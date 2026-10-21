import { foilPlateGlsl } from './foil-plates.ts';
import { holoFilmGlsl, type FilmSpec } from './holo-films.ts';
import { TUNE_SLOTS } from './films/film.ts';
import { RELIEF_RANGE } from './surfaces.ts';

/**
 * How a card's tier, film, plate and colourway share one float slot: tier + FILM_CODE * film + PLATE_CODE * plate
 * + PALETTE_CODE * (palette + 1). Each field gets its own range, so up to 64 films and 32 plates decode exactly.
 */
export const FILM_CODE = 4;
export const PLATE_CODE = 256;
export const PALETTE_CODE = 8192;

/** The light pass's shaders: one instanced quad per card, lit from its surface map, ink and finish. */
export const LIGHT_VERTEX = `#version 300 es
layout(location = 0) in vec2 a_origin;
layout(location = 1) in vec4 a_axes;
layout(location = 2) in vec4 a_tile;
layout(location = 3) in vec4 a_light;
layout(location = 4) in vec4 a_view;
layout(location = 5) in vec4 a_plate;
layout(location = 6) in float a_zoom;
uniform vec2 u_resolution;
out vec2 v_card;
out vec2 v_atlas;
flat out vec2 v_cardSize;
flat out vec4 v_tile;
flat out vec4 v_light;
flat out vec4 v_view;
flat out vec4 v_plate;
flat out float v_zoom;
void main() {
	vec2 corner = vec2(gl_VertexID & 1, gl_VertexID >> 1);
	vec2 position = a_origin + corner.x * a_axes.xy + corner.y * a_axes.zw;
	v_card = corner;
	v_atlas = a_tile.xy + corner * a_tile.zw;
	v_cardSize = vec2(length(a_axes.xy), length(a_axes.zw));
	v_tile = a_tile;
	v_light = a_light;
	v_view = a_view;
	v_plate = a_plate;
	v_zoom = max(a_zoom, 1.0);
	vec2 clip = position / u_resolution * 2.0 - 1.0;
	gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

/** What one light program carries: its film code (see FilmSpec) and the plates it can press, by number. */
export interface ProgramSpec extends FilmSpec {
	plates: ReadonlySet<number>;
}

/**
 * The fragment shader for a program that draws only what `spec` names. Each card's program carries only what it
 * shows, so it compiles quickly; any other film or plate number falls back to none. Without a spec it carries all.
 */
export function lightFragment(spec?: ProgramSpec): string {
	return `#version 300 es
precision highp float;
in vec2 v_card;
in vec2 v_atlas;
flat in vec2 v_cardSize;
flat in vec4 v_tile;
flat in vec4 v_light;
flat in vec4 v_view;
flat in vec4 v_plate;
flat in float v_zoom;
uniform sampler2D u_map;
uniform sampler2D u_ink;
uniform sampler2D u_circuit;
uniform float u_foilMode;
uniform float u_shift;
uniform float u_time;
uniform float u_paper;
uniform float u_wash;
uniform float u_foilPlate;
uniform float u_plateDepth;
uniform float u_plateScale;
uniform float u_plateTone;
uniform float u_stain;
uniform float u_texel;
uniform float u_relief;
uniform float u_lightHeight;
uniform float u_glare;
uniform float u_shine;
uniform float u_foil;
uniform float u_coat;
uniform float u_holoPattern;
uniform float u_holoScale;
uniform float u_waves;
uniform float u_brush;
// Live dials for one film, finish and plate (the workshop's); -1 tunes none, and every module prints as shipped.
uniform int u_tuneFilm;
uniform float u_filmTune[${TUNE_SLOTS}];
uniform int u_tuneFinish;
uniform float u_finishTune[${TUNE_SLOTS}];
uniform int u_tunePlate;
uniform float u_plateTune[${TUNE_SLOTS}];
// Swap every film's finish and colourway, by index; -1 keeps each film's own.
uniform int u_finish;
uniform int u_palette;
// A custom colourway carries two to five evenly-spaced RGB stops without changing the program.
uniform int u_customGradientCount;
uniform vec3 u_customGradient[5];
// How far the plate presses through holo film as well as bare foil; 0 keeps the film smooth over it.
uniform float u_plateUnderFilm;
// A film printed under every film, by number, showing through the top film's ground; -1 keeps each film's own, -2 prints none.
uniform int u_underFilm;
uniform float u_underMix;
out vec4 o_color;

const vec2 CARD = vec2(5.0, 7.0);

vec4 surface(vec2 offset) {
	vec2 lo = v_tile.xy + 0.5 * u_texel;
	vec2 hi = v_tile.xy + v_tile.zw - 0.5 * u_texel;
	return texture(u_map, clamp(v_atlas + offset * u_texel, lo, hi));
}

vec4 printed() {
	vec2 lo = v_tile.xy + 0.5 * u_texel;
	vec2 hi = v_tile.xy + v_tile.zw - 0.5 * u_texel;
	return texture(u_ink, clamp(v_atlas, lo, hi));
}

float lightness(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec3 rainbow(float t) { return 0.55 + 0.45 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 19.19)); }
// Card units one screen pixel spans, set in main before any branch so its derivatives are defined.
float footprint = 1.0;
// This card's foil plate tuning, its own times the scene's, set in main.
float plateScale = 1.0;
float plateTone = 1.0;
float plateStain = 0.6;
// How strongly the holo film shows its colour and pattern; 1 is the film as designed.
float holoVivid = 1.0;
// This card's chosen colourway, or -1 to keep the scene/film default, unpacked in main.
int cardPalette = -1;
${holoFilmGlsl(spec)}

${foilPlateGlsl(spec?.plates)}
void over(inout vec4 target, vec3 color, float alpha) {
	alpha = clamp(alpha, 0.0, 1.0);
	target = vec4(color * alpha + target.rgb * (1.0 - alpha), alpha + target.a * (1.0 - alpha));
}

void main() {
	// Rounded card corners, 1.8% of the width.
	vec2 p = v_card * CARD;
	// Films and plates read a zoomed copy of the face, so a small swatch shows them at full-card detail.
	vec2 q = CARD * 0.5 + (p - CARD * 0.5) / v_zoom;
	footprint = max(length(fwidth(p)), 1e-5) / v_zoom;
	plateScale = u_plateScale * v_plate.x;
	plateTone = u_plateTone * v_plate.y;
	plateStain = clamp(u_stain * v_plate.z, 0.0, 1.0);
	holoVivid = max(v_plate.w, 0.0);
	vec2 inner = clamp(p, vec2(0.09), CARD - 0.09);
	if (length(p - inner) > 0.09) discard;

	vec4 here = surface(vec2(0.0));
	float metal = here.g;
	float gloss = here.b;
	// Signed around 0.5: holo above, silver foil below.
	float iridescence = max(here.a - 0.5, 0.0) * 2.0;
	float silver = max(0.5 - here.a, 0.0) * 2.0;
	float height = (here.r - 0.5) * 2.0 * ${RELIEF_RANGE.toFixed(1)};

	// Relief slopes from two sampling radii: the near pair keeps edges crisp, the far pair rounds them.
	float dx = (surface(vec2(1.25, 0.0)).r - surface(vec2(-1.25, 0.0)).r) * 0.6 + (surface(vec2(2.5, 0.0)).r - surface(vec2(-2.5, 0.0)).r) * 0.4;
	float dy = (surface(vec2(0.0, 1.25)).r - surface(vec2(0.0, -1.25)).r) * 0.6 + (surface(vec2(0.0, 2.5)).r - surface(vec2(0.0, -2.5)).r) * 0.4;
	vec3 normal = normalize(vec3(-dx * u_relief, -dy * u_relief, 1.0));
	// Uncoated stock shows its fiber; a coat fills it in.
	float fiber = (1.0 - gloss) * 0.18 * u_paper;
	normal = normalize(normal + vec3(noise(p * 46.0) - 0.5, noise(p * 46.0 + 17.0) - 0.5, 0.0) * fiber);

	vec3 lightPosition = vec3(v_light.xy * CARD, u_lightHeight);
	vec3 toLight = normalize(lightPosition - vec3(p, height * 0.05));
	// Tilting the card swings the viewer across its face, which is what makes foil shift on a real card.
	vec3 view = normalize(vec3(v_view.xy * u_shift, 1.0));
	float intensity = 0.55 + 0.45 * v_light.z;

	vec4 result = vec4(0.0);
	// Tier, film, plate and one-based per-card colourway share one exact integer slot.
	float paletteCode = floor(v_light.w / ${PALETTE_CODE}.0 + 0.001);
	float finishCode = v_light.w - paletteCode * ${PALETTE_CODE}.0;
	cardPalette = int(paletteCode) - 1;
	float plateCode = floor(finishCode / ${PLATE_CODE}.0 + 0.001);
	float packed = finishCode - plateCode * ${PLATE_CODE}.0;
	float tier = mod(packed + 0.01, ${FILM_CODE}.0) - 0.01;
	float pattern = u_holoPattern < -0.5 ? floor(packed / ${FILM_CODE}.0 + 0.01) : u_holoPattern;
	int plate = int((u_foilPlate < -0.5 ? plateCode : u_foilPlate) + 0.5);
	// The plate presses into silver and gold foil only; holo film keeps its own grooves.
	// Full gloss marks a vinyl sticker, smooth over the card's plate, with the plain refractor sweep for its holo.
	float vinyl = step(0.985, gloss);
	float plated = smoothstep(0.45, 0.9, metal) * (1.0 - iridescence * (1.0 - u_plateUnderFilm)) * (1.0 - vinyl) * u_plateDepth;
	if (plate > 0 && plated > 0.0) normal = normalize(normal + vec3(foilSlope(q, plate) * plated, 0.0));
	// Each metal runs from its shadow colour through a saturated body to a near-white hot spot.
	bool gold = tier > 1.5 && tier < 2.5;
	vec3 deep = gold ? vec3(0.32, 0.19, 0.04) : tier > 2.5 ? vec3(0.34, 0.33, 0.4) : vec3(0.27, 0.29, 0.33);
	vec3 body = gold ? vec3(0.93, 0.68, 0.24) : tier > 2.5 ? vec3(0.86, 0.84, 0.94) : vec3(0.78, 0.81, 0.86);
	vec3 hot = gold ? vec3(1.0, 0.95, 0.74) : vec3(1.0);
	deep = mix(deep, vec3(0.27, 0.29, 0.33), silver);
	body = mix(body, vec3(0.78, 0.81, 0.86), silver);
	hot = mix(hot, vec3(1.0), silver);
	vec3 tint = body;

	// Foil mirrors a banded environment that slides as the light moves: dark bands make it read as metal, not paint.
	vec3 reflected = reflect(-view, normal);
	// Waves repeat the stripes across the card; the reflected term grows more slowly so fine surface noise stays noise.
	float band = 0.5 + 0.5 * sin((reflected.x * 5.0 + reflected.y * 3.0) * mix(1.0, u_waves, 0.25) + (p.x * 0.55 + p.y * 0.3) * u_waves - v_light.x * 6.0 - v_light.y * 2.0);
	float glint = pow(band, 6.0);
	// Brushed foil: streaks run across the card and shift the reflection along each one.
	float grain = noise(vec2(p.x * 3.0, p.y * 140.0)) * 0.7 + noise(vec2(p.x * 9.0, p.y * 420.0)) * 0.3;
	band = clamp(band + (grain - 0.5) * (plate == 0 ? u_brush : 0.0) * (1.0 - iridescence) * (1.0 - vinyl) * 0.6, 0.0, 1.0);
	vec3 foil = mix(deep, body, smoothstep(0.08, 0.6, band));
	foil = mix(foil, hot, glint * (0.55 + 0.45 * intensity));
	// Damascus darkens its dark layers and carbon its black tows; stain tints the steel with temper colours.
	vec2 tone = plate > 0 ? plateShade(q, plate) * min(plated, 1.0) : vec2(0.0);
	foil *= 1.0 - min(tone.x, 1.0) * 0.82;
	foil *= mix(vec3(1.0), plateTint(q, plate), min(tone.y, 1.0));
	float flash;
	vec3 holo = holoFoil(q + v_view.zw, normal, normalize(toLight + view), band, vinyl > 0.5 ? 0.0 : pattern, flash);
	holo = mix(holo, vec3(1.0), flash * 0.45) * (0.75 + 0.5 * flash);
	// Holo vinyl is pearly: its rainbow sits over a white base.
	holo = mix(holo, vec3(1.0), vinyl * 0.35);
	// Vividness saturates the film and lets it cover more of the metal under it.
	holo = clamp(mix(vec3(lightness(holo)), holo, holoVivid), 0.0, 1.0);
	foil = mix(foil, holo, iridescence * min(0.85 * max(sqrt(holoVivid), 0.0), 1.0));
	// What the foil does to the ink under its die.
	vec4 ink = printed();
	if (ink.a > 0.01) {
		vec3 base = ink.rgb / ink.a;
		if (u_foilMode > 1.5) {
			// Keeps the ink's lightness, so foiled lettering reads at the contrast it was printed with.
			float sheen = 0.75 + 0.5 * band;
			foil = mix(foil, clamp(foil / max(lightness(foil), 0.05) * lightness(base) * sheen, 0.0, 1.0), ink.a);
		} else if (u_foilMode > 0.5) {
			// Colour over foil: the metal takes the ink's hue and lifts its lightness toward the metal's, so
			// dark ink still glints as foil while light and dark print stay apart. Near-grey ink leaves the metal's hue.
			float inkLevel = lightness(base);
			float chroma = smoothstep(0.02, 0.12, length(base - vec3(inkLevel)));
			vec3 hue = mix(foil / max(lightness(foil), 0.04), base / max(inkLevel, 0.04), chroma);
			foil = mix(foil, clamp(hue * mix(inkLevel, lightness(foil), 0.3), 0.0, 1.0), ink.a);
		}
	}
	// Foil areas take the reflection as their colour; a chrome coat only catches highlights.
	over(result, foil, smoothstep(0.45, 0.9, metal) * u_foil);

	// Relief light and shade, relative to the flat stock so unrelieved print keeps its colour.
	float lambert = dot(normal, toLight) - toLight.z;
	over(result, vec3(0.0), max(-lambert, 0.0) * 0.8);
	over(result, mix(vec3(1.0), tint, metal), max(lambert, 0.0) * 0.5 * intensity);

	// Coat and foil highlights: tight and bright on mirror coats, broad and faint on matte stock.
	vec3 halfway = normalize(toLight + view);
	float shininess = mix(6.0, 140.0, gloss);
	// Foil catches the full highlight; plain coat a fraction of it, so the two separate under the light.
	float foiled = smoothstep(0.3, 0.9, metal);
	float reflectance = mix(u_coat, 1.0, foiled) * (1.0 - min(tone.y, 1.0) * 0.15);
	float specular = pow(max(dot(normal, halfway), 0.0), shininess) * mix(0.04, 0.85, gloss) * intensity * u_shine * reflectance;
	// Metal reflects in its own colour, so coloured foil glints in its colour instead of washing to white.
	vec3 shine = mix(vec3(1.0), mix(clamp(foil * 1.6, 0.0, 1.0), holo, iridescence), metal * 0.85);
	over(result, shine, specular);

	// A spotlight lifts a soft glare over the whole card.
	float glare = exp(-dot(p - lightPosition.xy, p - lightPosition.xy) / 6.0) * v_light.z * u_glare * reflectance;
	over(result, vec3(1.0), glare);

	// The finish carries past its dies. Gem board is holo all over, so a faint refractor sweep rides across the
	// whole face; silver and gold boards catch one soft sheen band. Both slide as the light and the viewer move.
	float face = (1.0 - foiled) * u_wash * (0.7 + 0.3 * intensity);
	float drift = dot(view.xy, vec2(2.2, 1.4)) - v_light.x * 2.4 - v_light.y * 1.2;
	if (tier > 2.5) {
		vec3 sweep = rainbow(p.x * 0.09 + p.y * 0.06 + drift * 0.35);
		float swell = 0.5 + 0.5 * sin(p.x * 0.9 - p.y * 0.6 + drift * 1.7);
		over(result, sweep, face * (0.08 + 0.14 * swell));
	} else if (tier > 0.5) {
		float sheen = pow(0.5 + 0.5 * sin(p.x * 0.7 - p.y * 0.45 + drift * 1.5), 5.0);
		over(result, gold ? vec3(1.0, 0.86, 0.55) : vec3(0.92, 0.95, 1.0), face * sheen * 0.22);
	}

	// Uncoated paper is not an even sheet: fibers clump into a faint warm mottle, strongest where the coat is thinnest.
	float unfoiled = 1.0 - smoothstep(0.3, 0.9, metal);
	float mottle = noise(p * 7.0) * 0.6 + noise(p * 23.0) * 0.3 + noise(vec2(p.x * 90.0, p.y * 30.0)) * 0.1;
	over(result, vec3(0.42, 0.36, 0.27), max(mottle - 0.35, 0.0) * 0.32 * pow(1.0 - gloss, 2.0) * u_paper * unfoiled);

	// Gem foil glints: a few spots in the holo catch a star of light and fade, each on its own rhythm.
	vec2 sparkCell = floor(p * 2.4);
	float pick = hash(sparkCell + 3.1);
	if (iridescence > 0.5 && metal > 0.5 && pick < 0.06) {
		vec2 centre = (sparkCell + 0.25 + 0.5 * hash2(sparkCell + 5.3)) / 2.4;
		vec2 d = abs(p - centre) * 2.4;
		float star = exp(-length(d) * 9.0) + 0.6 * (exp(-d.x * 40.0 - d.y * 7.0) + exp(-d.y * 40.0 - d.x * 7.0));
		float twinkle = pow(max(sin(u_time * (0.8 + pick * 10.0) + hash(sparkCell) * 6.28318), 0.0), 8.0);
		over(result, vec3(1.0), star * twinkle * iridescence);
	}

	o_color = result;
}`;
}

/** The fragment shader with every film and plate. */
export const LIGHT_FRAGMENT = lightFragment();
