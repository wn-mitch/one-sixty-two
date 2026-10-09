<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import DraftWorkshop from './DraftWorkshop.svelte';
	import { getExampleSeason, type ExampleSeason } from './season-fixtures.ts';
	import SeasonReveal from './SeasonReveal.svelte';
	import StoryFrame from './StoryFrame.svelte';

	type InitialState = 'computing' | 'partial' | 'replay';

	let {
		initial = 'computing',
		completed = 24,
		revealed = 42
	}: {
		initial?: InitialState;
		completed?: number;
		revealed?: number;
	} = $props();

	let season = $state<ExampleSeason | null>(null);
	let error = $state('');
	let completedState = $state(untrack(() => completed));
	let revealedState = $state(untrack(() => revealed));
	let showDraft = $state(false);
	let computingSkipped = $state(false);
	let instance = $state(0);
	let reveal = $state<SeasonReveal>();
	let observedInitial = untrack(() => initial);
	let observedCompleted = untrack(() => completed);
	let observedRevealed = untrack(() => revealed);
	let loadVersion = 0;

	async function loadSeason(): Promise<void> {
		const version = ++loadVersion;
		error = '';
		try {
			const next = await getExampleSeason();
			if (version !== loadVersion) return;
			season = next;
		} catch (cause) {
			if (version !== loadVersion) return;
			error = cause instanceof Error ? cause.message : 'The example season could not be prepared.';
		}
	}

	function reset(): void {
		completedState = completed;
		revealedState = revealed;
		showDraft = false;
		computingSkipped = false;
		error = '';
		instance += 1;
		if (!season) void loadSeason();
	}

	function skipComputing(): void {
		completedState = 162;
		computingSkipped = true;
		instance += 1;
	}

	function startNewDraft(): void {
		showDraft = true;
		instance += 1;
	}

	function replay(): void {
		reveal?.replay();
	}

	$effect(() => {
		const next = initial;
		if (next === observedInitial) return;
		observedInitial = next;
		untrack(reset);
	});

	$effect(() => {
		const next = completed;
		if (next === observedCompleted) return;
		observedCompleted = next;
		completedState = next;
		instance += 1;
	});

	$effect(() => {
		const next = revealed;
		if (next === observedRevealed) return;
		observedRevealed = next;
		revealedState = next;
		instance += 1;
	});

	loadSeason();
	onDestroy(() => { loadVersion += 1; });
</script>

<StoryFrame onReset={reset} onReplay={initial === 'replay' && season ? replay : undefined}>
	{#if error}
		<p class="example-error" role="alert">{error}</p>
	{:else if !season}
		<p class="example-loading" role="status">Preparing the synthetic 162-game result…</p>
	{:else if showDraft}
		{#key instance}
			<DraftWorkshop initial="ready" embedded />
		{/key}
	{:else if initial === 'computing' && !computingSkipped}
		{#key instance}
			<SeasonReveal
				result={null}
				draft={season.draft}
				profiles={season.profiles}
				manifest={season.manifest}
				rankings={season.rankings}
				completed={completedState}
				onSkipComputing={skipComputing}
				onNew={startNewDraft}
			/>
		{/key}
	{:else}
		{#key instance}
			<SeasonReveal
				bind:this={reveal}
				result={season.result}
				draft={season.draft}
				profiles={season.profiles}
				manifest={season.manifest}
				rankings={season.rankings}
				initialRevealed={computingSkipped ? 162 : initial === 'partial' ? revealedState : 0}
				autoReveal={initial === 'replay'}
				onNew={startNewDraft}
			/>
		{/key}
	{/if}
</StoryFrame>

<style>
	.example-loading, .example-error { margin: var(--space-6) 0; }
	.example-error { color: var(--error); }
</style>
