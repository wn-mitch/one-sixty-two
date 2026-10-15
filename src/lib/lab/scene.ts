import type { Finish } from '#lib/cards/finish.ts';
import type { CardEra } from '#lib/cards/era.ts';
import type { FoilPlate, PlateTuning } from '#lib/cards/surface/foil-plates.ts';
import type { HoloPattern } from '#lib/cards/surface/holo-films.ts';
import { DEFAULT_LIGHT, type LightOptions } from '#lib/cards/surface/light-renderer.ts';
import type { SurfaceMapOptions } from '#lib/cards/surface/surface-map.ts';
import { stockFor, STOCKS, type Stock } from '#lib/cards/surface/surfaces.ts';
import {
	applies, dialsOf, filmNames, finishInUse, finishNames, LIGHT_DIALS, optionsOf, ownPalette, paletteNames,
	plateNames, stockNames, underInUse, valueOf,
	type ChoiceKey, type ModuleKind, type Print, type Setup, type Target
} from './controls.ts';

export interface ReferenceRow {
	label: string;
	value: string;
}

export interface ReferenceGroup {
	title: string;
	rows: readonly ReferenceRow[];
}

const titleOf = (target: string): string => {
	const name = target.split(':').at(-1) ?? target;
	return name.replace(/([A-Z])/g, ' $1').toLowerCase();
};

const numberOf = (value: number): string => {
	const rounded = Number(value.toFixed(6));
	return String(rounded);
};

const optionLabel = (target: ChoiceKey, value: string): string => {
	const option = optionsOf(target).find(entry => entry.value === value);
	return option?.label ?? value;
};

const effectiveChoice = (setup: Setup, target: ChoiceKey): string => {
	switch (target) {
		case 'finish': return finishInUse(setup);
		case 'palette': return setup.palette || ownPalette(setup.film);
		case 'under': return underInUse(setup) || 'none';
		case 'stock': {
			if (setup.stock) return setup.stock;
			const stock = stockFor(setup.era);
			return stockNames.find(name => STOCKS[name]!.gloss === stock.gloss) ?? 'chrome';
		}
		default: return String(valueOf(target, setup));
	}
};

function referenceRows(setup: Setup, targets: readonly Target[]): ReferenceRow[] {
	return targets.flatMap(target => {
		if (!applies(target, setup)) return [];
		const [group, dial] = target.split(':');
		if (!dial) {
			const key = group as ChoiceKey;
			const value = effectiveChoice(setup, key);
			return [{ label: titleOf(target), value: optionLabel(key, value) }];
		}
		const value = valueOf(target, setup);
		return typeof value === 'number' && Number.isFinite(value)
			? [{ label: titleOf(target), value: numberOf(value) }]
			: [];
	});
}

function referenceOf(setup: Setup): readonly ReferenceGroup[] {
	const moduleTargets = (kind: ModuleKind, name: string): Target[] =>
		Object.keys(dialsOf(kind, name)).map(dial => `${kind}:${dial}`);
	const groups: ReferenceGroup[] = [
		{
			title: 'Options',
			rows: referenceRows(setup, ['print', 'relief', 'tier', 'era', 'stock'])
		},
		{
			title: 'Film',
			rows: referenceRows(setup, ['film', 'palette', 'under', ...moduleTargets('film', setup.film)])
		},
		{
			title: 'Finish',
			rows: referenceRows(setup, ['finish', ...moduleTargets('finish', finishInUse(setup))])
		},
		{
			title: 'Plate',
			rows: referenceRows(setup, ['plate', ...moduleTargets('plate', setup.plate)])
		},
		{
			title: 'Light',
			rows: referenceRows(setup, Object.keys(LIGHT_DIALS).map(dial => `light:${dial}`))
		}
	];
	return groups.filter(group => group.rows.length > 0);
}

/** What one lab card draws: its print and tier, and the light and map settings the engine gives it alone. */
export interface Scene {
	print: Print;
	tier: Finish;
	era: CardEra;
	film: HoloPattern;
	plate: FoilPlate;
	plateTuning: PlateTuning;
	light: LightOptions;
	map: SurfaceMapOptions;
	reference: readonly ReferenceGroup[];
}

export function sceneOf(setup: Setup): Scene {
	const light = (dial: string) => setup.light[dial] ?? LIGHT_DIALS[dial]!.value;
	const tune = (kind: ModuleKind, name: string, names: readonly string[]) => ({
		index: names.indexOf(name),
		values: Object.entries(dialsOf(kind, name)).map(([dial, range]) => setup.tuned[`${kind}:${name}`]?.[dial] ?? range.value)
	});
	const finish = finishInUse(setup);
	return {
		print: setup.print,
		tier: setup.tier,
		era: setup.era,
		film: setup.film as HoloPattern,
		plate: setup.plate as FoilPlate,
		// The lab's dials scale the plate directly, so the card's own tuning stays neutral apart from vividness.
		plateTuning: { scale: 1, tone: 1, stain: 1, vivid: light('vivid') },
		light: {
			...DEFAULT_LIGHT,
			holoScale: light('holoScale'),
			plateDepth: light('plateDepth'),
			plateTone: light('plateTone'),
			stain: light('stain'),
			shift: light('shift'),
			shine: light('shine'),
			glare: light('glare'),
			plateUnderFilm: light('plateUnderFilm'),
			underFilm: setup.under === 'none' ? -2 : setup.under ? filmNames.indexOf(setup.under) : -1,
			underMix: light('underMix'),
			holoPattern: filmNames.indexOf(setup.film),
			foilPlate: plateNames.indexOf(setup.plate),
			finish: setup.finish ? finishNames.indexOf(setup.finish) : -1,
			palette: setup.palette ? paletteNames.indexOf(setup.palette) : -1,
			customGradient: setup.palette === 'custom' ? setup.gradient : null,
			filmTune: tune('film', setup.film, filmNames),
			finishTune: tune('finish', finish, finishNames),
			plateTune: tune('plate', setup.plate, plateNames)
		},
		map: setup.stock ? { stock: setup.stock as Stock } : {},
		reference: referenceOf(setup)
	};
}
