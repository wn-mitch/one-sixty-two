<script module lang="ts">
	export interface StadiumWorkshopProps {
		initial?: 'choosing' | 'selected' | 'busy';
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import StadiumDeck from '#lib/components/StadiumDeck.svelte';
	import { createExampleFixtures } from './fixtures.ts';
	import { stadiumManifest } from './stadium-fixtures.ts';
	import StoryFrame from './StoryFrame.svelte';

	let { initial = 'choosing' }: StadiumWorkshopProps = $props();
	const manifest = stadiumManifest(createExampleFixtures().manifest);
	const preselected = manifest.stadiums.find(stadium => stadium.franchiseId === 'BOS')?.ref.id ?? manifest.stadiums[0].ref.id;
	let busy = $state(untrack(() => initial) === 'busy');
	let chosen = $state<string | null>(null);
	let instance = $state(0);

	function reset(): void {
		busy = initial === 'busy';
		chosen = null;
		instance += 1;
	}

	function select(stadiumId: string): void {
		chosen = manifest.stadiums.find(stadium => stadium.ref.id === stadiumId)?.name ?? stadiumId;
		busy = true;
	}
</script>

<StoryFrame onReset={reset} fixtureNotice="Real 2025 reference parks from the stadium catalog. Nothing is saved; choosing a park only reports it here.">
	{#if chosen}<p class="chosen" role="status">Drafting at {chosen}</p>{/if}
	{#key instance}
		<StadiumDeck {manifest} {busy} initialSelected={initial === 'choosing' ? '' : preselected} onSelect={select} />
	{/key}
</StoryFrame>

<style>
	.chosen { margin: 0 0 var(--space-4); color: var(--accent); font-weight: 650; }
</style>
