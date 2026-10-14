<script module lang="ts">
	import type { CardEra } from '#lib/cards/view-model.ts';
	import type { ExampleCardFinish } from './fixtures.ts';

	export interface SurfaceWorkshopProps {
		era?: CardEra;
		finish?: ExampleCardFinish;
		width?: number;
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { createDialKitController } from 'dialkit/svelte';
	import Card from '#lib/cards/Card.svelte';
	import { LightEngine } from '#lib/cards/surface/card-light.ts';
	import { RELIEF_PROFILES, type ReliefProfile } from '#lib/cards/surface/surfaces.ts';
	import { createCardViewModel } from '#lib/cards/view-model.ts';
	import type { Profile } from '#lib/game/types.ts';
	import { createExampleMedia } from './media-fixtures.ts';
	import { createExampleFixtures, getExampleFinishRanking } from './fixtures.ts';
	import StoryFrame from './StoryFrame.svelte';

	let { era = '1990s', finish = 'emboss', width = 300 }: SurfaceWorkshopProps = $props();

	const eraYear: Record<CardEra, number> = { '1950s': 1955, '1960s': 1965, '1970s': 1975, '1980s': 1985, '1990s': 1995, '2000s': 2005, '2010s': 2015, '2020s': 2025 };
	const eras = Object.keys(eraYear) as CardEra[];
	const dials = createDialKitController('Card surface', untrack(() => ({
		era: { type: 'select' as const, options: eras, default: era },
		finish: { type: 'select' as const, options: ['base', 'foil', 'emboss', 'gem'], default: finish },
		width: [width, 180, 420, 1] as [number, number, number, number],
		relief: [6, 1, 18, 0.5] as [number, number, number, number],
		lightHeight: [3.2, 0.6, 8, 0.1] as [number, number, number, number],
		drift: true,
		staticFinish: false
	})));

	const fixtures = createExampleFixtures();
	const media = createExampleMedia();
	const source = (() => {
		const pick = fixtures.completeDraft.picks.find(entry => entry.slot === '2B');
		const profile = fixtures.profiles.find(entry => entry.seasonId === pick?.seasonId);
		if (!profile) throw new Error('Example fixture is missing 2B');
		return profile;
	})();

	const previewEra = $derived(dials.values.era as CardEra);
	const previewFinish = $derived(dials.values.finish as ExampleCardFinish);
	const cardWidth = $derived(Math.round(dials.values.width));
	const card = $derived.by(() => {
		const year = eraYear[previewEra];
		const profile: Profile = { ...source, year, seasonId: `storybook-surface:${year}:AL:T`, eligibleSlots: ['2B'], primaryHitterSlot: '2B', pitching: undefined, pitchingRates: undefined };
		return createCardViewModel({ profile, slot: '2B', ranking: getExampleFinishRanking('hitter', previewFinish), media, mediaStatus: 'ready', manifest: fixtures.manifest });
	});

	const labels: Record<ReliefProfile, string> = {
		pillow: 'Pillow emboss',
		groove: 'Engraved groove',
		etched: 'Etched foil'
	};
	const notes: Record<ReliefProfile, string> = {
		pillow: 'Pressed up from behind; soft rounded letters.',
		groove: 'Letters cut into the card, catching shade on the light side.',
		etched: 'Raised letters with fine lines that streak as the light moves.'
	};

	let instance = $state(0);
	$effect(() => {
		const options = { relief: dials.values.relief, lightHeight: dials.values.lightHeight };
		untrack(() => LightEngine.shared()?.configure(options));
	});
</script>

<StoryFrame wide onReset={() => instance++}>
	<p class="lede">Each card shapes its raised name differently. Move the pointer over a card to tilt it under the light; drift keeps the light moving on its own. Relief and light height apply to every card. Names are raised from Foil + emboss up, so pick that tier or Gem to compare profiles.</p>
	{#key instance}
		<div class="surfaces" class:static-finish={dials.values.staticFinish} style={`--card-width:${cardWidth}px`}>
			{#each RELIEF_PROFILES as profile (profile)}
				<figure>
					<div class="frame"><Card s={card} interactive idle={dials.values.drift} nameProfile={profile} onDetails={() => {}} /></div>
					<figcaption><b>{labels[profile]}</b><span>{notes[profile]}</span></figcaption>
				</figure>
			{/each}
		</div>
	{/key}
</StoryFrame>

<style>
	.lede { max-width: 60ch; margin: 0 0 var(--space-5); color: var(--muted); }
	.surfaces { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--card-width), 1fr)); gap: var(--space-6); }
	figure { margin: 0; display: grid; gap: var(--space-3); justify-items: center; }
	.frame { width: var(--card-width); max-width: 100%; }
	figcaption { display: grid; gap: var(--space-1); max-width: var(--card-width); text-align: center; }
	figcaption span { color: var(--muted); font-size: var(--text-sm); }
	/* Hides the WebGL light so the static finish shows alone. */
	.static-finish :global(canvas.light) { visibility: hidden; }
</style>
