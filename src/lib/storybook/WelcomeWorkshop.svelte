<script module lang="ts">
	export interface WelcomeWorkshopProps {
		initial?: 'start' | 'resume' | 'loading';
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import Welcome from '#lib/components/Welcome.svelte';
	import { createCardViewModel } from '#lib/cards/view-model.ts';
	import type { CardEra } from '#lib/cards/view-model.ts';
	import { createExampleFixtures } from './fixtures.ts';
	import { createExampleMedia } from './media-fixtures.ts';
	import DraftWorkshop from './DraftWorkshop.svelte';
	import StoryFrame from './StoryFrame.svelte';

	let { initial = 'start' }: WelcomeWorkshopProps = $props();
	const fixtures = createExampleFixtures();
	const media = createExampleMedia();
	const eras: CardEra[] = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
	const slots = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const;
	const cards = eras.map((era, index) => {
		const source = fixtures.profiles.find(profile => profile.primaryHitterSlot === slots[index])!;
		const year = Number.parseInt(era, 10) + 5;
		const profile = { ...source, year, seasonId: `${source.playerId}:${year}:AL:T`, pitching: undefined, pitchingRates: undefined };
		return {
			seasonId: profile.seasonId,
			playerId: profile.playerId,
			model: createCardViewModel({ profile, slot: slots[index], manifest: fixtures.manifest, media, mediaStatus: 'ready' })
		};
	});
	let screen = $state<'welcome' | 'ready' | 'partial'>('welcome');
	let instance = $state(0);
	let observedInitial = untrack(() => initial);

	function reset(): void {
		screen = 'welcome';
		instance += 1;
	}
	$effect(() => {
		const nextInitial = initial;
		untrack(() => {
			if (nextInitial !== observedInitial) { observedInitial = nextInitial; reset(); }
		});
	});
</script>

<StoryFrame onReset={reset} wide>
	{#key instance}
		{#if screen === 'welcome'}
			<Welcome manifest={fixtures.manifest} loading={initial === 'loading'} hasSavedDraft={initial === 'resume'} {cards}
				onStart={() => screen = 'ready'} onResume={() => screen = 'partial'} />
		{:else}
			<DraftWorkshop initial={screen} embedded />
		{/if}
	{/key}
</StoryFrame>
