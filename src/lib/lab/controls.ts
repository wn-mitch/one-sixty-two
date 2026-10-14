import type { Finish } from '#lib/cards/finish.ts';
import { CARD_ERAS, type CardEra } from '#lib/cards/era.ts';
import { filmDials, type Dial } from '#lib/cards/surface/films/film.ts';
import { plateDials, type Plate } from '#lib/cards/surface/plates/plate.ts';
import { ERA_HOLO, FILM_FINISHES, FILMS, PALETTES } from '#lib/cards/surface/holo-films.ts';
import { ERA_FOIL, ERA_PLATE_TUNING, PLATES } from '#lib/cards/surface/foil-plates.ts';
import { DEFAULT_LIGHT } from '#lib/cards/surface/light-renderer.ts';
import { STOCKS, type Stock } from '#lib/cards/surface/surfaces.ts';

/**
 * What the foil lab can change and what each choice applies to. A setup is one plain `Setup`; every control
 * is named by a `Target` so any of them can be staggered across several cards side by side.
 */

/** What the card prints: a fully foiled sheet, a foil frame round bare stock, or a real era front. */
export type Print = 'sheet' | 'window' | 'front';
/** What stands proud of a foil sheet: nothing, a rim inside its edge, or that rim and a star in the middle. */
export type Relief = 'flat' | 'rim' | 'star';
export type ModuleKind = 'film' | 'finish' | 'plate';

export interface Setup {
	print: Print;
	/** Raised parts of a foil sheet; only the sheet print has them. */
	relief: Relief;
	tier: Finish;
	era: CardEra;
	film: string;
	/** Empty keeps the film's own finish, colourway or stock. */
	finish: string;
	palette: string;
	/** Empty keeps the film's own under film; `none` prints none. */
	under: string;
	plate: string;
	stock: string;
	/** Dial values that differ from shipped, by `kind:name`. */
	tuned: Record<string, Record<string, number>>;
	light: Record<string, number>;
	drift: boolean;
}

export const filmNames = FILMS.map(film => film.name);
export const finishNames = FILM_FINISHES.map(finish => finish.name);
export const paletteNames = PALETTES.map(palette => palette.name);
export const plateNames = PLATES.map(plate => plate.name);
export const stockNames = Object.keys(STOCKS) as Stock[];

/** The tiers by what they look like. */
export const TIERS: readonly { value: Finish; label: string }[] = [
	{ value: 'base', label: 'Base' },
	{ value: 'foil', label: 'Silver' },
	{ value: 'emboss', label: 'Gold' },
	{ value: 'gem', label: 'Holo' }
];
export const PRINTS: readonly { value: Print; label: string }[] = [
	{ value: 'sheet', label: 'Foil sheet' },
	{ value: 'window', label: 'Foil frame' },
	{ value: 'front', label: 'Era front' }
];
export const RELIEFS: readonly { value: Relief; label: string }[] = [
	{ value: 'flat', label: 'Flat' },
	{ value: 'rim', label: 'Raised rim' },
	{ value: 'star', label: 'Rim and star' }
];

/** The scene dials the lab exposes, with their ranges. */
export const LIGHT_DIALS: Record<string, Dial> = {
	holoScale: { value: DEFAULT_LIGHT.holoScale, min: 2, max: 40, step: 0.5, note: 'Base size of every film pattern.' },
	vivid: { value: 1, min: 0, max: 3, step: 0.05, note: 'Saturates the film and sinks its ground.' },
	underMix: { value: 1, min: 0, max: 1, step: 0.05, note: 'How strongly the under film shows through the ground.' },
	plateUnderFilm: { value: 0, min: 0, max: 1, step: 0.05, note: 'Presses the plate through the holo film too.' },
	plateDepth: { value: DEFAULT_LIGHT.plateDepth, min: 0, max: 3, step: 0.05, note: 'How deep the plate presses.' },
	plateTone: { value: DEFAULT_LIGHT.plateTone, min: 0, max: 3, step: 0.05, note: 'Dark layers and tints in the metal.' },
	stain: { value: 0.6, min: 0, max: 1, step: 0.05, note: 'Stain coverage.' },
	shift: { value: DEFAULT_LIGHT.shift, min: 0, max: 12, step: 0.25, note: 'How far a tilt moves the reflections.' },
	shine: { value: DEFAULT_LIGHT.shine, min: 0, max: 4, step: 0.05, note: 'Highlight strength.' },
	glare: { value: DEFAULT_LIGHT.glare, min: 0, max: 0.8, step: 0.01, note: 'Soft glare across the card.' },
	// The card's lift already lights it a little; this sets the least spotlight it shows.
	spotlight: { value: 0, min: 0, max: 1, step: 0.01, note: 'A spotlight over the card instead of even light.' }
};

