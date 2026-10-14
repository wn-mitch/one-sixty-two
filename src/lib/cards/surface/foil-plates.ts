import type { CardEra } from '../view-model.ts';

/**
 * Foil plates: patterns pressed into silver and gold foil. Each is a height field; its slope tilts the
 * metal's normal, so the pattern shows as light and shade that move as the card tilts rather than as colour.
 * `brushed` keeps the plain brushed grain. Damascus, carbon and stain also change the metal's tone (`plateShade`).
 */
export const FOIL_PLATES = ['brushed', 'hammered', 'guilloche', 'sunburst', 'diamond-plate', 'pinstripe', 'spun', 'carbon', 'knurl', 'damascus', 'stain', 'weld'] as const;
export type FoilPlate = (typeof FOIL_PLATES)[number];

/** Each era's plate: hand-hammered 1950s stamping, 1960s brushed metal to go with its mojo holo, a 1970s sunburst, 1980s weld beads, 1990s spun metal, 2000s Damascus steel, 2010s carbon fibre and a machined 2020s knurl. */
export const ERA_FOIL: Readonly<Record<CardEra, FoilPlate>> = {
	'1950s': 'hammered', '1960s': 'brushed', '1970s': 'sunburst', '1980s': 'weld',
	'1990s': 'spun', '2000s': 'damascus', '2010s': 'carbon', '2020s': 'knurl'
};

/** How an era's plate is cut: its scale (above 1 is finer), tone strength, and stain coverage from 0 to 1. */
export interface PlateTuning { scale: number; tone: number; stain: number }

const PLATE_TUNING: PlateTuning = { scale: 1, tone: 1, stain: 0.6 };
/**
 * Each era's plate tuning. Carbon's weave is cut fine so it reads on narrow foil; the sunburst, the weld beads and
 * Damascus's layers are cut broad, and the weld's heat tint and Damascus's dark layers run strong.
 */
export const ERA_PLATE_TUNING: Readonly<Record<CardEra, PlateTuning>> = {
	'1950s': PLATE_TUNING, '1960s': PLATE_TUNING, '1970s': { ...PLATE_TUNING, scale: 0.65 }, '1980s': { scale: 0.75, tone: 3, stain: 1 },
	'1990s': { scale: 1, tone: 2, stain: 1 }, '2000s': { scale: 0.45, tone: 1.25, stain: 0.52 },
	'2010s': { ...PLATE_TUNING, scale: 2 }, '2020s': PLATE_TUNING
};

/**
 * GLSL for the plates, in card units (the card is 5 by 7). Needs `hash2`, `noise`, the `footprint` global and the
 * `plateScale`, `plateTone` and `plateStain` globals (the card's own tuning times the scene's), and
 * defines `plateShade` and `foilSlope`, which returns the plate's slope scaled to its feature size and faded out once the
 * feature shrinks to a few pixels, where it would only alias.
 */
