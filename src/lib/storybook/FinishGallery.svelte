<script module lang="ts">
	import type { ReliefProfile as Profile, SurfaceTuning as Tuning } from '#lib/cards/surface/surfaces.ts';

	/** Starting values for the controls, so a link can carry a tuned look. */
	export type FinishGalleryProps = Partial<Tuning> & { nameProfile?: Profile; relief?: number; lightHeight?: number; ringWidth?: number; glare?: number; shine?: number; foil?: number; coat?: number; holoPattern?: HoloChoice; holoScale?: number; waves?: number; brush?: number; foilMode?: FoilMode; shift?: number; paper?: number; wash?: number; foilPlate?: FoilPlate | 'era'; plateDepth?: number; plateScale?: number; plateTone?: number; stain?: number; width?: number; drift?: boolean };
	import { HOLO_PATTERNS, type HoloPattern } from '#lib/cards/surface/light-renderer.ts';
	/** `era` lets each card's era pick its holo film. */
	export type HoloChoice = HoloPattern | 'era';
	export const HOLO_CHOICES: readonly HoloChoice[] = ['era', ...HOLO_PATTERNS];
	export type FoilMode = 'opaque' | 'colour-over' | 'contrast-keyed';
	export const FOIL_MODES: readonly FoilMode[] = ['opaque', 'colour-over', 'contrast-keyed'];
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { createDialKitController } from 'dialkit/svelte';
	import Card from '#lib/cards/Card.svelte';
	import { materialFor, type Finish } from '#lib/cards/finish.ts';
	import { LightEngine } from '#lib/cards/surface/card-light.ts';
	import { DEFAULT_LIGHT, ERA_HOLO } from '#lib/cards/surface/light-renderer.ts';
	import { ERA_FOIL, ERA_PLATE_TUNING, FOIL_PLATES, type FoilPlate } from '#lib/cards/surface/foil-plates.ts';
	import { DEFAULT_TUNING, RELIEF_PROFILES, STOCKS, type ReliefProfile, type Stock, type SurfaceTuning } from '#lib/cards/surface/surfaces.ts';
	import { createCardViewModel, type CardEra, type CardViewModel } from '#lib/cards/view-model.ts';
	import { loadDraftProfiles, loadManifest } from '#lib/game/data.ts';
	import { isHitter } from '#lib/components/candidate-ranking.ts';
	import { loadMedia } from '#lib/media/client.ts';
	import { loadRankings } from '#lib/rankings/client.ts';
	import StoryFrame from './StoryFrame.svelte';

	/** A headline season per era, so each row shows a real photo, team and stat line. */
	const SEASONS: { era: CardEra; seasonId: string }[] = [
		{ era: '1950s', seasonId: 'mantlmi01:1956:AL:NYA' },
		{ era: '1960s', seasonId: 'mayswi01:1965:NL:SFN' },
		{ era: '1970s', seasonId: 'benchjo01:1972:NL:CIN' },
		{ era: '1980s', seasonId: 'schmimi01:1980:NL:PHI' },
		{ era: '1990s', seasonId: 'griffke02:1997:AL:SEA' },
		{ era: '2000s', seasonId: 'bondsba01:2001:NL:SFN' },
		{ era: '2010s', seasonId: 'troutmi01:2016:AL:LAA' },
		{ era: '2020s', seasonId: 'judgeaa01:2022:AL:NYA' }
	];
	const finishes: { finish: Finish; label: string }[] = [
		{ finish: 'base', label: 'Base' },
		{ finish: 'foil', label: 'Foil' },
		{ finish: 'emboss', label: 'Foil + emboss' },
		{ finish: 'gem', label: 'Gem' }
	];
	let props: FinishGalleryProps = $props();
	// The gallery opens on the shipped look (surfaces.ts and light-renderer.ts), so what it shows is what the game draws.
	const start = untrack(() => ({
		...DEFAULT_TUNING,
		...DEFAULT_LIGHT,
		width: 417, drift: true, stock: 'era' as Stock | 'era', ringWidth: 1,
		holoPattern: (HOLO_PATTERNS[DEFAULT_LIGHT.holoPattern] ?? 'era') as HoloChoice,
		foilMode: FOIL_MODES[DEFAULT_LIGHT.foilMode],
		foilPlate: (FOIL_PLATES[DEFAULT_LIGHT.foilPlate] ?? 'era') as FoilPlate | 'era',
		nameProfile: 'pillow' as ReliefProfile,
		...props
	}));
	type Range = [number, number, number, number];
	const select = <T extends string>(options: readonly T[], value: T) => ({ type: 'select' as const, options: [...options], default: value });
	const dials = createDialKitController('Finish gallery', untrack(() => ({
		layout: { width: [start.width, 140, 420, 1] as Range, drift: start.drift },
		light: {
			relief: [start.relief, 1, 18, 0.5] as Range,
			lightHeight: [start.lightHeight, 0.6, 8, 0.1] as Range,
			glare: [start.glare, 0, 0.6, 0.01] as Range,
			shine: [start.shine, 0, 3, 0.05] as Range,
			coat: [start.coat, 0, 1, 0.05] as Range,
			inkDepth: [start.inkDepth, 0, 2, 0.05] as Range
		},
		stock: {
			stock: select(['era', ...Object.keys(STOCKS)] as (Stock | 'era')[], start.stock),
			paper: [start.paper, 0, 3, 0.05] as Range,
			wash: [start.wash, 0, 3, 0.05] as Range
		},
		foil: {
			foil: [start.foil, 0, 1, 0.05] as Range,
			foilMode: select(FOIL_MODES, start.foilMode),
			shift: [start.shift, 0, 10, 0.25] as Range,
			holoPattern: select(HOLO_CHOICES, start.holoPattern),
			holoScale: [start.holoScale, 3, 40, 0.5] as Range,
			waves: [start.waves, 0.5, 30, 0.5] as Range,
			brush: [start.brush, 0, 2, 0.05] as Range,
			foilPlate: select(['era', ...FOIL_PLATES] as (FoilPlate | 'era')[], start.foilPlate),
			plateDepth: [start.plateDepth, 0, 3, 0.05] as Range,
			plateScale: [start.plateScale, 0.25, 4, 0.05] as Range,
			plateTone: [start.plateTone, 0, 2, 0.05] as Range,
			stain: [start.stain, 0, 2, 0.05] as Range
		},
		edge: {
			ringWidth: [start.ringWidth, 0.5, 2.5, 0.05] as Range,
			ringHeight: [start.ringHeight, 0, 3, 0.1] as Range,
			ringMetal: [start.ringMetal, 0, 1, 0.05] as Range,
			gemRingMetal: [start.gemRingMetal, 0, 1, 0.05] as Range,
			ringHolo: [start.ringHolo, 0, 1, 0.05] as Range
		},
		name: {
			nameProfile: select(RELIEF_PROFILES, start.nameProfile),
			nameHeight: [start.nameHeight, 0.2, 2, 0.05] as Range,
			nameSoftness: [start.nameSoftness, 0, 3, 0.1] as Range
		},
		// Per-era picks, so each era's film and plate can be chosen on its own; the global selects above still override them all.
		eras: Object.fromEntries(SEASONS.map(({ era }) => [era, { holo: select(HOLO_PATTERNS, ERA_HOLO[era]), plate: select(FOIL_PLATES, ERA_FOIL[era]), scale: [ERA_PLATE_TUNING[era].scale, 0.25, 4, 0.05] as Range, tone: [ERA_PLATE_TUNING[era].tone, 0, 3, 0.05] as Range, stain: [ERA_PLATE_TUNING[era].stain, 0, 1, 0.01] as Range }])),
		mark: {
			markFoil: select(['off', 'foil', 'emboss', 'gem'] as const, start.markFoil),
			markMetal: [start.markMetal, 0, 1, 0.05] as Range
		}
	})));
	const values = $derived(dials.values);
	const tuning = $derived<SurfaceTuning>({
		markFoil: values.mark.markFoil as SurfaceTuning['markFoil'],
		markMetal: values.mark.markMetal,
		inkDepth: values.light.inkDepth,
		nameHeight: values.name.nameHeight,
		nameSoftness: values.name.nameSoftness,
		ringHeight: values.edge.ringHeight,
		ringMetal: values.edge.ringMetal,
		ringHolo: values.edge.ringHolo,
		gemRingMetal: values.edge.gemRingMetal
	});
	const nameProfile = $derived(values.name.nameProfile as ReliefProfile);
	const light = $derived({
		relief: values.light.relief,
		lightHeight: values.light.lightHeight,
		glare: values.light.glare,
		shine: values.light.shine,
		coat: values.light.coat,
		waves: values.foil.waves,
		brush: values.foil.brush,
		foilMode: FOIL_MODES.indexOf(values.foil.foilMode as FoilMode),
		shift: values.foil.shift,
		paper: values.stock.paper,
		wash: values.stock.wash,
		foil: values.foil.foil,
		holoPattern: HOLO_PATTERNS.indexOf(values.foil.holoPattern as HoloPattern),
		holoScale: values.foil.holoScale,
		foilPlate: FOIL_PLATES.indexOf(values.foil.foilPlate as FoilPlate),
		plateDepth: values.foil.plateDepth,
		plateScale: values.foil.plateScale,
		plateTone: values.foil.plateTone,
		stain: values.foil.stain
	});
	// Repaints every card's map once the controls settle, rather than on every slider step.
	$effect(() => {
		const options = light;
		const stock = values.stock.stock as Stock | 'era';
		const map = { nameProfile, tuning, stock: stock === 'era' ? undefined : stock };
		// The ring's width is CSS, so its relief is repainted when it changes too.
		void values.edge.ringWidth;
		const timer = setTimeout(() => untrack(() => LightEngine.shared()?.configure(options, map)), 150);
		return () => clearTimeout(timer);
	});
	const cardWidth = $derived(Math.round(values.layout.width));

	let rows = $state.raw<{ era: CardEra; model: CardViewModel }[] | null>(null);
	let failure = $state<string | null>(null);
	let instance = $state(0);

	async function load(): Promise<void> {
		try {
			const manifest = await loadManifest();
			const [media, rankings] = await Promise.all([loadMedia().catch(() => null), loadRankings(manifest.dataVersion).catch(() => null)]);
			const candidates = new Map(manifest.candidates.map(candidate => [candidate.seasonId, candidate]));
			const picks = SEASONS.map(({ seasonId }) => {
				const candidate = candidates.get(seasonId);
				if (!candidate) throw new Error(`${seasonId} is not in the dataset`);
				return { seasonId, franchiseId: candidate.franchiseId, decade: candidate.decade };
			});
			const profiles = await loadDraftProfiles(manifest, { picks } as Parameters<typeof loadDraftProfiles>[1]);
			rows = SEASONS.map(({ era }, index) => {
				const profile = profiles[index]!;
				const slot = profile.eligibleSlots.find(isHitter) ?? profile.eligibleSlots[0]!;
				return { era, model: createCardViewModel({ profile, slot, manifest, media, rankings, mediaStatus: media ? 'ready' : 'unavailable' }) };
			});
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		}
	}
	void load();

	// The real season keeps its stats and photo; only the finish is forced per column.
	const eraPick = (era: CardEra) => (values.eras as Record<CardEra, { holo: HoloPattern; plate: FoilPlate; scale: number; tone: number; stain: number }>)[era];
	const withFinish = (model: CardViewModel, finish: Finish): CardViewModel => ({ ...model, fin: materialFor(finish) });
