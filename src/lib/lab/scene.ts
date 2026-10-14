import type { Finish } from '#lib/cards/finish.ts';
import type { CardEra } from '#lib/cards/era.ts';
import type { FoilPlate, PlateTuning } from '#lib/cards/surface/foil-plates.ts';
import type { HoloPattern } from '#lib/cards/surface/holo-films.ts';
import { DEFAULT_LIGHT, type LightOptions } from '#lib/cards/surface/light-renderer.ts';
import type { SurfaceMapOptions } from '#lib/cards/surface/surface-map.ts';
import type { Stock } from '#lib/cards/surface/surfaces.ts';
import {
	dialsOf, filmNames, finishInUse, finishNames, LIGHT_DIALS, paletteNames, plateNames,
	type ModuleKind, type Print, type Setup
} from './controls.ts';

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
			filmTune: tune('film', setup.film, filmNames),
			finishTune: tune('finish', finish, finishNames),
			plateTune: tune('plate', setup.plate, plateNames)
		},
		map: setup.stock ? { stock: setup.stock as Stock } : {}
	};
}