export function dialsOf(kind: ModuleKind, name: string): Record<string, Dial> {
	if (kind === 'film') return filmDials(FILMS.find(film => film.name === name) ?? FILMS[0]);
	if (kind === 'plate') return plateDials(PLATES.find(plate => plate.name === name) ?? PLATES[0]);
	return (FILM_FINISHES.find(finish => finish.name === name) ?? FILM_FINISHES[0]).params;
}

export const ownFinish = (film: string) => FILMS.find(entry => entry.name === film)?.finish ?? 'smooth';
export const ownPalette = (film: string) => FILMS.find(entry => entry.name === film)?.palette ?? 'rainbow';
export const finishInUse = (setup: Setup) => setup.finish || ownFinish(setup.film);
export const ownUnder = (film: string) => FILMS.find(entry => entry.name === film)?.under ?? '';
/** The under film actually printed, or empty for none. */
export const underInUse = (setup: Setup) => setup.under === 'none' ? '' : setup.under || ownUnder(setup.film);

const plateSource = (plate: Plate) => [plate.height, plate.shade, plate.tint, plate.helpers].filter(Boolean).join('\n');
/** Plates whose metal changes tone (Damascus layers, carbon tows, weld temper, stains). */
const TONED = new Set<string>(PLATES.filter(plate => plate.shade || plate.tint).map(plate => plate.name));
/** Plates that read the stain coverage. */
const STAINED = new Set<string>(PLATES.filter(plate => /\bplateStain\b/.test(plateSource(plate))).map(plate => plate.name));

/**
 * A control the lab can show or stagger: a choice (`film`, `plate`, …) or a dial, named `film:<dial>`,
 * `finish:<dial>`, `plate:<dial>` or `light:<dial>`.
 */
export type Target = string;
export const CHOICES = ['print', 'relief', 'tier', 'era', 'stock', 'film', 'finish', 'palette', 'under', 'plate'] as const;
export type ChoiceKey = (typeof CHOICES)[number];

/** Every option a choice offers; `''` is the film's own, the era's own or none. */
export function optionsOf(key: ChoiceKey): { value: string; label: string }[] {
	const plain = (names: readonly string[]) => names.map(name => ({ value: name, label: name }));
	switch (key) {
		case 'print': return [...PRINTS];
		case 'relief': return [...RELIEFS];
		case 'tier': return [...TIERS];
		case 'era': return plain(CARD_ERAS);
		case 'stock': return [{ value: '', label: "era's own" }, ...plain(stockNames)];
		case 'film': return plain(filmNames);
		case 'finish': return [{ value: '', label: "film's own" }, ...plain(finishNames)];
		case 'palette': return [{ value: '', label: "film's own" }, ...plain(paletteNames)];
		case 'under': return [{ value: '', label: "film's own" }, { value: 'none', label: 'none' }, ...plain(filmNames)];
		case 'plate': return plain(plateNames);
	}
}

/** Whether a control changes anything on this setup, so the lab only shows the ones that do. */
export function applies(target: Target, setup: Setup): boolean {
	const holo = setup.tier === 'gem';
	const foiled = setup.tier !== 'base';
	const plated = (setup.tier === 'foil' || setup.tier === 'emboss') || (holo && (setup.light.plateUnderFilm ?? LIGHT_DIALS.plateUnderFilm!.value) > 0);
	const [group, dial] = target.split(':');
	switch (group) {
		case 'film': case 'finish': case 'palette': case 'under': return holo;
		case 'plate': return plated;
		case 'stock': return setup.print !== 'sheet' || !foiled;
		case 'relief': return setup.print === 'sheet' && foiled;
		case 'light':
			switch (dial) {
				case 'holoScale': case 'vivid': case 'plateUnderFilm': return holo;
				case 'underMix': return holo && underInUse(setup) !== '';
				case 'plateDepth': return plated;
				case 'plateTone': return plated && TONED.has(setup.plate);
				case 'stain': return plated && STAINED.has(setup.plate);
				// Era fronts light through the card's own light, which the lab does not reach.
				case 'spotlight': return foiled && setup.print !== 'front';
				default: return foiled;
			}
		default: return true;
	}
}