export const FOIL_PLATE_GLSL = `
// Damascus: pattern-welded steel. Many thin folded layers sweep through broad swirls, each line jittering
// where the hammer moved it, and the layers bunch into tight bright groups between darker runs.
float damascus(vec2 p) {
	vec2 swirl = vec2(noise(p * 0.6), noise(p * 0.6 + 5.2));
	vec2 q = p + (swirl - 0.5) * 2.4;
	float flow = noise(q * 0.9) * 2.2 + noise(q * 2.2 + 3.0) * 0.8;
	float jitter = noise(p * vec2(30.0, 12.0)) * 0.035 + noise(p * 70.0) * 0.012;
	float layers = 0.5 + 0.5 * sin((q.y * 0.6 + q.x * 0.35 + flow + jitter) * 6.28318 * 16.0);
	float bunch = smoothstep(0.3, 0.7, noise(q * 1.6 + 2.0));
	return pow(layers, mix(3.0, 1.2, bunch));
}

// Stain: heat-tint patina, the CS "Stained" look. Many small oxide spots scatter over the steel, each with its
// own size, ragged edge and temper colour; plateStain sets how many there are. Returns coverage and the spot's heat.
vec2 stainSpots(vec2 p) {
	float cover = 0.0;
	float heat = 0.0;
	// Two scatters: larger spots, and from about half coverage up a second, finer one that fills between them.
	for (int layer = 0; layer < 2; layer++) {
		float density = layer == 0 ? 4.0 : 9.0;
		float chance = layer == 0 ? plateStain * 1.15 : plateStain * 1.6 - 0.5;
		vec2 q = p * density + float(layer) * 17.3;
		vec2 cell = floor(q);
		for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
			vec2 c = cell + vec2(float(i), float(j));
			if (hash(c + 41.0) > chance) continue;
			// Spots grow with coverage, so a heavy stain merges into a mottled crust.
			float radius = min((0.1 + 0.4 * hash(c + 7.0) * hash(c + 13.0)) * mix(0.8, 1.6, plateStain), 0.7);
			float d = length(q - c - hash2(c + 3.0)) / radius + (noise(q * 3.0 + c * 1.7) - 0.5) * 0.7;
			float spot = smoothstep(1.0, 0.7, d);
			if (spot > cover) heat = hash(c + 19.0);
			cover = max(cover, spot);
		}
	}
	return vec2(cover, heat);
}

/** A temper colour by how hot the steel ran, 0 to 1: straw, bronze, purple, then blue. */
vec3 temperTint(float heat) {
	float t = heat * 3.0;
	vec3 straw = vec3(0.95, 0.74, 0.34);
	vec3 bronze = vec3(0.68, 0.38, 0.18);
	vec3 purple = vec3(0.45, 0.24, 0.6);
	vec3 blue = vec3(0.22, 0.42, 0.88);
	vec3 tint = t < 1.0 ? mix(straw, bronze, t) : t < 2.0 ? mix(bronze, purple, t - 1.0) : mix(purple, blue, t - 2.0);
	// Oxide is a muted film, not paint: keep a little of its hue over a smoky brown-grey.
	float level = dot(tint, vec3(0.3, 0.55, 0.15));
	return mix(vec3(level) * vec3(1.05, 0.98, 0.9), tint, 0.4);
}

// Carbon fibre: a 2x2 twill of tows, each rounded across its width and running across or down. The tows
// running across are black fibre and those running down are the foil, so the metal weaves through black.
// Returns height, whether the tow is black, and how near its edge the point sits.
vec3 carbonWeave(vec2 p) {
	vec2 q = p * 9.0;
	bool across = mod(floor(q.x) - floor(q.y), 4.0) < 2.0;
	float t = fract(across ? q.y : q.x);
	float tow = sin(t * 3.14159);
	float fibre = 0.5 + 0.5 * sin((across ? q.y : q.x) * 40.0);
	return vec3(tow * 0.85 + fibre * 0.15, across ? 1.0 : 0.0, 1.0 - tow);
}

/** How a plate changes the metal: x darkens it (Damascus's dark layers, carbon's black tows), y tints it with temper colour. Scaled by plateTone. */
// Weld: columns of TIG beads run down the plate, close together. Each bead is a dome of stacked crescent ripples, like overlapping
// coins, and the steel either side carries bands of heat tint. Returns the bead's height and how near the heat
// zone a point sits (1 on the bead's edge, 0 clear of it).
vec2 weldBead(vec2 p) {
	p = p.yx;
	float row = floor(p.y / 0.45);
	float centre = (row + 0.5) * 0.45 + sin(p.x * 1.3 + row * 2.1) * 0.03;
	float across = (p.y - centre) / 0.16;
	float dome = sqrt(max(1.0 - across * across, 0.0));
	float ripple = fract((p.x + row * 0.37) / 0.075 + across * across * 1.2);
	float height = dome * (0.7 + 0.3 * smoothstep(0.0, 0.75, ripple) * (1.0 - smoothstep(0.85, 1.0, ripple)));
	float heat = abs(across) > 1.0 ? smoothstep(1.4, 1.0, abs(across)) : 0.0;
	return vec2(height, heat);
}

/** The colour a plate's tone tints toward: a stain spot's temper colour, or the temper bands beside a weld. */
vec3 plateTint(vec2 p, int plate) {
	p *= plateScale;
	if (plate == 11) return temperTint(1.0 - weldBead(p).y);
	return temperTint(stainSpots(p).y);
}

vec2 plateShade(vec2 p, int plate) {
	p *= plateScale;
	if (plate == 9) {
		// Thinner than a few pixels the layers would alias, so they settle to an even grey instead.
		float resolved = smoothstep(1.5, 3.5, 0.0625 / (footprint * plateScale));
		return vec2(1.0 - smoothstep(0.2, 0.7, mix(0.4, damascus(p), resolved)), 0.0) * plateTone;
	}
	if (plate == 7) {
		vec3 weave = carbonWeave(p);
		return vec2(min(weave.y * 0.85 + weave.z * weave.z * 0.6, 1.0), 0.0) * plateTone;
	}
	if (plate == 10) return vec2(0.0, stainSpots(p).x) * plateTone;
	if (plate == 11) return vec2(0.0, weldBead(p).y * 0.8) * plateTone;
	return vec2(0.0);
}

float plateHeight(vec2 p, int plate) {
	if (plate == 1) {
		// Hammered: overlapping round dents, deepest at their centres.
		vec2 q = p * 5.0;
		vec2 cell = floor(q);
		float nearest = 2.0;
		for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
			vec2 c = cell + vec2(float(i), float(j));
			nearest = min(nearest, length(q - c - hash2(c)));
		}
		return min(nearest, 0.8);
	}
	if (plate == 2) {
		// Guilloche: two families of engraved waves crossing, the banknote lathe pattern.
		float a = (p.y + 0.11 * sin(p.x * 3.1)) * 7.0;
		float b = (p.y - 0.11 * sin(p.x * 3.1 + 1.2)) * 7.0;
		return pow(0.5 + 0.5 * cos(6.28318 * a), 6.0) + pow(0.5 + 0.5 * cos(6.28318 * b), 6.0);
	}
	if (plate == 3) {
		// Sunburst: rays fanning up from below the bottom of the card.
		vec2 d = p - vec2(2.5, 8.5);
		return pow(0.5 + 0.5 * cos(atan(d.y, d.x) * 120.0), 3.0);
	}
	if (plate == 4) {
		// Diamond plate: raised lozenges on a grid, alternating their slant like tread plate.
		vec2 q = p / 0.24;
		vec2 cell = floor(q);
		vec2 l = fract(q) - 0.5;
		float turn = mod(cell.x + cell.y, 2.0) < 0.5 ? 1.0 : -1.0;
		vec2 r = vec2(l.x + turn * l.y, l.y - turn * l.x) * 0.7071;
		// Domed, so each lozenge's whole face turns the light, not just its edge.
		return sqrt(max(1.0 - abs(r.x) / 0.4 - abs(r.y) / 0.12, 0.0));
	}
	if (plate == 5) {
		// Pinstripe: fine laser-etched diagonals.
		return pow(0.5 + 0.5 * cos(6.28318 * (p.x * 0.6 + p.y) * 8.0), 6.0);
	}
	if (plate == 6) {
		// Spun: concentric lathe rings around the card's centre, with a little chatter.
		vec2 d = p - vec2(2.5, 3.5);
		float r = length(d);
		return 0.5 + 0.5 * sin(r * 50.0 + sin(atan(d.y, d.x) * 7.0 + r * 9.0) * 0.35);
	}
	if (plate == 7) return carbonWeave(p).x;
	if (plate == 8) {
		// Knurl: two crossing families of grooves leave a field of little pyramids.
		vec2 q = vec2(p.x + p.y, p.x - p.y) * 8.0;
		vec2 f = abs(fract(q) - 0.5);
		return min(f.x, f.y) * 2.0;
	}
	if (plate == 9) return damascus(p) * 0.08;
	// Patina is a film, not a texture: it leaves the steel flat.
	if (plate == 10) return 0.0;
	if (plate == 11) return weldBead(p).x;
	return 0.0;
}

float plateFeature(int plate) {
	return plate == 1 ? 0.2 : plate == 2 ? 0.14 : plate == 3 ? 0.12 : plate == 4 ? 0.12 : plate == 5 ? 0.11 : plate == 6 ? 0.12 : plate == 7 ? 0.11 : plate == 8 ? 0.088 : plate == 9 ? 0.0625 : plate == 10 ? 0.2 : 0.075;
}

vec2 foilSlope(vec2 p, int plate) {
	p *= plateScale;
	float feature = plateFeature(plate);
	float e = feature * 0.08;
	float h = plateHeight(p, plate);
	// Diamond plate's lozenges stand proud of the sheet, so they press deeper than the engraved patterns.
	float gain = plate == 4 ? 0.9 : 0.35;
	vec2 slope = vec2(plateHeight(p + vec2(e, 0.0), plate) - h, plateHeight(p + vec2(0.0, e), plate) - h) / e * feature * gain;
	return slope * smoothstep(2.5, 6.0, feature / (footprint * plateScale));
}
`;
