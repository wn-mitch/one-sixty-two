<script lang="ts">
	import { untrack } from 'svelte';
	import { createDialKitController } from 'dialkit/svelte';
	import { tilt } from '#lib/cards/motion.ts';
	import { CardLight, LightEngine, lightCanvas } from '#lib/cards/surface/card-light.ts';
	import { DEFAULT_LIGHT } from '#lib/cards/surface/light-renderer.ts';
	import { FILM_FINISHES, FILMS, PALETTES } from '#lib/cards/surface/holo-films.ts';
	import { PLATES } from '#lib/cards/surface/foil-plates.ts';
	import { filmDials, type Dial } from '#lib/cards/surface/films/film.ts';
	import { plateDials } from '#lib/cards/surface/plates/plate.ts';
	import type { Finish } from '#lib/cards/finish.ts';
	import { finishName } from '#lib/cosmetics/catalogue.ts';
	import StoryFrame from './StoryFrame.svelte';

	/**
	 * One film, finish or plate on blank cards, with a dial for each of its settings and the remix controls:
	 * any finish, colourway or plate under a film, and any film over a finish.
	 */
	const props: { kind: 'film' | 'finish' | 'plate'; name: string } = $props();
	// A story mounts one module for its lifetime.
	const { kind, name } = untrack(() => ({ kind: props.kind, name: props.name }));

	type Range = [number, number, number, number];
	const select = <T extends string>(options: readonly T[], value: T) => ({ type: 'select' as const, options: [...options], default: value });
	const ranges = (dials: Record<string, Dial>) => Object.fromEntries(Object.entries(dials).map(([key, dial]) => [key, [dial.value, dial.min, dial.max, dial.step ?? 0.01] as Range]));

	const module = (kind === 'film' ? FILMS.find(film => film.name === name)
		: kind === 'finish' ? FILM_FINISHES.find(finish => finish.name === name)
		: PLATES.find(plate => plate.name === name));
	if (!module) throw new Error(`No ${kind} named ${name}.`);
	const own: Record<string, Dial> = kind === 'film' ? filmDials(module as (typeof FILMS)[number])
		: kind === 'plate' ? plateDials(module as (typeof PLATES)[number])
		: (module as (typeof FILM_FINISHES)[number]).params;
	const ownKeys = Object.keys(own);
	const index = kind === 'film' ? FILMS.indexOf(module as (typeof FILMS)[number])
		: kind === 'finish' ? FILM_FINISHES.indexOf(module as (typeof FILM_FINISHES)[number])
		: PLATES.indexOf(module as (typeof PLATES)[number]);

	const KEEP = 'as designed';
	const filmNames = FILMS.map(film => film.name);
	const finishNames = FILM_FINISHES.map(finish => finish.name);
	const paletteNames = PALETTES.map(palette => palette.name);
	const plateNames = PLATES.map(plate => plate.name);

	const dials = createDialKitController(`${kind}: ${name}`, untrack(() => ({
		[name]: ranges(own),
		remix: {
			// A finish is seen through a film; a film or plate keeps its own finish unless swapped.
			film: select(kind === 'finish' ? filmNames : [KEEP], kind === 'finish' ? 'refractor' : KEEP),
			finish: select([KEEP, ...finishNames], kind === 'finish' ? name : KEEP),
			palette: select([KEEP, ...paletteNames], KEEP),
			plate: select(['none', ...plateNames], kind === 'plate' ? name : 'none'),
			// A second film under the first, showing through its ground.
			under: select([KEEP, 'none', ...filmNames], KEEP),
			underMix: [1, 0, 1, 0.01] as Range,
			plateUnderFilm: [0.6, 0, 1, 0.01] as Range,
			vivid: [1, 0, 3, 0.05] as Range
		},
		light: {
			holoScale: [DEFAULT_LIGHT.holoScale, 3, 40, 0.5] as Range,
			plateDepth: [DEFAULT_LIGHT.plateDepth, 0, 3, 0.05] as Range,
			plateTone: [DEFAULT_LIGHT.plateTone, 0, 3, 0.05] as Range,
			stain: [DEFAULT_LIGHT.stain, 0, 2, 0.05] as Range,
			shift: [DEFAULT_LIGHT.shift, 0, 10, 0.25] as Range,
			shine: [DEFAULT_LIGHT.shine, 0, 3, 0.05] as Range,
			glare: [DEFAULT_LIGHT.glare, 0, 0.6, 0.01] as Range
		},
		layout: { width: [360, 160, 640, 1] as Range, drift: true }
	}) as Parameters<typeof createDialKitController>[1]));
	const values = $derived(dials.values as Record<string, Record<string, number | string | boolean>>);
	const remix = $derived(values.remix as { film: string; finish: string; palette: string; plate: string; under: string; underMix: number; plateUnderFilm: number; vivid: number });
	const layout = $derived(values.layout as { width: number; drift: boolean });

	/** Gem shows a film; plates show on silver and gold foil, and under a film when one is pressed over them. */
	const faces: { finish: Finish; label: string }[] = untrack(() => kind === 'plate'
		? [{ finish: 'foil', label: 'Silver' }, { finish: 'emboss', label: 'Gold' }, { finish: 'gem', label: 'Under refractor film' }]
		: [{ finish: 'gem', label: kind === 'film' ? 'Film' : 'Finish' }]);
	const cards = faces.map(card => ({ ...card, light: new CardLight() }));

	$effect(() => {
		const tuned = { index, values: ownKeys.map(key => Number(values[name]![key])) };
		const options = {
			...DEFAULT_LIGHT,
			...(values.light as Record<string, number>),
			holoPattern: kind === 'film' ? index : kind === 'finish' ? filmNames.indexOf(remix.film) : 0,
			filmTune: kind === 'film' ? tuned : null,
			finishTune: kind === 'finish' ? tuned : null,
			plateTune: kind === 'plate' ? tuned : null,
			finish: remix.finish === KEEP ? -1 : finishNames.indexOf(remix.finish),
			palette: remix.palette === KEEP ? -1 : paletteNames.indexOf(remix.palette),
			foilPlate: remix.plate === 'none' ? 0 : plateNames.indexOf(remix.plate),
			plateUnderFilm: remix.plateUnderFilm,
			underFilm: remix.under === KEEP ? -1 : remix.under === 'none' ? -2 : filmNames.indexOf(remix.under),
			underMix: remix.underMix
		};
		const timer = setTimeout(() => untrack(() => LightEngine.shared()?.configure(options)), 60);
		return () => clearTimeout(timer);
	});
	let instance = $state(0);