/** `count` values spread across a dial's range, on its step, always including its shipped value. */
export function spread(dial: Dial, count: number): number[] {
	const step = dial.step ?? 0.01;
	const snap = (value: number) => Number((Math.round(value / step) * step).toFixed(6));
	const values = Array.from({ length: count }, (_, index) => snap(dial.min + (dial.max - dial.min) * index / Math.max(count - 1, 1)));
	if (!values.includes(dial.value)) {
		let nearest = 0;
		values.forEach((value, index) => { if (Math.abs(value - dial.value) < Math.abs(values[nearest]! - dial.value)) nearest = index; });
		values[nearest] = dial.value;
	}
	return [...new Set(values)];
}

/** The dial a target names on this setup, or undefined for a choice. */
export function dialOf(target: Target, setup: Setup): Dial | undefined {
	const [group, dial] = target.split(':');
	if (!dial) return undefined;
	if (group === 'light') return LIGHT_DIALS[dial];
	const name = group === 'film' ? setup.film : group === 'finish' ? finishInUse(setup) : setup.plate;
	return dialsOf(group as ModuleKind, name)[dial];
}

export function valueOf(target: Target, setup: Setup): string | number {
	const [group, dial] = target.split(':');
	if (!dial) return setup[group as ChoiceKey];
	if (group === 'light') return setup.light[dial] ?? LIGHT_DIALS[dial]!.value;
	const name = group === 'film' ? setup.film : group === 'finish' ? finishInUse(setup) : setup.plate;
	return setup.tuned[`${group}:${name}`]?.[dial] ?? dialsOf(group as ModuleKind, name)[dial]!.value;
}

/** A copy of the setup with one control changed. */
export function withValue(setup: Setup, target: Target, value: string | number): Setup {
	const [group, dial] = target.split(':');
	if (!dial) return { ...setup, [group!]: value };
	if (group === 'light') return { ...setup, light: { ...setup.light, [dial]: Number(value) } };
	const name = group === 'film' ? setup.film : group === 'finish' ? finishInUse(setup) : setup.plate;
	const key = `${group}:${name}`;
	return { ...setup, tuned: { ...setup.tuned, [key]: { ...setup.tuned[key], [dial]: Number(value) } } };
}

/** An era's shipped look: its film, plate, plate tuning and stock. */
export function eraPreset(setup: Setup, era: CardEra): Setup {
	const tuning = ERA_PLATE_TUNING[era];
	const plate = ERA_FOIL[era];
	const tuned = { ...setup.tuned };
	delete tuned[`plate:${plate}`];
	if (tuning.scale !== 1) tuned[`plate:${plate}`] = { scale: tuning.scale };
	return {
		...setup, era, film: ERA_HOLO[era], finish: '', palette: '', under: '', plate, stock: '', tuned,
		light: { ...setup.light, plateTone: tuning.tone, stain: tuning.stain, vivid: tuning.vivid ?? 1 }
	};
}

export const START: Setup = {
	print: 'sheet', relief: 'flat', tier: 'gem', era: '2020s', film: 'galaxy', finish: '', palette: '', under: '', plate: 'brushed', stock: '',
	tuned: {}, light: {}, drift: true
};

/** Restores a setup from a link, keeping only what this version of the lab still has. */
export function parseSetup(saved: Partial<Setup>): Setup {
	const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => options.includes(value as T) ? value as T : fallback;
	return {
		print: pick(saved.print, PRINTS.map(entry => entry.value), START.print),
		relief: pick(saved.relief, RELIEFS.map(entry => entry.value), START.relief),
		tier: pick(saved.tier, TIERS.map(entry => entry.value), START.tier),
		era: pick(saved.era, CARD_ERAS, START.era),
		film: pick(saved.film, filmNames, START.film),
		finish: pick(saved.finish, ['', ...finishNames], ''),
		palette: pick(saved.palette, ['', ...paletteNames], ''),
		under: pick(saved.under, ['', 'none', ...filmNames], ''),
		plate: pick(saved.plate, plateNames, START.plate),
		stock: pick(saved.stock, ['', ...stockNames], ''),
		tuned: numberTables(saved.tuned),
		light: numbers(saved.light),
		drift: typeof saved.drift === 'boolean' ? saved.drift : START.drift
	};
}

/** The finite numbers of a saved table, so a hand-edited or older link cannot feed the shader text or NaN. */
function numbers(value: unknown): Record<string, number> {
	if (!value || typeof value !== 'object') return {};
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === 'number' && Number.isFinite(entry)));
}

function numberTables(value: unknown): Record<string, Record<string, number>> {
	if (!value || typeof value !== 'object') return {};
	return Object.fromEntries(Object.entries(value).map(([key, table]) => [key, numbers(table)]));
}