</script>

<StoryFrame wide onReset={() => instance++}>
	{#if failure}
		<p role="alert">Could not load the gallery seasons: {failure}</p>
	{:else if !rows}
		<p>Loading seasons…</p>
	{:else}
		{#key instance}
			<div class="gallery" style={`--card-width:${cardWidth}px; --finish-ring:${values.edge.ringWidth}`}>
				<span></span>
				{#each finishes as column (column.finish)}<b class="heading">{column.label}</b>{/each}
				{#each rows as row (row.era)}
					<b class="era">{row.era}</b>
					{#each finishes as column (column.finish)}
						<div class="frame"><Card s={withFinish(row.model, column.finish)} film={eraPick(row.era).holo} plate={eraPick(row.era).plate} plateTuning={{ scale: eraPick(row.era).scale, tone: eraPick(row.era).tone, stain: eraPick(row.era).stain }} interactive idle={values.layout.drift} onDetails={() => {}} /></div>
					{/each}
				{/each}
			</div>
		{/key}
		<details class="settings"><summary>Current settings</summary><pre>{JSON.stringify({ nameProfile, ...tuning, ringWidth: values.edge.ringWidth, ...light, holoPattern: values.foil.holoPattern, foilMode: values.foil.foilMode, foilPlate: values.foil.foilPlate, eras: values.eras }, null, 1)}</pre></details>
	{/if}
</StoryFrame>

<style>
	.gallery { display: grid; grid-template-columns: auto repeat(4, var(--card-width)); gap: var(--space-5) var(--space-4); align-items: center; overflow-x: auto; padding-bottom: var(--space-2); }
	.heading { text-align: center; }
	.era { writing-mode: vertical-rl; transform: rotate(180deg); color: var(--muted); }
	.frame { width: var(--card-width); }
	.settings { margin-top: var(--space-5); color: var(--muted); }
	.settings pre { font-size: var(--text-sm); }
</style>