</script>

<StoryFrame wide onReset={() => instance++} fixtureNotice="Every dial on this page drives only this module; every other card keeps its shipped look.">
	{#if !LightEngine.shared()}
		<p role="alert">This browser cannot run the card light, so the finish cannot be shown.</p>
	{:else}
		{#key instance}
			<div class="lab" style={`--card-width:${Math.round(layout.width)}px`}>
				{#each cards as card (card.label)}
					<figure>
						<div
							class="card"
							data-card="2020s"
							data-finish={card.finish}
							data-identity={`${name}-${card.label}`}
							data-plate-tuning={`1,1,0.6,${remix.vivid}`}
							use:tilt={{ enabled: true, idle: layout.drift, finish: card.finish === 'foil' ? 'silver' : card.finish === 'emboss' ? 'gold' : 'gem', light: card.light, identity: `${name}-${card.label}` }}
						>
							<div class="face" data-surface="ring" data-surface-shape="box"></div>
							<canvas class="light" aria-hidden="true" use:lightCanvas={card.light}></canvas>
						</div>
						<figcaption><b>{finishName({ name })}</b><span>{card.label}</span></figcaption>
					</figure>
				{/each}
			</div>
		{/key}
	{/if}
</StoryFrame>

<style>
	.lab { display: flex; flex-wrap: wrap; gap: var(--space-5); }
	figure { margin: 0; width: var(--card-width); }
	.card { container-type: inline-size; position: relative; width: 100%; aspect-ratio: 5 / 7; isolation: isolate; border-radius: 1.8cqw; background: #15171c; box-shadow: 0 1cqw 3cqw rgb(0 0 0 / 0.45); }
	.face { position: absolute; inset: 0; border-radius: 1.8cqw; }
	.light { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 1.8cqw; pointer-events: none; opacity: 0; transition: opacity 240ms ease-out; }
	.light:global([data-presented]) { opacity: 1; }
	figcaption { display: flex; justify-content: space-between; margin-top: var(--space-2); color: var(--muted); }
	figcaption b { color: var(--text, inherit); }
</style>
