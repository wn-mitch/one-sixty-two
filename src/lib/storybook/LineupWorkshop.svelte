<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import Lineup from '#lib/components/Lineup.svelte';
	import { reassignPick } from '#lib/game/draft.ts';
	import { classicLineupView } from '#lib/game/lineup-view.ts';
	import { validateReliefRoles, type Draft, type HitterSlot, type ReliefAssignment } from '#lib/game/types.ts';
	import { simulateSeason } from '#lib/engine/core.ts';
	import { prepareSeasonInput } from '#lib/game/season-input.ts';
	import type { SeasonResult } from '#lib/sim/types.ts';
	import { createExampleFixtures, type ExampleFixtures } from './fixtures.ts';
	import SeasonReveal from './SeasonReveal.svelte';
	import StoryFrame from './StoryFrame.svelte';
	import DraftWorkshop from './DraftWorkshop.svelte';

	let { busy = false, missingProfile = false }: { busy?: boolean; missingProfile?: boolean } = $props();

	let fixtures = $state<ExampleFixtures>(createExampleFixtures());
	let draft = $state<Draft>(untrack(() => fixtures.completeDraft));
	let result = $state<SeasonResult | null>(null);
	let simulating = $state(false);
	let error = $state('');
	let instance = $state(0);
	let showDraft = $state(false);
	let reveal = $state<SeasonReveal>();
	let simulationVersion = 0;

	let missingSeasonId = $derived(draft.picks[0]?.seasonId ?? '');
	let selectedProfiles = $derived.by(() => {
		const selected = new Set(draft.picks.map(pick => pick.seasonId));
		return fixtures.profiles.filter(profile => selected.has(profile.seasonId));
	});
	let profiles = $derived(missingProfile
		? selectedProfiles.filter((profile) => profile.seasonId !== missingSeasonId)
		: selectedProfiles
	);
	let effectiveBusy = $derived(busy || simulating);

	function reset(): void {
		simulationVersion += 1;
		fixtures = createExampleFixtures();
		draft = fixtures.completeDraft;
		result = null;
		simulating = false;
		error = '';
		showDraft = false;
		instance += 1;
	}

	function updateOrder(kind: 'batting' | 'starter', order: string[]): void {
		if (effectiveBusy) return;
		draft = kind === 'batting'
			? { ...draft, battingOrder: [...order] }
			: { ...draft, starterOrder: [...order] };
		error = '';
	}

	function updateRoles(reliefRoles: ReliefAssignment[]): void {
		if (effectiveBusy) return;
		draft = { ...draft, reliefRoles: validateReliefRoles(reliefRoles, true) };
		error = '';
	}

	function reassign(seasonId: string, destination: HitterSlot): void {
		if (effectiveBusy) return;
		try {
			draft = reassignPick(draft, fixtures.manifest, seasonId, destination);
			error = '';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not change the example assignment.';
		}
	}

	async function simulate(): Promise<void> {
		if (effectiveBusy) return;
		const version = ++simulationVersion;
		simulating = true;
		error = '';
		await tick();
		if (version !== simulationVersion) return;
		try {
			const input = prepareSeasonInput(draft, profiles, fixtures.simulationData);
			result = simulateSeason(input);
			if (version !== simulationVersion) return;
			instance += 1;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'The example season could not be simulated.';
		} finally {
			simulating = false;
		}
	}

	function startNewDraft(): void {
		simulationVersion += 1;
		showDraft = true;
		result = null;
		error = '';
		instance += 1;
	}

	function replay(): void {
		reveal?.replay();
	}

	onDestroy(() => { simulationVersion += 1; });
</script>

<StoryFrame onReset={reset} onReplay={result ? replay : undefined} wide>
	{#if showDraft}
		{#key instance}
			<DraftWorkshop initial="ready" embedded />
		{/key}
	{:else if result}
		{#key instance}
			<SeasonReveal
				bind:this={reveal}
				{result}
				{draft}
				{profiles}
				manifest={fixtures.manifest}
				rankings={fixtures.rankings}
				autoReveal
				onNew={startNewDraft}
			/>
		{/key}
	{:else}
		{#key instance}
			<Lineup
				lineup={classicLineupView(draft, fixtures.manifest, profiles)}
				manifest={fixtures.manifest}
				{profiles}
				rankings={fixtures.rankings}
				rankingLoading={false}
				rankingError={false}
				busy={effectiveBusy}
				onMove={(seasonId, slot) => reassign(seasonId, slot as HitterSlot)}
				onOrder={updateOrder}
				onRoles={roles => updateRoles(roles as ReliefAssignment[])}
				onsimulate={simulate}
			/>
		{/key}
	{/if}
	{#if error}<p class="example-error" role="alert">{error}</p>{/if}
</StoryFrame>

<style>
	.example-error { margin-top: var(--space-4); color: var(--error); }
</style>
