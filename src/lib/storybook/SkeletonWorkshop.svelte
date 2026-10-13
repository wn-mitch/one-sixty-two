<script module lang="ts">
	export type SkeletonScreen = 'stadium' | 'draft-pack' | 'draft-pool' | 'lineup' | 'season' | 'results' | 'draft-mode';
	export interface SkeletonWorkshopProps {
		screen?: SkeletonScreen;
		/** Draws the skeleton; with `loaded` too, it lies over the loaded screen. */
		skeleton?: boolean;
		loaded?: boolean;
	}
</script>

<script lang="ts">
	import DraftEntry from '#lib/components/draft-mode/DraftEntry.svelte';
	import DraftModeSkeleton from '#lib/components/skeletons/DraftModeSkeleton.svelte';
	import DraftSkeleton from '#lib/components/skeletons/DraftSkeleton.svelte';
	import LineupSkeleton from '#lib/components/skeletons/LineupSkeleton.svelte';
	import ProgressSkeleton from '#lib/components/skeletons/ProgressSkeleton.svelte';
	import ResultsSkeleton from '#lib/components/skeletons/ResultsSkeleton.svelte';
	import StadiumSkeleton from '#lib/components/skeletons/StadiumSkeleton.svelte';
	import DraftWorkshop from './DraftWorkshop.svelte';
	import LineupWorkshop from './LineupWorkshop.svelte';
	import ResultsWorkshop from './ResultsWorkshop.svelte';
	import SimulationWorkshop from './SimulationWorkshop.svelte';
	import StadiumWorkshop from './StadiumWorkshop.svelte';
	import StoryFrame from './StoryFrame.svelte';
	import { createExampleFixtures } from './fixtures.ts';
	import { stadiumManifest } from './stadium-fixtures.ts';

	/**
	 * Each screen's skeleton beside the screen it stands in for, in the same frame. With both shown, the skeleton
	 * lies over the loaded screen so any jump between the two shows as a misaligned outline.
	 */
	let { screen = 'draft-pack', skeleton = true, loaded = true }: SkeletonWorkshopProps = $props();
	const franchises = stadiumManifest(createExampleFixtures().manifest).franchises;
	// Each skeleton sits in the frame its loaded workshop uses, so both start at the same point.
	const wide = $derived(screen !== 'stadium' && screen !== 'season' && screen !== 'draft-mode');
	const notice = $derived(screen === 'stadium' ? 'Real 2025 reference parks from the stadium catalog. Nothing is saved; choosing a park only reports it here.' : undefined);
</script>

<div class="skeleton-workshop" class:overlay={skeleton && loaded} data-screen={screen}>
	{#if loaded}
		<div class="loaded">
			{#if screen === 'stadium'}<StadiumWorkshop />
			{:else if screen === 'draft-pack'}<DraftWorkshop initial="ready" />
			{:else if screen === 'draft-pool'}<DraftWorkshop initial="choosing" />
			{:else if screen === 'lineup'}<LineupWorkshop />
			{:else if screen === 'season'}<SimulationWorkshop initial="computing" />
			{:else if screen === 'results'}<ResultsWorkshop initial="complete" />
			{:else}<StoryFrame onReset={() => {}}><DraftEntry {franchises} refused="" busy={false} onStart={() => {}} /></StoryFrame>
			{/if}
		</div>
	{/if}
	{#if skeleton}
		<div class="skeleton-layer">
			<StoryFrame onReset={() => {}} {wide} fixtureNotice={notice}>
				{#if screen === 'stadium'}<StadiumSkeleton />
				{:else if screen === 'draft-pack'}<DraftSkeleton />
				{:else if screen === 'draft-pool'}<DraftSkeleton pool />
				{:else if screen === 'lineup'}<LineupSkeleton />
				{:else if screen === 'season'}<ProgressSkeleton />
				{:else if screen === 'results'}<ResultsSkeleton />
				{:else}<DraftModeSkeleton />
				{/if}
			</StoryFrame>
		</div>
	{/if}
</div>

<style>
	.skeleton-workshop { position: relative; }
	.overlay .skeleton-layer { position: absolute; inset: 0; z-index: 20; opacity: .6; pointer-events: none; }
</style>
